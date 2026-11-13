"""Firebase Phone Auth verification.

The storefront sends the SMS OTP with the Firebase client SDK (same
project the clinic site uses) and posts the ID token here. We check
that token against Google's public keys. No OTP code reaches this server.

Dev only: when ALLOW_DEMO_AUTH is on, the token "demo:<phone>" is accepted.
"""
import jwt
from django.conf import settings
from jwt import PyJWKClient

_jwk_client = PyJWKClient(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
    cache_keys=True,
)


def verify_firebase_id_token(id_token):
    """Return the verified phone number (e.g. '+919999999999')."""
    if id_token.startswith("demo:") and settings.ALLOW_DEMO_AUTH:
        return id_token[len("demo:"):]

    project_id = (settings.FIREBASE_PROJECT_ID or "").strip()
    if not project_id:
        raise ValueError("Firebase is not configured (FIREBASE_PROJECT_ID is empty).")

    signing_key = _jwk_client.get_signing_key_from_jwt(id_token)
    decoded = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=["RS256"],
        audience=project_id,
        issuer=f"https://securetoken.google.com/{project_id}",
        options={"require": ["exp", "iat", "aud", "iss", "sub"]},
    )
    phone = decoded.get("phone_number")
    if not phone:
        raise ValueError("Firebase token has no phone number.")
    return phone
