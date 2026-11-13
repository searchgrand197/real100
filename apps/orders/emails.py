"""Order emails for real100agro.

SMTP is the same GoDaddy mailbox the clinic site uses. Mail is sent off
the request thread so a slow host cannot stall checkout. With EMAIL_HOST
unset, Django prints the message to the console instead.
"""
import logging
import sys
import threading
from decimal import Decimal

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import close_old_connections
from django.utils import timezone
from django.utils.html import escape

log = logging.getLogger(__name__)

BRAND = "#7a1e2d"
CREAM = "#fff8f0"

EVENT_COPY = {
    "placed": (
        "Your ghee order is placed",
        "Thank you for ordering from real100agro. We have your jar of bilona ghee and will pack it from our Jind warehouse.",
    ),
    "confirmed": (
        "Your ghee order is confirmed",
        "Payment is in and the order is confirmed. We will pack your bilona ghee and hand it to Delhivery.",
    ),
    "packed": (
        "We are packing your ghee",
        "Your order is being packed at our Jind warehouse. We will mail you again when Delhivery picks it up.",
    ),
    "shipped": (
        "Your ghee is on the way",
        "Delhivery has your order. Keep the tracking number below for the trip to your door.",
    ),
    "delivered": (
        "Your ghee has been delivered",
        "Your real100agro ghee should be with you now. Let it sit if the tin is cold from the road, then enjoy it the way you like — on roti, rice, or a spoon by itself.",
    ),
    "cancelled": (
        "Your ghee order was cancelled",
        "This order is cancelled and will not be shipped. If you had already paid, the refund goes back to the original payment method in 5–7 business days.",
    ),
    "refunded": (
        "Your refund is on the way",
        "We have marked this order refunded. The amount returns to the original payment method in 5–7 business days.",
    ),
    "rto": (
        "We could not complete this delivery",
        "Delhivery could not hand this parcel over, so it is coming back to our Jind warehouse. Reply to this email or call us and we will sort the next step with you.",
    ),
}


def _running_django_tests():
    if "pytest" in sys.modules:
        return True
    return len(sys.argv) >= 2 and sys.argv[1] == "test"


def _run_in_background(label, fn, *args, **kwargs):
    def _target():
        close_old_connections()
        try:
            fn(*args, **kwargs)
        except Exception:
            log.exception("Background email job failed: %s", label)
        finally:
            close_old_connections()

    if _running_django_tests():
        _target()
        return
    threading.Thread(target=_target, name=f"email-{label}", daemon=True).start()


def _money(value):
    amount = Decimal(value or 0).quantize(Decimal("0.01"))
    return f"₹{amount:,.2f}"


def _customer_email(order):
    email = (order.email or "").strip()
    if email:
        return email
    if order.user_id and order.user and order.user.email:
        return order.user.email.strip()
    return ""


def _header():
    return (
        f'<div style="font-family:Georgia,serif;max-width:600px;margin:auto;background:{CREAM};">'
        f'<div style="background:{BRAND};color:#fff8f0;padding:20px 24px;">'
        '<p style="margin:0;letter-spacing:0.12em;font-size:12px;text-transform:uppercase;">real100agro</p>'
        '<h1 style="margin:6px 0 0;font-size:22px;font-weight:500;">Pure desi cow A2 ghee</h1>'
        "</div>"
        '<div style="padding:22px 24px;color:#3a2418;">'
    )


def _footer():
    support = escape(settings.STORE_SUPPORT_EMAIL)
    phone = escape(settings.STORE_SUPPORT_PHONE)
    return (
        '<hr style="border:none;border-top:1px solid #eadfd4;margin:22px 0 12px;">'
        f'<p style="color:#7a655c;font-size:12px;line-height:1.5;margin:0;">'
        "Real 100 Agro India Pvt Ltd · Killa No. 1250, Raghu Nagar, Rohtak Road, "
        "Near New Anaj Mandi, Jind, Haryana 126102."
        f"<br>Questions: {support} · {phone}"
        "<br>This note was sent because you placed a ghee order with us."
        "</p></div></div>"
    )


