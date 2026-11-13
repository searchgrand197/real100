from rest_framework import serializers

from .models import Category, Product, ProductImage, ProductVariant, Review


def _absolute_media(request, file_field):
    if not file_field:
        return ""
    url = file_field.url
    if request is not None:
        return request.build_absolute_uri(url)
    return url


class CategorySerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "image", "sort_order"]

    def get_image(self, obj):
        return _absolute_media(self.context.get("request"), obj.image)


class ProductImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = ProductImage
        fields = ["id", "image", "alt_text", "sort_order"]

    def get_image(self, obj):
        return _absolute_media(self.context.get("request"), obj.image)


class ComboComponentSerializer(serializers.Serializer):
    component_variant = serializers.IntegerField()
    component_name = serializers.CharField()
    quantity = serializers.IntegerField()


class ProductVariantSerializer(serializers.ModelSerializer):
    in_stock = serializers.ReadOnlyField()
    available_stock = serializers.ReadOnlyField()
    is_low_stock = serializers.ReadOnlyField()
    is_combo = serializers.ReadOnlyField()
    component_price_sum = serializers.ReadOnlyField()
    components = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = ["id", "size_label", "sku", "price", "mrp", "stock", "available_stock",
                  "is_low_stock", "is_combo", "component_price_sum", "components",
                  "weight_grams", "in_stock"]

    def get_components(self, obj):
        return [
            {"component_variant": c.component_variant_id,
             "component_name": str(c.component_variant),
             "quantity": c.quantity}
            for c in obj.components.select_related("component_variant")
        ]


class ProductSerializer(serializers.ModelSerializer):
    variants = ProductVariantSerializer(many=True, read_only=True)
    images = ProductImageSerializer(many=True, read_only=True)
    category = CategorySerializer(read_only=True)
    price = serializers.ReadOnlyField()
    rating_average = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "description", "category", "hsn_code", "gst_rate",
            "is_featured", "is_bestseller", "price", "variants", "images",
            "rating_average", "rating_count",
            "bundle_discount_percent", "is_preorder", "dispatch_date",
            "seo_title", "seo_description",
        ]

    def _approved_reviews(self, obj):
        return Review.objects.filter(product=obj, is_approved=True)

    def get_rating_average(self, obj):
        from django.db.models import Avg
        avg = self._approved_reviews(obj).aggregate(a=Avg("rating"))["a"]
        return round(avg, 1) if avg else None

    def get_rating_count(self, obj):
        return self._approved_reviews(obj).count()


class ReviewSerializer(serializers.ModelSerializer):
    source_product = serializers.SerializerMethodField()
    is_from_component = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ["id", "name", "rating", "title", "body", "created_at",
                  "taste_rating", "packaging_rating", "delivery_rating", "tags",
                  "is_verified", "source_product", "is_from_component"]
        read_only_fields = ["created_at", "is_verified", "source_product", "is_from_component"]

    def get_source_product(self, obj):
        return {"slug": obj.product.slug, "name": obj.product.name}

    def get_is_from_component(self, obj):
        requested = (self.context or {}).get("requested_slug")
        return bool(requested) and obj.product.slug != requested

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError("Rating must be 1-5.")
        return value

    def validate(self, data):
        for field in ("taste_rating", "packaging_rating", "delivery_rating"):
            value = data.get(field)
            if value is not None and not 1 <= value <= 5:
                raise serializers.ValidationError({field: "Must be 1-5."})
        return data
