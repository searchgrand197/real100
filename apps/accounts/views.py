"""Auth: Firebase ID token -> DRF token. Addresses: CRUD for the user."""
from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from .firebase_auth import verify_firebase_id_token
from .models import Address, User
from .serializers import AddressSerializer, UserSerializer


class AuthConfigView(APIView):
    """Tells the storefront whether local demo OTP is available."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            "demo_auth": bool(settings.ALLOW_DEMO_AUTH),
            "demo_otp": settings.DEMO_OTP if settings.ALLOW_DEMO_AUTH else "",
            "firebase": bool(settings.FIREBASE_PROJECT_ID),
            "firebase_project_id": settings.FIREBASE_PROJECT_ID,
            "firebase_web_api_key": settings.FIREBASE_WEB_API_KEY or "",
            "razorpay": bool(settings.RAZORPAY_KEY_ID),
        })


class FirebaseLoginView(APIView):
    """POST {"id_token": "<firebase id token>"} -> {"token": ..., "user": ...}."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        id_token = request.data.get("id_token", "")
        if not id_token:
            return Response({"detail": "id_token is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            phone = verify_firebase_id_token(id_token)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception:
            return Response(
                {"detail": "That code could not be verified. Request a new OTP and try again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        user, _ = User.objects.get_or_create(
            phone=phone, defaults={"username": phone}
        )
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AddressListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AddressSerializer

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        address = serializer.save(user=self.request.user)
        # The email typed with a delivery address is the account email
        # order updates are sent to.
        # Only fill a profile email that is still empty. A name or email
        # the customer already saved on their profile is left as they set it.
        email = (address.email or "").strip().lower()
        user = self.request.user
        if email and not (user.email or "").strip():
            user.email = email
            user.save(update_fields=["email"])


class AddressDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AddressSerializer

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)
