"""Attach product photos from frontend/assets/images/products/ into ProductImage.

Run: python manage.py attach_product_images
Safe to re-run: skips products that already have images unless --replace.
"""
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand

from apps.catalog.models import Product, ProductImage

# slug -> filename under frontend/assets/images/products/
PRODUCT_PHOTOS = {
    "a2-ghee-1l": ["a2-desi-cow-1l.png", "a2-desi-cow-5l.png"],
    "a2-ghee-500ml": ["a2-desi-cow-1l.png"],
    "a2-gir-ghee-1l": ["a2-gir-cow-1l.png"],
    "pahadi-cow-ghee-1l": ["pahadi-cow-1l.png"],
    "a2-ghee-5l": ["a2-desi-cow-5l.png"],
    "buffalo-ghee-1l": ["buffalo-ghee-1l.png"],
    "a2-ghee-gift": ["a2-desi-cow-1l.png"],
    "a2-buffalo-combo": ["buffalo-ghee-1l.png", "a2-desi-cow-1l.png"],
}


class Command(BaseCommand):
    help = "Attach local product PNGs as ProductImage rows."

    def add_arguments(self, parser):
        parser.add_argument(
            "--replace",
            action="store_true",
            help="Delete existing ProductImage rows for mapped products first.",
        )

    def handle(self, *args, **options):
        from django.conf import settings

        photos_dir = Path(settings.BASE_DIR) / "frontend" / "assets" / "images" / "products"
        if not photos_dir.is_dir():
            self.stderr.write(f"Missing photos dir: {photos_dir}")
            return

        attached = 0
        for slug, files in PRODUCT_PHOTOS.items():
            product = Product.objects.filter(slug=slug).first()
            if not product:
                self.stdout.write(self.style.WARNING(f"Skip {slug}: product not found (run seed_catalog)"))
                continue
            if options["replace"]:
                product.images.all().delete()
            elif product.images.exists():
                self.stdout.write(f"Skip {slug}: already has images")
                continue
            for i, name in enumerate(files):
                path = photos_dir / name
                if not path.is_file():
                    self.stdout.write(self.style.WARNING(f"Missing file {path}"))
                    continue
                with path.open("rb") as fh:
                    img = ProductImage(product=product, alt_text=product.name, sort_order=i)
                    img.image.save(name, File(fh), save=True)
                attached += 1
                self.stdout.write(self.style.SUCCESS(f"Attached {name} → {slug}"))
        self.stdout.write(self.style.SUCCESS(f"Done. Attached {attached} image(s)."))
