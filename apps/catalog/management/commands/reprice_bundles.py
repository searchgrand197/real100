"""Apply the bundle pricing rule: combo variant price =
sum(component prices) * (1 - bundle_discount_percent).

Run after a component price changes so combo prices follow automatically.
Warns (does not fix) when a combo is priced above the sum of its parts.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.catalog.models import ProductVariant


class Command(BaseCommand):
    help = "Reprice combo variants from their components + bundle discount."

    def handle(self, *args, **options):
        for variant in ProductVariant.objects.filter(components__isnull=False).distinct():
            total = variant.component_price_sum
            product = variant.product
            if total is None:
                continue
            if variant.price > total:
                self.stdout.write(self.style.WARNING(
                    f"{variant}: price {variant.price} is ABOVE parts sum {total} — fix the discount."
                ))
            if product.bundle_discount_percent is None:
                continue
            new_price = (total * (Decimal("1") - product.bundle_discount_percent / Decimal("100"))).quantize(Decimal("0.01"))
            if new_price != variant.price:
                self.stdout.write(f"{variant}: {variant.price} -> {new_price}")
                variant.price = new_price
                variant.save(update_fields=["price"])
        self.stdout.write(self.style.SUCCESS("Bundle repricing done."))
