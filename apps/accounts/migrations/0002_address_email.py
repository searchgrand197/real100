from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="address",
            name="email",
            field=models.EmailField(blank=True, max_length=254),
        ),
    ]
