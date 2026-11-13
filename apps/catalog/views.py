"""Public catalog API: categories, products (search/filter), reviews.

Reviews for a combo aggregate its own approved reviews plus the approved
reviews of its component products (one level), each tagged with its source
product. The rating summary is a weighted average over all of them.
"""
from django.db.models import Avg, Count, Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from .models import Category, Product, Review
from .serializers import CategorySerializer, ProductSerializer, ReviewSerializer


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer


class ProductListView(generics.ListAPIView):
    serializer_class = ProductSerializer

    def get_queryset(self):
        qs = Product.objects.filter(is_active=True).prefetch_related("variants", "images")
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category__slug=category)
        if self.request.query_params.get("featured") == "1":
            qs = qs.filter(is_featured=True)
        if self.request.query_params.get("bestseller") == "1":
            qs = qs.filter(is_bestseller=True)
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(description__icontains=q))
        return qs


class ProductDetailView(generics.RetrieveAPIView):
    queryset = Product.objects.filter(is_active=True).prefetch_related("variants", "images")
    serializer_class = ProductSerializer
    lookup_field = "slug"


def component_products(product):
    """Products that make up this product's combos (one level, no recursion)."""
    from apps.catalog.models import ComboComponent

    variant_ids = product.variants.values_list("id", flat=True)
    component_variant_ids = ComboComponent.objects.filter(
        combo_variant_id__in=variant_ids
    ).values_list("component_variant_id", flat=True)
    from apps.catalog.models import ProductVariant

    product_ids = ProductVariant.objects.filter(id__in=component_variant_ids).values_list("product_id", flat=True)
    return Product.objects.filter(id__in=product_ids).exclude(id=product.id)


def rating_summary(product):
    """Weighted average over own + component approved reviews."""
    products = [product, *list(component_products(product))]
    agg = Review.objects.filter(product__in=products, is_approved=True).aggregate(
        average=Avg("rating"), count=Count("id")
    )
    own = Review.objects.filter(product=product, is_approved=True).count()
    return {
        "average": round(agg["average"], 1) if agg["average"] else None,
        "count": agg["count"],
        "own_count": own,
        "component_count": agg["count"] - own,
    }


def order_contains_product(order, product):
    """True if the order has the product directly, or a combo containing it."""
    from apps.catalog.models import ComboComponent

    for item in order.items.select_related("variant__product"):
        if item.variant.product_id == product.id:
            return True
        component_product_ids = ComboComponent.objects.filter(
            combo_variant=item.variant
        ).values_list("component_variant__product_id", flat=True)
        if product.id in component_product_ids:
            return True
    return False


class ReviewListCreateView(generics.ListCreateAPIView):
    serializer_class = ReviewSerializer
    permission_classes = [permissions.AllowAny]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["requested_slug"] = self.kwargs["slug"]
        return ctx

    def get_queryset(self):
        product = generics.get_object_or_404(Product, slug=self.kwargs["slug"])
        products = [product, *list(component_products(product))]
        return Review.objects.filter(product__in=products, is_approved=True).select_related("product")

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        product = generics.get_object_or_404(Product, slug=self.kwargs["slug"])
        data = response.data
        if isinstance(data, dict):
            data["rating_summary"] = rating_summary(product)
        return response

    def perform_create(self, serializer):
        from apps.orders.models import Order

        product = generics.get_object_or_404(Product, slug=self.kwargs["slug"])
        user = self.request.user if self.request.user.is_authenticated else None
        token = self.request.data.get("review_token")
        order = None
        is_verified = False

        if token:
            # Gift-recipient / no-login review via the order's invite link.
            order = Order.objects.filter(review_token=token).first()
            if order and order.status == "delivered" and order_contains_product(order, product):
                is_verified = True
                if order.user:
                    user = order.user
        elif user:
            delivered = Order.objects.filter(user=user, status="delivered")
            for o in delivered:
                if order_contains_product(o, product):
                    order = o
                    is_verified = True
                    break

        # One review per buyer per product — update the existing one instead
        # of letting a single purchase flood the rating.
        if user:
            existing = Review.objects.filter(product=product, user=user).first()
            if existing:
                for field, value in serializer.validated_data.items():
                    setattr(existing, field, value)
                existing.is_verified = is_verified or existing.is_verified
                existing.is_approved = False  # re-moderate edits
                existing.save()
                serializer.instance = existing
                return
        serializer.save(product=product, user=user, order=order, is_verified=is_verified)
