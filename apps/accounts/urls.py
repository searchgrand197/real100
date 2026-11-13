from django.urls import path

from .views import AddressDetailView, AddressListCreateView, AuthConfigView, FirebaseLoginView, MeView

urlpatterns = [
    path("auth/config/", AuthConfigView.as_view(), name="auth-config"),
    path("auth/firebase-login/", FirebaseLoginView.as_view(), name="firebase-login"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("addresses/", AddressListCreateView.as_view(), name="address-list"),
    path("addresses/<int:pk>/", AddressDetailView.as_view(), name="address-detail"),
]
