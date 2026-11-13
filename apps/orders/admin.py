from django.contrib import admin

from .emails import send_order_event_email_async
from .models import Cart, Coupon, Order, OrderItem, OrderStatusLog, Replacement


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["variant", "product_name", "size_label", "price", "quantity"]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["order_number", "name", "phone", "email", "status", "payment_method", "payment_status", "total", "created_at"]
    list_filter = ["status", "payment_method", "payment_status", "created_at"]
    search_fields = ["order_number", "name", "phone", "email", "pincode"]
    readonly_fields = ["order_number", "razorpay_order_id", "razorpay_payment_id", "created_at", "updated_at"]
    inlines = [OrderItemInline]

    def save_model(self, request, obj, form, change):
        status_changed = None
        if change:
            old = Order.objects.get(pk=obj.pk)
            if old.status != obj.status:
                status_changed = obj.status
                OrderStatusLog.objects.create(
                    order=obj, changed_by=request.user, from_status=old.status, to_status=obj.status
                )
        super().save_model(request, obj, form, change)
        if status_changed:
            send_order_event_email_async(obj.pk, status_changed)


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ["code", "discount_type", "value", "min_order_value", "used_count", "is_active"]
    list_editable = ["is_active"]


@admin.register(OrderStatusLog)
class OrderStatusLogAdmin(admin.ModelAdmin):
    list_display = ["order", "from_status", "to_status", "changed_by", "created_at"]
    list_filter = ["to_status"]


@admin.register(Replacement)
class ReplacementAdmin(admin.ModelAdmin):
    list_display = ["order", "order_item", "reason", "status", "created_at"]
    list_filter = ["status", "reason"]
    list_editable = ["status"]


admin.site.register(Cart)
