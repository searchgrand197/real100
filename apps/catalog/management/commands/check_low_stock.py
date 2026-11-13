"""List variants at or below their low-stock threshold, with derived
combo stock (a combo is low when any component is low). Run daily, or
wire the output to an email/alert. Exit code 1 when anything is low.
"""
from django.core.management.base import BaseCommand

from apps.catalog.models import ProductVariant


class Command(BaseCommand):
    help = "Report low-stock variants (derived stock for combos)."

    def handle(self, *args, **options):
        low = []
        for v in ProductVariant.objects.select_related("product"):
            if v.available_stock <= v.low_stock_threshold:
                low.append(v)
        if not low:
            self.stdout.write(self.style.SUCCESS("No low-stock variants."))
            return
        for v in low:
            self.stdout.write(self.style.WARNING(
                f"LOW: {v} — available {v.available_stock} (threshold {v.low_stock_threshold})"
                + (" [combo, derived]" if v.is_combo else "")
            ))
        raise SystemExit(1)
