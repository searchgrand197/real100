import uuid

import django.db.models.deletion
from django.db import migrations, models


def fill_review_tokens(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    for order in Order.objects.all():
        if order.review_token is None:
            order.review_token = uuid.uuid4()
            order.save(update_fields=["review_token"])


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="total_weight_grams",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="order",
            name="review_invite_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="review_token",
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.RunPython(fill_review_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="order",
            name="review_token",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.CreateModel(
            name="Replacement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reason", models.CharField(choices=[("leaked", "Leaked"), ("damaged", "Damaged"), ("wrong_item", "Wrong item"), ("other", "Other")], default="leaked", max_length=20)),
                ("note", models.TextField(blank=True)),
                ("status", models.CharField(choices=[("requested", "Requested"), ("approved", "Approved"), ("shipped", "Shipped"), ("rejected", "Rejected")], default="requested", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="replacements", to="orders.order")),
                ("order_item", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="replacements", to="orders.orderitem")),
            ],
        ),
    ]
