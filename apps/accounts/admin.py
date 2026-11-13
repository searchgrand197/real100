from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Address, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["phone", "name", "email", "is_staff", "date_joined"]
    search_fields = ["phone", "name", "email", "username"]
    fieldsets = BaseUserAdmin.fieldsets + (("Store", {"fields": ("phone", "name")}),)


@admin.register(Address)
class AddressAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "email", "city", "state", "pincode", "is_default"]
    list_filter = ["state", "is_default"]
    search_fields = ["name", "phone", "email", "city", "pincode"]
