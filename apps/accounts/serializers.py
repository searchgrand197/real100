from rest_framework import serializers

from .models import Address, User


class UserSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["id", "phone", "name", "email"]

    def validate_email(self, value):
        return (value or "").strip().lower()

    def validate_name(self, value):
        return (value or "").strip()


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = [
            "id", "label", "name", "phone", "email", "address_line1", "address_line2",
            "city", "state", "pincode", "is_default", "created_at",
        ]
        read_only_fields = ["created_at"]

    def validate_pincode(self, value):
        if not (value.isdigit() and len(value) == 6):
            raise serializers.ValidationError("Pincode must be 6 digits.")
        return value

    def validate_email(self, value):
        return (value or "").strip().lower()

    def validate(self, attrs):
        creating = self.instance is None
        if creating and not (attrs.get("email") or "").strip():
            raise serializers.ValidationError(
                {"email": "Add an email so we can send order updates."}
            )
        return attrs
