from django.contrib import admin

from .models import Batch, Category, ComboComponent, Product, ProductImage, ProductVariant, Review


class ComboComponentInline(admin.TabularInline):
    model = ComboComponent
    fk_name = "combo_variant"
    extra = 0
    fields = ["component_variant", "quantity"]


class BatchInline(admin.TabularInline):
    model = Batch
    extra = 0
    fields = ["batch_no", "manufactured_on", "expires_on", "quantity"]


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ["product", "size_label", "sku", "price", "stock", "available_stock",
                    "is_low_stock", "is_combo"]
    list_filter = ["product"]
    inlines = [ComboComponentInline, BatchInline]

    def is_low_stock(self, obj):
        return obj.is_low_stock
    is_low_stock.boolean = True


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 1
    fields = ["size_label", "sku", "price", "mrp", "stock", "weight_grams", "is_active"]


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "sort_order", "is_active"]
    prepopulated_fields = {"slug": ("name",)}
    list_editable = ["sort_order", "is_active"]


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "price", "is_featured", "is_bestseller", "is_active"]
    list_filter = ["category", "is_featured", "is_bestseller", "is_active"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}
    inlines = [ProductVariantInline, ProductImageInline]


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ["product", "name", "rating", "is_verified", "is_approved", "created_at"]
    list_filter = ["is_approved", "is_verified", "rating", "product"]
    list_editable = ["is_approved"]


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ["variant", "batch_no", "manufactured_on", "expires_on", "quantity", "is_near_expiry"]
    list_filter = ["variant"]
