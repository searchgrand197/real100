"""Razorpay: create a payment order, verify the webhook signature.

Raises ValueError when Razorpay keys are not configured yet, so the
frontend can fall back to COD instead of failing silently.
"""
from django.conf import settings


def _client():
    if not (settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET):
        raise ValueError("Razorpay is not configured yet (RAZORPAY_KEY_ID/SECRET empty).")
    import razorpay

    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


def create_razorpay_order(amount_paise, receipt):
    """amount_paise: integer paise. Returns the Razorpay order dict."""
    return _client().order.create(
        {"amount": amount_paise, "currency": "INR", "receipt": receipt, "payment_capture": 1}
    )


def verify_webhook_signature(body, signature):
    import razorpay

    client = _client()
    return client.utility.verify_webhook_signature(
        body, signature, settings.RAZORPAY_WEBHOOK_SECRET
    )
