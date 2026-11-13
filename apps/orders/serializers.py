from rest_framework import serializers

from .models import CartItem, Coupon, Order, OrderItem, Replacement


class ReplacementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Replacement
        fields = ["id", "order", "order_item", "reason", "note", "status", "created_at"]
        read_only_fields = ["status", "created_at"]


class CartItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    size_label = serializers.CharField(source="variant.size_label", read_only=True)
    price = serializers.DecimalField(source="variant.price", max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = CartItem
        fields = ["id", "variant", "product_name", "size_label", "price", "quantity"]


class CouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = ["code", "discount_type", "value", "min_order_value"]


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "variant", "product_name", "size_label", "price", "quantity"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "order_number", "status", "payment_method", "payment_status",
            "subtotal", "discount", "shipping_charge", "tax", "total",
            "name", "phone", "email", "city", "state", "pincode", "gift_message",
            "razorpay_order_id", "delhivery_awb", "total_weight_grams",
            "created_at", "items",
        ]


class CheckoutSerializer(serializers.Serializer):
    """POST /api/checkout/ — address fields + payment method + optional coupon."""
    address_id = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=120, required=False)
    phone = serializers.CharField(max_length=15, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    address_line1 = serializers.CharField(max_length=255, required=False)
    city = serializers.CharField(max_length=100, required=False)
    state = serializers.CharField(max_length=100, required=False)
    pincode = serializers.CharField(max_length=6, required=False)
    payment_method = serializers.ChoiceField(choices=["cod", "prepaid"], default="cod")
    coupon_code = serializers.CharField(max_length=30, required=False, allow_blank=True)
    gift_message = serializers.CharField(max_length=300, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=300, required=False, allow_blank=True)
