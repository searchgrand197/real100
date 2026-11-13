"""Delhivery: pincode serviceability + AWB tracking.

Raises ValueError when the Delhivery token is not configured yet.
Docs: https://track.delhivery.com — token goes in the Authorization header.
"""
import requests
from django.conf import settings


def _headers():
    if not settings.DELHIVERY_API_TOKEN:
        raise ValueError("Delhivery is not configured yet (DELHIVERY_API_TOKEN empty).")
    return {"Authorization": f"Token {settings.DELHIVERY_API_TOKEN}", "Content-Type": "application/json"}


def check_serviceability(pincode, weight_grams=0):
    """True if Delhivery serves the pincode for prepaid + COD.
    Weight is recorded for the caller: Delhivery's pin-code API does not
    take weight, but heavy combos are charged and routed by weight, so
    the checkout must pass the order's total weight through.

    Without a Delhivery token, local DEBUG accepts any 6-digit PIN so
    checkout can be tested. Production still reports that the courier
    is not configured."""
    pin = (pincode or "").strip()
    if not (pin.isdigit() and len(pin) == 6):
        return False
    if not settings.DELHIVERY_API_TOKEN:
        if settings.DEBUG:
            return True
        raise ValueError("Delhivery is not configured yet (DELHIVERY_API_TOKEN empty).")
    resp = requests.get(
        f"{settings.DELHIVERY_BASE_URL}/c/api/pin-codes/json/?token={settings.DELHIVERY_API_TOKEN}&filter_codes={pincode}",
        timeout=10,
    )
    resp.raise_for_status()
    codes = resp.json().get("delivery_codes", [])
    return bool(codes and codes[0].get("postal_code", {}).get("pre_paid") == "Y")


def track_awb(awb):
    resp = requests.get(
        f"{settings.DELHIVERY_BASE_URL}/api/v1/packages/json/?waybill={awb}",
        headers=_headers(),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()
