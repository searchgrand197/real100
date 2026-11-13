"""Review invites for delivered orders older than 3 days.

Sends one email to the address saved with the order, then marks it sent
so nobody is asked twice. Run daily, e.g. via cron:

    python manage.py send_review_invites
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.orders.emails import send_review_invite_email
from apps.orders.models import Order


class Command(BaseCommand):
    help = "Email a review link for delivered orders (delivered 3+ days ago, no review yet)."

    def handle(self, *args, **options):
        due = timezone.now() - timedelta(days=3)
        orders = Order.objects.filter(
            status="delivered", created_at__lte=due, review_invite_sent_at__isnull=True
        ).exclude(reviews__isnull=False).select_related("user")
        sent = 0
        skipped = 0
        for order in orders:
            if not (order.email or (order.user and order.user.email)):
                skipped += 1
                self.stdout.write(f"SKIP {order.order_number}: no email on the order or account.")
                continue
            try:
                send_review_invite_email(order)
            except Exception as exc:
                self.stderr.write(f"FAIL {order.order_number}: {exc}")
                continue
            order.review_invite_sent_at = timezone.now()
            order.save(update_fields=["review_invite_sent_at"])
            sent += 1
            self.stdout.write(f"SENT {order.order_number}")
        self.stdout.write(self.style.SUCCESS(f"{sent} review invite(s) sent, {skipped} skipped."))
