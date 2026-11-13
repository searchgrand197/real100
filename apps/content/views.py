"""Public content API: policies, FAQs, settings, announcements,
newsletter subscribe, contact form (actually stored now)."""
from rest_framework import generics

from .models import Announcement, ContactMessage, FAQ, NewsletterSubscriber, Policy, SiteSetting
from .serializers import (
    AnnouncementSerializer, ContactMessageSerializer, FAQSerializer,
    NewsletterSerializer, PolicySerializer, SiteSettingSerializer,
)


class PolicyListView(generics.ListAPIView):
    queryset = Policy.objects.all()
    serializer_class = PolicySerializer


class PolicyDetailView(generics.RetrieveAPIView):
    queryset = Policy.objects.all()
    serializer_class = PolicySerializer
    lookup_field = "slug"


class FAQListView(generics.ListAPIView):
    queryset = FAQ.objects.filter(is_active=True)
    serializer_class = FAQSerializer


class SiteSettingListView(generics.ListAPIView):
    queryset = SiteSetting.objects.all()
    serializer_class = SiteSettingSerializer


class AnnouncementListView(generics.ListAPIView):
    queryset = Announcement.objects.filter(is_active=True)
    serializer_class = AnnouncementSerializer


class NewsletterSubscribeView(generics.CreateAPIView):
    queryset = NewsletterSubscriber.objects.all()
    serializer_class = NewsletterSerializer


class ContactMessageCreateView(generics.CreateAPIView):
    queryset = ContactMessage.objects.all()
    serializer_class = ContactMessageSerializer