def _rows(pairs):
    html = '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:12px 0;">'
    for i, (label, value) in enumerate(pairs):
        bg = "#fff" if i % 2 else "#f8efe6"
        html += (
            f'<tr style="background:{bg};">'
            f'<td style="font-weight:600;padding:8px 12px;border-bottom:1px solid #eadfd4;white-space:nowrap;">{escape(label)}</td>'
            f'<td style="padding:8px 12px;border-bottom:1px solid #eadfd4;">{escape(str(value))}</td>'
            "</tr>"
        )
    html += "</table>"
    return html


def _items_html(order):
    html = '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:8px 0 16px;">'
    for item in order.items.all():
        line = _money(item.price * item.quantity)
        html += (
            '<tr>'
            f'<td style="padding:8px 0;border-bottom:1px solid #eadfd4;">{escape(item.product_name)}'
            f' <span style="color:#7a655c;">· {escape(item.size_label)} × {item.quantity}</span></td>'
            f'<td style="padding:8px 0;border-bottom:1px solid #eadfd4;text-align:right;">{escape(line)}</td>'
            "</tr>"
        )
    html += "</table>"
    return html


def _order_pairs(order):
    address = ", ".join(
        part for part in [order.address_line1, order.address_line2, order.city, order.state, order.pincode] if part
    )
    pay = "Cash on delivery" if order.payment_method == "cod" else "Paid online"
    pairs = [
        ("Order", order.order_number),
        ("Placed", timezone.localtime(order.created_at).strftime("%d %b %Y, %I:%M %p")),
        ("Name", order.name),
        ("Mobile", order.phone),
        ("Deliver to", address or "—"),
        ("Payment", pay),
        ("Subtotal", _money(order.subtotal)),
    ]
    if order.discount:
        pairs.append(("Discount", _money(order.discount)))
    pairs.append(("Delivery", "Free" if not order.shipping_charge else _money(order.shipping_charge)))
    pairs.append(("Total", _money(order.total)))
    if order.delhivery_awb:
        pairs.append(("Delhivery AWB", order.delhivery_awb))
    return pairs


def _order_text(order):
    lines = [f"{label}: {value}" for label, value in _order_pairs(order)]
    lines.append("")
    lines.append("Items:")
    for item in order.items.all():
        lines.append(f"- {item.product_name} ({item.size_label}) x{item.quantity} — {_money(item.price * item.quantity)}")
    return "\n".join(lines)


def _copy_bcc(to):
    """Dev inbox that receives a hidden copy. Empty once the shop is hosted."""
    copy = (getattr(settings, "EMAIL_COPY_TO", "") or "").strip()
    if not copy:
        return []
    if copy.lower() in {addr.lower() for addr in to}:
        return []
    return [copy]


def _send(subject, text_body, html_body, to, reply_to=None):
    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=to,
        bcc=_copy_bcc(to),
        reply_to=reply_to or [settings.STORE_SUPPORT_EMAIL],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send(fail_silently=False)


def send_order_event_email(order, event):
    """Email the customer and the shop inbox about an order event."""
    headline, intro = EVENT_COPY.get(event, ("Update on your ghee order", "There is an update on your real100agro order."))
    subject = f"{headline} — {order.order_number}"
    summary = _rows(_order_pairs(order))
    text = f"{headline}\n\n{intro}\n\n{_order_text(order)}"
    customer_html = (
        _header()
        + f'<h2 style="color:{BRAND};margin:0 0 8px;font-weight:500;">{escape(headline)}</h2>'
        + f"<p>{escape(intro)}</p>"
        + _items_html(order)
        + summary
        + "<p>Prices include GST. Delivery is free on orders of ₹1,499 and above.</p>"
        + _footer()
    )
    customer = _customer_email(order)
    if customer:
        try:
            _send(subject, text, customer_html, [customer])
        except Exception:
            log.exception("Failed to send customer email for %s (%s)", order.order_number, event)

    admin = (settings.ORDER_NOTIFY_EMAIL or "").strip()
    if admin and admin.lower() != customer.lower():
        admin_html = (
            _header()
            + f'<h2 style="color:{BRAND};margin:0 0 8px;font-weight:500;">{escape(headline)}</h2>'
            + f"<p>Order <strong>{escape(order.order_number)}</strong> is now <strong>{escape(event)}</strong>.</p>"
            + _items_html(order)
            + summary
            + _footer()
        )
        try:
            _send(
                f"[{event}] {order.order_number} — {order.name}",
                text,
                admin_html,
                [admin],
                reply_to=[customer] if customer else None,
            )
        except Exception:
            log.exception("Failed to send shop email for %s (%s)", order.order_number, event)


