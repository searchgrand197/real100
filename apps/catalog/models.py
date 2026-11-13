"""Catalog: categories, products, variants (size/price/stock), images, reviews.

Seed data mirrors the current frontend store.js: 5 ghee products.
Prices are in paise in the DB? No — Decimal rupees, matching store.js.
"""
from django.conf import settings
from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="categories/", blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name


class Product(models.Model):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    hsn_code = models.CharField(max_length=20, blank=True)
    gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=5.00)
    is_featured = models.BooleanField(default=False)
    is_bestseller = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # Bundle pricing: if set and the product has components, the combo
    # price follows the components: sum(parts) * (1 - discount%). The
    # `reprice_bundles` command applies it to the combo variant prices.
    bundle_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, blank=True, null=True)
    # Pre-order (festival surge): sell before stock arrives.
    is_preorder = models.BooleanField(default=False)
    dispatch_date = models.DateField(blank=True, null=True)
    # SEO
    seo_title = models.CharField(max_length=200, blank=True)
    seo_description = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def price(self):
        """Lowest active variant price (for listings)."""
        v = self.variants.filter(is_active=True).order_by("price").first()
        return v.price if v else None


class ProductVariant(models.Model):
    """One purchasable size: 500ml / 1 Litre / Gift Pack / Combo."""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    size_label = models.CharField(max_length=60)  # e.g. "1 Litre"
    sku = models.CharField(max_length=60, unique=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    mrp = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.PositiveIntegerField(default=0)
    weight_grams = models.PositiveIntegerField(default=1000)
    batch_no = models.CharField(max_length=60, blank=True)
    manufactured_on = models.DateField(blank=True, null=True)
    expires_on = models.DateField(blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    low_stock_threshold = models.PositiveIntegerField(default=10)

    class Meta:
        ordering = ["sort_order"]

    def __str__(self):
        return f"{self.product.name} — {self.size_label}"

    @property
    def is_combo(self):
        return self.components.exists()

    @property
    def component_price_sum(self):
        '''Sum of component variant prices (x quantity). None if not a combo.'''
        if not self.is_combo:
            return None
        from decimal import Decimal
        total = Decimal("0")
        for c in self.components.select_related("component_variant"):
            total += c.component_variant.price * c.quantity
        return total

    @property
    def available_stock(self):
        '''Sellable units. For a combo this is DERIVED from its components
        (min of component stock // quantity) — combo stock is never stored,
        so a combo can never sell what its parts cannot fulfil.'''
        if not self.is_combo:
            return self.stock
        avail = None
        for c in self.components.select_related("component_variant"):
            can = c.component_variant.stock // c.quantity
            avail = can if avail is None else min(avail, can)
        return avail or 0

    @property
    def in_stock(self):
        return self.is_active and self.available_stock > 0

    @property
    def is_low_stock(self):
        return self.available_stock <= self.low_stock_threshold


class ComboComponent(models.Model):
    '''One part of a combo, at variant level: e.g. combo variant
    'A2 & Buffalo Combo' = A2 1L variant x1 + Buffalo 500ml variant x1.
    Stock is derived from these rows (see ProductVariant.available_stock);
    checkout decrements the component variants, never the combo variant.'''
    combo_variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, related_name="components")
    component_variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, related_name="used_in_combos")
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = [("combo_variant", "component_variant")]

    def __str__(self):
        return f"{self.combo_variant} <- {self.component_variant} x{self.quantity}"


class Batch(models.Model):
    '''One manufacturing batch of a variant. Checkout always picks the
    oldest-expiring batch first (FIFO), so old stock never expires on the
    shelf while fresh stock ships.'''
    variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, related_name="batches")
    batch_no = models.CharField(max_length=60)
    manufactured_on = models.DateField()
    expires_on = models.DateField()
    quantity = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["expires_on"]

    def __str__(self):
        return f"{self.variant} batch {self.batch_no} (exp {self.expires_on})"

    @property
    def is_near_expiry(self):
        from datetime import date, timedelta
        return self.expires_on <= date.today() + timedelta(days=60)


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="products/")
    alt_text = models.CharField(max_length=200, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order"]

    def __str__(self):
        return f"{self.product.name} image {self.sort_order}"


class Review(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=120)
    rating = models.PositiveSmallIntegerField()  # 1-5, overall
    # Split dimensions: a late courier must not drag down the ghee's stars.
    taste_rating = models.PositiveSmallIntegerField(blank=True, null=True)
    packaging_rating = models.PositiveSmallIntegerField(blank=True, null=True)
    delivery_rating = models.PositiveSmallIntegerField(blank=True, null=True)
    # Free-form tags, e.g. "packaging,delivery" — a dented jar reads as a
    # packaging complaint, not a bad product.
    tags = models.CharField(max_length=200, blank=True)
    title = models.CharField(max_length=200, blank=True)
    body = models.TextField()
    order = models.ForeignKey("orders.Order", on_delete=models.SET_NULL, null=True, blank=True,
                              related_name="reviews")
    is_verified = models.BooleanField(default=False)  # True only when the order shows delivered
    is_approved = models.BooleanField(default=False)  # moderation before going live
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.product.name} — {self.rating}★ by {self.name}"
