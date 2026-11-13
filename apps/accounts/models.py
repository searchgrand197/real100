"""Accounts: phone-first user (OTP login) + saved delivery addresses."""
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Phone is the login identity; username stays for Django admin."""

    phone = models.CharField(max_length=15, unique=True, blank=True, null=True)
    name = models.CharField(max_length=120, blank=True)

    def __str__(self):
        return self.phone or self.username


class Address(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    label = models.CharField(max_length=30, default="Home")  # Home / Office / Other
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=15)
    email = models.EmailField(blank=True)
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=6)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_default", "-created_at"]
        verbose_name_plural = "Addresses"

    def __str__(self):
        return f"{self.name}, {self.city} {self.pincode}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_default:
            Address.objects.filter(user=self.user).exclude(pk=self.pk).update(is_default=False)
