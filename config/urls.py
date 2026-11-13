"""Root URLconf: /admin/ + /api/ (+ /api/schema health check)."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

admin.site.site_header = "real100agro Admin"
admin.site.site_title = "real100agro Admin"
admin.site.index_title = "Store administration"


def health(request):
    return JsonResponse({"status": "ok", "service": "real100agro-backend"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health, name="health"),
    path("api/", include("apps.catalog.urls")),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.orders.urls")),
    path("api/", include("apps.content.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
