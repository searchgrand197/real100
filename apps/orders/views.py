"""Cart + checkout + orders.

Checkout is atomic: stock is reserved (decremented) only when the
order is created. COD orders are placed immediately; prepaid orders
get a Razorpay order first and are confirmed by the webhook.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Address
from apps.catalog.models import ProductVariant

from .emails import send_order_event_email_async, send_replacement_email_async
from .models import Cart, CartItem, Coupon, Order, OrderItem, OrderStatusLog
from .payments import create_razorpay_order
from .serializers import CartItemSerializer, CheckoutSerializer, CouponSerializer, OrderSerializer
from .shipping import check_serviceability, track_awb

FREE_SHIPPING_ABOVE = Decimal("1499")
SHIPPING_FLAT = Decimal("79")


def _merge_guest_cart(cart, session_key):
    """A guest fills the cart, then logs in. Keep those lines."""
    if not session_key:
        return
    guest = Cart.objects.filter(session_key=session_key).exclude(pk=cart.pk).first()
    if not guest:
        return
    for item in list(guest.items.all()):
        existing = cart.items.filter(variant=item.variant).first()
        if existing:
            existing.quantity = item.quantity
            existing.save()
            item.delete()
        else:
            item.cart = cart
            item.save()
    guest.delete()


def _guest_key(request):
    """Prefer the storefront cart key. Fall back to the Django session."""
    key = (request.headers.get("X-Cart-Key") or "").strip()[:64]
    if key:
        return key
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key


def _get_cart(request):
    if request.user.is_authenticated:
        cart, _ = Cart.objects.get_or_create(user=request.user)
        _merge_guest_cart(cart, _guest_key(request))
        return cart
    cart, _ = Cart.objects.get_or_create(session_key=_guest_key(request))
    return cart


def _expand_for_stock(variant, qty):
    """(variant, qty) pairs whose stock is actually consumed. A combo
    expands to its components; a pre-order needs no stock at all."""
    if variant.product.is_preorder:
        return []
    if variant.is_combo:
        return [(c.component_variant, qty * c.quantity) for c in variant.components.all()]
    return [(variant, qty)]


def _consume_stock_fifo(variant, qty):
    """Decrement variant stock + oldest-expiring batches first (FIFO)."""
    from apps.catalog.models import Batch

    remaining = qty
    for batch in Batch.objects.filter(variant=variant, quantity__gt=0).order_by("expires_on"):
        if remaining <= 0:
            break
        take = min(batch.quantity, remaining)
        Batch.objects.filter(pk=batch.pk).update(quantity=F("quantity") - take)
        remaining -= take
    ProductVariant.objects.filter(pk=variant.pk).update(stock=F("stock") - qty)


class CartView(APIView):
    """GET cart; POST {"variant": id, "quantity": n} to add/update; DELETE ?variant=id."""

    def get(self, request):
        cart = _get_cart(request)
        items = CartItemSerializer(cart.items.select_related("variant__product"), many=True).data
        total = sum(Decimal(str(i["price"])) * i["quantity"] for i in items)
        return Response({"items": items, "subtotal": total})

    def post(self, request):
        variant = generics.get_object_or_404(ProductVariant, pk=request.data.get("variant"))
        qty = int(request.data.get("quantity", 1))
        if qty < 1 or (not variant.product.is_preorder and qty > variant.available_stock):
            return Response({"detail": "Quantity not available."}, status=status.HTTP_400_BAD_REQUEST)
        cart = _get_cart(request)
        item, _ = CartItem.objects.get_or_create(cart=cart, variant=variant, defaults={"quantity": qty})
        item.quantity = qty
        item.save()
        return Response(CartItemSerializer(item).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        cart = _get_cart(request)
        cart.items.filter(variant_id=request.query_params.get("variant")).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CouponValidateView(APIView):
    def post(self, request):
        coupon = generics.get_object_or_404(Coupon, code__iexact=request.data.get("code", ""), is_active=True)
        return Response(CouponSerializer(coupon).data)


class CheckoutView(APIView):
    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        cart = _get_cart(request)
        items = list(cart.items.select_related("variant__product"))
        if not items:
            return Response({"detail": "Cart is empty."}, status=status.HTTP_400_BAD_REQUEST)

        # Address: saved address or inline fields. Email is the one saved
        # with the address (also copied onto the user account).
        if data.get("address_id"):
            if not request.user.is_authenticated:
                return Response({"detail": "Login to use a saved address."}, status=status.HTTP_401_UNAUTHORIZED)
            addr = generics.get_object_or_404(Address, pk=data["address_id"], user=request.user)
            addr_data = {f: getattr(addr, f) for f in
                         ["name", "phone", "email", "address_line1", "address_line2", "city", "state", "pincode"]}
        else:
            addr_data = {k: data.get(k, "") for k in
                         ["name", "phone", "email", "address_line1", "address_line2", "city", "state", "pincode"]}
            if not all(addr_data[k] for k in ["name", "phone", "address_line1", "city", "state", "pincode"]):
                return Response({"detail": "Full delivery address is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not addr_data.get("email") and request.user.is_authenticated:
            addr_data["email"] = request.user.email or ""

        coupon = None
        if data.get("coupon_code"):
            coupon = Coupon.objects.filter(code__iexact=data["coupon_code"], is_active=True).first()

        subtotal = sum(i.variant.price * i.quantity for i in items)
        discount = coupon.discount_for(subtotal) if coupon else Decimal("0")
        shipping = Decimal("0") if subtotal - discount >= FREE_SHIPPING_ABOVE else SHIPPING_FLAT
        # GST is included in the listed prices (tax-inclusive), so tax is shown for the invoice.
        tax = (subtotal - discount) * Decimal("0.05") / Decimal("1.05")
        total = subtotal - discount + shipping
        total_weight = sum(i.variant.weight_grams * i.quantity for i in items)

        with transaction.atomic():
            # Reserve stock: lock the rows, expand combos to components,
            # decrement component stock FIFO. Pre-orders skip the check.
            for i in items:
                for variant, needed in _expand_for_stock(i.variant, i.quantity):
                    locked = ProductVariant.objects.select_for_update().get(pk=variant.pk)
                    if locked.stock < needed:
                        raise ValueError(f"Out of stock: {locked}")
                    _consume_stock_fifo(locked, needed)
            order = Order.objects.create(
                user=request.user if request.user.is_authenticated else None,
                payment_method=data["payment_method"],
                coupon=coupon,
                subtotal=subtotal, discount=discount, shipping_charge=shipping,
                tax=tax.quantize(Decimal("0.01")), total=total,
                total_weight_grams=total_weight,
                gift_message=data.get("gift_message", ""), notes=data.get("notes", ""), **addr_data,
            )
            for i in items:
                OrderItem.objects.create(
                    order=order, variant=i.variant, product_name=i.variant.product.name,
                    size_label=i.variant.size_label, price=i.variant.price, quantity=i.quantity,
                )
            if coupon:
                Coupon.objects.filter(pk=coupon.pk).update(used_count=F("used_count") + 1)
            cart.items.all().delete()

        if data["payment_method"] == "prepaid":
            try:
                rz = create_razorpay_order(int(total * 100), order.order_number)
            except ValueError as exc:
                return Response({"detail": str(exc), "order": OrderSerializer(order).data},
                                status=status.HTTP_503_SERVICE_UNAVAILABLE)
            order.razorpay_order_id = rz["id"]
            order.save(update_fields=["razorpay_order_id"])
            return Response({"order": OrderSerializer(order).data, "razorpay_order": rz},
                            status=status.HTTP_201_CREATED)
        send_order_event_email_async(order.id, "placed")
        return Response({"order": OrderSerializer(order).data}, status=status.HTTP_201_CREATED)


class OrderListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items")


class OrderDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items")


class OrderCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        order = generics.get_object_or_404(Order, pk=pk, user=request.user)
        if order.status not in ("placed", "confirmed"):
            return Response({"detail": "Order can no longer be cancelled."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            for item in order.items.all():
                # Restore the stock that was actually consumed: components
                # for a combo, the variant itself otherwise.
                for variant, needed in _expand_for_stock(item.variant, item.quantity):
                    ProductVariant.objects.filter(pk=variant.pk).update(stock=F("stock") + needed)
            previous = order.status
            order.status = "cancelled"
            order.save(update_fields=["status"])
            OrderStatusLog.objects.create(
                order=order, changed_by=request.user, from_status=previous, to_status="cancelled"
            )
        send_order_event_email_async(order.id, "cancelled")
        return Response(OrderSerializer(order).data)


class ServiceabilityView(APIView):
    """GET ?pincode=…&weight_grams=… — serviceability is weight-aware:
    a heavy combo may be unserviceable where a single jar is fine."""

    def get(self, request):
        pincode = request.query_params.get("pincode", "")
        try:
            weight = int(request.query_params.get("weight_grams", 0) or 0)
        except ValueError:
            weight = 0
        try:
            return Response({
                "pincode": pincode,
                "weight_grams": weight,
                "serviceable": check_serviceability(pincode, weight),
            })
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class ReplacementCreateView(APIView):
    """POST /api/orders/<pk>/replacements/ {"order_item": id, "reason": "leaked", "note": "..."}
    Requests a component-only replacement for a damaged/leaked jar."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        from .serializers import ReplacementSerializer

        order = generics.get_object_or_404(Order, pk=pk, user=request.user)
        serializer = ReplacementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = generics.get_object_or_404(OrderItem, pk=serializer.validated_data["order_item"].pk, order=order)
        replacement = serializer.save(order=order, order_item=item)
        send_replacement_email_async(replacement.id)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ReviewInviteView(APIView):
    """GET /api/review-invite/<uuid:token>/ — what this (possibly gifted)
    order can review: the ordered products plus their components."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        from apps.catalog.models import ComboComponent, Product

        order = generics.get_object_or_404(Order, review_token=token)
        product_ids = set()
        for item in order.items.select_related("variant__product"):
            product_ids.add(item.variant.product_id)
            component_ids = ComboComponent.objects.filter(
                combo_variant=item.variant
            ).values_list("component_variant__product_id", flat=True)
            product_ids.update(component_ids)
        products = Product.objects.filter(id__in=product_ids)
        return Response({
            "order_number": order.order_number,
            "status": order.status,
            "can_review": order.status == "delivered",
            "products": [{"slug": p.slug, "name": p.name} for p in products],
        })


class TrackingView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        order = generics.get_object_or_404(Order, pk=pk, user=request.user)
        if not order.delhivery_awb:
            return Response({
                "status": order.status,
                "awb": "",
                "courier": "",
                "detail": "Not shipped yet. Current status: " + order.status + ".",
            })
        try:
            return Response(track_awb(order.delhivery_awb))
        except ValueError:
            return Response({
                "status": order.status,
                "awb": order.delhivery_awb,
                "courier": "Delhivery",
                "detail": "Courier tracking is not connected yet. Current status: " + order.status + ".",
            })


class RazorpayWebhookView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from .payments import verify_webhook_signature

        signature = request.headers.get("X-Razorpay-Signature", "")
        try:
            verify_webhook_signature(request.body, signature)
        except Exception:
            return Response({"detail": "Bad signature."}, status=status.HTTP_400_BAD_REQUEST)
        event = request.data.get("event", "")
        payload = request.data.get("payload", {}).get("payment", {}).get("entity", {})
        if event == "payment.captured":
            order = Order.objects.filter(razorpay_order_id=payload.get("order_id")).first()
            if order and order.payment_status != "paid":
                previous = order.status
                order.payment_status = "paid"
                order.razorpay_payment_id = payload.get("id", "")
                order.status = "confirmed"
                order.save(update_fields=["payment_status", "razorpay_payment_id", "status"])
                OrderStatusLog.objects.create(
                    order=order, from_status=previous, to_status="confirmed", note="Razorpay payment captured"
                )
                send_order_event_email_async(order.id, "confirmed")
        return Response({"status": "ok"})
