from django.contrib import admin

from .models import Announcement, ContactMessage, FAQ, NewsletterSubscriber, Policy, SiteSetting


@admin.register(Policy)
class PolicyAdmin(admin.ModelAdmin):
    list_display = ["title", "slug", "updated_at"]
    prepopulated_fields = {"slug": ("title",)}


@admin.register(FAQ)
class FAQAdmin(admin.ModelAdmin):
    list_display = ["question", "sort_order", "is_active"]
    list_editable = ["sort_order", "is_active"]


@admin.register(SiteSetting)
class SiteSettingAdmin(admin.ModelAdmin):
    list_display = ["key", "updated_at"]
    search_fields = ["key"]


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ["text", "is_active", "sort_order"]
    list_editable = ["is_active", "sort_order"]


@admin.register(NewsletterSubscriber)
class NewsletterAdmin(admin.ModelAdmin):
    list_display = ["email", "created_at"]
    search_fields = ["email"]


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ["name", "email", "phone", "is_replied", "created_at"]
    list_filter = ["is_replied"]
    list_editable = ["is_replied"]
