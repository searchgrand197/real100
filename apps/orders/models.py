"""Orders: server cart, coupons, orders with stock reservation, GST totals.

Money is Decimal rupees. Stock is reserved (decremented) at checkout
inside a transaction and restored on cancel / failed prepaid payment.
"""
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.catalog.models import ProductVariant

ORDER_STATUS = [
    ("placed", "Placed"),
    ("confirmed", "Confirmed"),
    ("packed", "Packed"),
    ("shipped", "Shipped"),
    ("delivered", "Delivered"),
    ("cancelled", "Cancelled"),
    ("refunded", "Refunded"),
    ("rto", "Returned to origin"),
]
PAYMENT_METHOD = [("cod", "Cash on delivery"), ("prepaid", "Prepaid (Razorpay)")]
PAYMENT_STATUS = [
    ("pending", "Pending"),
    ("paid", "Paid"),
    ("failed", "Failed"),
    ("refunded", "Refunded"),
]


class Coupon(models.Model):
    code = models.CharField(max_length=30, unique=True)
    discount_type = models.CharField(max_length=10, choices=[("percent", "%"), ("flat", "Flat ₹")])
    value = models.DecimalField(max_digits=10, decimal_places=2)
    min_order_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_discount = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    valid_from = models.DateTimeField(blank=True, null=True)
    valid_to = models.DateTimeField(blank=True, null=True)
    usage_limit = models.PositiveIntegerField(blank=True, null=True)
    used_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.code

    def discount_for(self, subtotal):
        if subtotal < self.min_order_value:
            return Decimal("0")
        if self.discount_type == "percent":
            d = subtotal * self.value / Decimal("100")
            return min(d, self.max_discount) if self.max_discount else d
        return min(self.value, subtotal)


class Cart(models.Model):
    """One cart per user, or per session key for guests."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    session_key = models.CharField(max_length=64, blank=True, null=True, unique=True)
    updated_at = models.DateTimeField(auto_now=True)


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = [("cart", "variant")]


class Order(models.Model):
    order_number = models.CharField(max_length=20, unique=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=ORDER_STATUS, default="placed")
    payment_method = models.CharField(max_length=10, choices=PAYMENT_METHOD, default="cod")
    payment_status = models.CharField(max_length=10, choices=PAYMENT_STATUS, default="pending")
    coupon = models.ForeignKey(Coupon, on_delete=models.SET_NULL, null=True, blank=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    shipping_charge = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Address snapshot (frozen at order time)
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=6)
    gift_message = models.CharField(max_length=300, blank=True)
    notes = models.CharField(max_length=300, blank=True)
    razorpay_order_id = models.CharField(max_length=100, blank=True)
    razorpay_payment_id = models.CharField(max_length=100, blank=True)
    delhivery_awb = models.CharField(max_length=60, blank=True)
    total_weight_grams = models.PositiveIntegerField(default=0)
    # Review invite: a signed link lets the buyer (or a gift recipient)
    # review the order's products without logging in. Sent only after
    # delivery + 3 days (see `send_review_invites` command).
    review_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    review_invite_sent_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.order_number

    def save(self, *args, **kwargs):
        if not self.order_number:
            last = Order.objects.order_by("-id").first()
            self.order_number = f"ORD{(last.id + 1) if last else 1:06d}"
        super().save(*args, **kwargs)


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT)
    product_name = models.CharField(max_length=200)
    size_label = models.CharField(max_length=60)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.product_name} — {self.size_label} x{self.quantity}"


class Replacement(models.Model):
    '''Component-only replacement for a leaked/damaged jar. Food is
    non-returnable, so a damaged combo item is replaced, not returned —
    and only the damaged component ships, never the whole combo.'''
    REASONS = [("leaked", "Leaked"), ("damaged", "Damaged"), ("wrong_item", "Wrong item"), ("other", "Other")]
    STATUS = [("requested", "Requested"), ("approved", "Approved"), ("shipped", "Shipped"), ("rejected", "Rejected")]
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="replacements")
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name="replacements")
    reason = models.CharField(max_length=20, choices=REASONS, default="leaked")
    note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default="requested")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Replacement for {self.order_item} ({self.status})"


class OrderStatusLog(models.Model):
    """Audit trail: who changed an order's status and when."""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="status_logs")
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