def send_order_event_email_async(order_id, event):
    def _job(pk, kind):
        from .models import Order

        order = Order.objects.prefetch_related("items").select_related("user").get(pk=pk)
        send_order_event_email(order, kind)

    _run_in_background(f"{event}-{order_id}", _job, order_id, event)


def send_replacement_email(replacement):
    order = replacement.order
    item = replacement.order_item
    subject = f"Replacement request for {order.order_number}"
    intro = (
        f"We have your request to replace {item.product_name} ({item.size_label}). "
        "Food jars are replaced, not returned. We will mail you when the replacement is approved."
    )
    reason = replacement.get_reason_display()
    text = f"{intro}\n\nOrder: {order.order_number}\nItem: {item.product_name}\nReason: {reason}\nNote: {replacement.note or '—'}"
    html = (
        _header()
        + f'<h2 style="color:{BRAND};margin:0 0 8px;font-weight:500;">We received your replacement request</h2>'
        + f"<p>{escape(intro)}</p>"
        + _rows([
            ("Order", order.order_number),
            ("Item", f"{item.product_name} · {item.size_label}"),
            ("Reason", reason),
            ("Note", replacement.note or "—"),
        ])
        + _footer()
    )
    customer = _customer_email(order)
    if customer:
        try:
            _send(subject, text, html, [customer])
        except Exception:
            log.exception("Failed to send replacement email to customer for %s", order.order_number)
    admin = (settings.ORDER_NOTIFY_EMAIL or "").strip()
    if admin:
        try:
            _send(
                f"Replacement requested — {order.order_number}",
                text,
                html,
                [admin],
                reply_to=[customer] if customer else None,
            )
        except Exception:
            log.exception("Failed to send replacement email to shop for %s", order.order_number)


def send_replacement_email_async(replacement_id):
    def _job(pk):
        from .models import Replacement

        replacement = Replacement.objects.select_related("order__user", "order_item").get(pk=pk)
        send_replacement_email(replacement)

    _run_in_background(f"replacement-{replacement_id}", _job, replacement_id)


def send_review_invite_email(order):
    """Ask for a review a few days after delivery. Returns True if sent."""
    customer = _customer_email(order)
    if not customer:
        return False
    origin = ""
    for part in (settings.CORS_ALLOWED_ORIGINS or []):
        if part.startswith("http"):
            origin = part.rstrip("/")
            break
    link = f"{origin}/product-reviews.html?token={order.review_token}" if origin else ""
    subject = f"How was the ghee? — {order.order_number}"
    intro = (
        "Your real100agro order was delivered a few days ago. "
        "If you have a moment, tell us how the ghee tasted — it helps the next family choose a jar."
    )
    text = intro + (f"\n\nLeave a review: {link}" if link else "")
    html = (
        _header()
        + f'<h2 style="color:{BRAND};margin:0 0 8px;font-weight:500;">How was the ghee?</h2>'
        + f"<p>{escape(intro)}</p>"
        + (f'<p><a href="{escape(link)}" style="color:{BRAND};">Review order {escape(order.order_number)}</a></p>' if link else "")
        + _footer()
    )
    _send(subject, text, html, [customer])
    return True
