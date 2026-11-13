"""Festival forecast: from delivered orders in the last N days, how much
of each component variant was sold (combos expanded to components), and
how much to stock for a surge of the same size. Usage:
python manage.py forecast --days 30 --surge 5   # 5x the last 30 days
"""
from django.core.management.base import BaseCommand
from django.db.models import Sum

from apps.orders.models import OrderItem


class Command(BaseCommand):
    help = "Forecast component needs from recent delivered orders."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=30)
        parser.add_argument("--surge", type=float, default=1.0)

    def handle(self, *args, **options):
        from datetime import timedelta

        from django.utils import timezone

        from apps.catalog.models import ComboComponent

        since = timezone.now() - timedelta(days=options["days"])
        rows = (
            OrderItem.objects.filter(order__status="delivered", order__created_at__gte=since)
            .values("variant__product__name", "variant__size_label", "variant")
            .annotate(qty=Sum("quantity"))
        )
        need = {}
        for row in rows:
            variant_id = row["variant"]
            qty = row["qty"] * options["surge"]
            components = ComboComponent.objects.filter(combo_variant_id=variant_id)
            if components.exists():
                for c in components:
                    key = str(c.component_variant)
                    need[key] = need.get(key, 0) + qty * c.quantity
            else:
                key = f"{row['variant__product__name']} — {row['variant__size_label']}"
                need[key] = need.get(key, 0) + qty
        if not need:
            self.stdout.write("No delivered orders in the window — nothing to forecast from.")
            return
        for name, qty in sorted(need.items(), key=lambda kv: -kv[1]):
            self.stdout.write(f"{name}: stock {int(qty)} units for a {options['surge']}x surge")
