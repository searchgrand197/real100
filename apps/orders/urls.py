from django.urls import path

from .views import (
    CartView, CheckoutView, CouponValidateView, OrderCancelView,
    OrderDetailView, OrderListView, RazorpayWebhookView, ReplacementCreateView,
    ReviewInviteView, ServiceabilityView, TrackingView,
)

urlpatterns = [
    path("cart/", CartView.as_view(), name="cart"),
    path("coupons/validate/", CouponValidateView.as_view(), name="coupon-validate"),
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("orders/", OrderListView.as_view(), name="order-list"),
    path("orders/<int:pk>/", OrderDetailView.as_view(), name="order-detail"),
    path("orders/<int:pk>/cancel/", OrderCancelView.as_view(), name="order-cancel"),
    path("orders/<int:pk>/tracking/", TrackingView.as_view(), name="order-tracking"),
    path("orders/<int:pk>/replacements/", ReplacementCreateView.as_view(), name="order-replacement"),
    path("review-invite/<uuid:token>/", ReviewInviteView.as_view(), name="review-invite"),
    path("serviceability/", ServiceabilityView.as_view(), name="serviceability"),
    path("webhooks/razorpay/", RazorpayWebhookView.as_view(), name="razorpay-webhook"),
]
