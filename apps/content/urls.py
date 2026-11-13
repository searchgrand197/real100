from django.urls import path

from .views import (
    AnnouncementListView, ContactMessageCreateView, FAQListView,
    NewsletterSubscribeView, PolicyDetailView, PolicyListView, SiteSettingListView,
)

urlpatterns = [
    path("policies/", PolicyListView.as_view(), name="policy-list"),
    path("policies/<slug:slug>/", PolicyDetailView.as_view(), name="policy-detail"),
    path("faqs/", FAQListView.as_view(), name="faq-list"),
    path("settings/", SiteSettingListView.as_view(), name="site-settings"),
    path("announcements/", AnnouncementListView.as_view(), name="announcement-list"),
    path("newsletter/", NewsletterSubscribeView.as_view(), name="newsletter"),
    path("contact/", ContactMessageCreateView.as_view(), name="contact"),
]
