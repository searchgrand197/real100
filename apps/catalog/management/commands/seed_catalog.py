"""Seed the catalogue + policies from the current frontend store.js.

Run once: python manage.py seed_catalog
Idempotent (get_or_create). Prices match frontend/products.html.
"""
from datetime import date, timedelta

from django.core.management.base import BaseCommand

from apps.catalog.models import Batch, Category, ComboComponent, Product, ProductVariant
from apps.content.models import FAQ, Policy, SiteSetting
from apps.orders.models import Coupon

PRODUCTS = [
    # (category, name, slug, price, mrp, size, sku, featured, bestseller)
    ("A2 Cow Ghee", "A2 Desi Cow Bilona Ghee — 1 Litre", "a2-ghee-1l", 2140, 2790, "1 Litre", "A2-1L", True, True),
    ("A2 Cow Ghee", "A2 Desi Cow Bilona Ghee — 500 ml", "a2-ghee-500ml", 1299, 1699, "500 ml", "A2-500", False, False),
    ("Buffalo Ghee", "Buffalo Bilona Ghee — 1 Litre", "buffalo-ghee-1l", 1949, 2299, "1 Litre", "BUF-1L", False, True),
    ("Gift Sets", "A2 Ghee Gift Pack — 2 × 500 ml", "a2-ghee-gift", 2699, 3199, "2 × 500 ml", "GIFT-2X500", True, False),
    ("Combos", "A2 & Buffalo Combo — 1 L + 500 ml", "a2-buffalo-combo", 2990, 3490, "1 L + 500 ml", "COMBO-A2BUF", False, False),
]

POLICIES = [
    ("terms", "Terms & Conditions", """Last updated: 11 November 2026.

Welcome to real100agro. These Terms and Conditions govern your use of real100agroindia.com and your purchase of ghee from us. By placing an order, you agree to these terms, our Privacy Policy, Shipping Policy, Cancellation Policy and Return and Refund Policy.

1. Who you are buying from
- real100agro is the brand of Real 100 Agro India Pvt Ltd.
- Registered and operating address (this is also our warehouse and Delhivery pickup and return address): Killa No. 1250, Raghu Nagar, Rohtak Road, Near New Anaj Mandi, Jind, Haryana 126102, India.
- GSTIN: 06AAKCR6284N1ZM. FSSAI Lic. No. 10821008000026.
- Email: support@real100agroindia.com. Phone: +91 94131 75726. Hours: Monday to Saturday, 10:00 am to 6:00 pm IST.

2. Products and prices
- We sell ghee only, packed in India. Prices on the product pages are in Indian Rupees and include 5% GST. The price you pay is the price shown at checkout, including any shipping charge.
- Product photos are indicative. Our ghee is natural and made mostly by hand, so colour, texture and aroma can differ slightly from batch to batch. That difference is not a defect.
- If a price was listed by mistake, we may cancel the order and refund the full prepaid amount within 5-7 business days.

3. Orders
- An order is confirmed when we accept it. Cash on Delivery orders are confirmed when you place them. Prepaid orders are confirmed when Razorpay captures the payment.
- We may decline or cancel an order if a product is out of stock, a price was wrong, a pincode is not serviceable, or we cannot verify the payment. Any amount already paid is refunded in full to the original payment method within 5-7 business days.
- You must give a correct name, mobile number and delivery address. We are not responsible for a delay caused by an incomplete or wrong address.

4. Payment
- You can pay by Cash on Delivery, or prepaid online through Razorpay (UPI, cards, net banking and wallets).
- Razorpay processes the payment. We never see or store your card number, UPI PIN or bank password.

5. Shipping, cancellation and refunds
- Orders are handed to Delhivery. Dispatch, delivery time and shipping charges are in our Shipping Policy. Free delivery applies on orders of ₹1,499 and above. Below that, a flat ₹79 shipping charge is added, and it is shown at checkout before you pay.
- You may cancel before we dispatch, as set out in our Cancellation Policy. A prepaid cancellation before dispatch is refunded in full to the original payment method within 5-7 business days.
- Ghee is a sealed food. We do not take it back because you changed your mind. If it arrives damaged, missing or spoiled, we replace it, and if we cannot replace it we refund it, as set out in our Return and Refund Policy.

6. Food safety and storage
- Store ghee in a cool, dry place, away from sunlight. Shelf life is 9 months from the date of manufacture printed on the pack. Do not use a jar that is leaking, swollen or smells off. Write to us and we will replace it.
- Production follows ISO 9001:2015 and HACCP.

7. Liability
- Our liability for an order is limited to the amount you paid for that order. We are not liable for delay caused by the courier, weather, strikes or any other event outside our control.

8. Governing law
- These terms are governed by the laws of India. Courts at Jind, Haryana have jurisdiction, without limiting any right you have as a consumer under Indian law.

9. Grievance officer
- Name: Sahil, Real 100 Agro India Pvt Ltd.
- Address: Killa No. 1250, Raghu Nagar, Rohtak Road, Near New Anaj Mandi, Jind, Haryana 126102.
- Email: support@real100agroindia.com. Phone: +91 94131 75726.
- We acknowledge a complaint within 48 hours and aim to close it within 30 days. Please include your order number.

10. Changes
- We may update these terms. The version on this page on the day you place an order applies to that order."""),
    ("privacy-policy", "Privacy Policy", """Last updated: 11 November 2026.

real100agro respects your privacy. This policy explains what we collect, why, who we share it with, and how you can reach us. It applies to real100agroindia.com, operated by Real 100 Agro India Pvt Ltd, Killa No. 1250, Raghu Nagar, Rohtak Road, Near New Anaj Mandi, Jind, Haryana 126102.

1. Information we collect
- Order details: your name, phone number, email, delivery address and order history.
- Account details: your phone number when you log in with OTP, the email you add with a delivery address, and any address you save.
- Payment status: whether an order is prepaid or COD, and whether the payment succeeded. We do not collect or store your card, UPI or bank details - those are handled by Razorpay.
- Technical details: a login token and a cart key stored in your browser (localStorage) so your cart and login work across visits.

2. How we use it
- To process, dispatch and deliver your orders, and to show your order status and tracking.
- To verify your identity with an OTP when you log in (via Firebase Phone Auth).
- To respond to your messages and support requests.
- To send order updates (confirmation, dispatch, delivery). We do not send marketing messages unless you ask for them.

3. Who we share it with
- Delhivery (your name, phone number and address) so your order can be delivered and tracked.
- Razorpay (payment processing) and Firebase (phone login). They receive only what they need for their service.
- We never sell your personal information to anyone.

4. Cookies and local storage
- Our website stores a login token and a cart key in your browser so you stay logged in and your cart is remembered. Clearing your browser data will log you out and empty the guest cart.

5. How long we keep it
- Order records are kept as long as needed for accounts, tax and legal requirements, and then deleted or anonymised.

6. Your rights
- You can ask for a copy of your information, or ask us to correct or delete it, by writing to support@real100agroindia.com. We will respond within a reasonable time. Deleting your account data may prevent us from servicing past orders.

7. Children's privacy
- Our website is not directed at children under 18. If you are under 18, please use the website only with a parent or guardian.

8. Security
- We use reasonable safeguards to protect your information, including encrypted connections and token-based login. No method of storage or transmission is completely secure.

9. Changes to this policy
- We may update this policy. The version on this page is the current one.
- Questions: support@real100agroindia.com or +91 94131 75726. Grievance Officer: Sahil, at the address above."""),
    ("shipping", "Shipping Policy", """Last updated: 11 November 2026.

We ship ghee across India with Delhivery, from our warehouse at Real 100 Agro India Pvt Ltd, Killa No. 1250, Raghu Nagar, Rohtak Road, Near New Anaj Mandi, Jind, Haryana 126102. That address is also the Delhivery pickup address and the address a returned parcel comes back to.

1. Where we ship
- We ship to serviceable pincodes in India. Checkout tells you if your pincode is serviceable before you pay.
- We do not ship outside India.

2. Dispatch and delivery time
- Orders are dispatched within 1-2 working days (Monday to Saturday, excluding public holidays).
- After Delhivery picks the parcel up, delivery usually takes 3-7 working days. Remote pincodes can take longer.
- Keep your phone reachable. Delhivery may call before delivery.

3. Shipping charges
- Free delivery on orders of ₹1,499 and above.
- A flat ₹79 shipping charge applies to orders below ₹1,499.
- The shipping charge is shown at checkout before you pay. It is the same charge for Cash on Delivery and prepaid orders.

4. Payment on delivery
- Cash on Delivery is offered at checkout where the option is shown.
- Prepaid orders are paid by UPI, card, net banking or wallet through Razorpay before we dispatch.

5. Tracking
- After dispatch you can track the order from My Profile, My Orders, with the Delhivery AWB number and tracking link.
- We also send dispatch and delivery updates.

6. Wrong address and failed delivery
- Check the name, phone, address and pincode before you pay. If Delhivery cannot deliver because the address is wrong, incomplete, or nobody accepts the parcel, it comes back to our Jind warehouse as an RTO (return to origin).
- We will contact you. Re-shipping a parcel that came back for this reason can be charged again at the same shipping rate.

7. Delays
- Weather, strikes, festivals and courier-network issues can delay delivery. Your order status stays visible in My Orders. Write to us with the order number if a parcel is late.

8. Damaged or leaking parcels
- If the damage is visible, refuse the parcel. It will come back to us as an RTO.
- If you have already accepted it, email us within 5 days of delivery with photos, as set out in the Return and Refund Policy. We replace a damaged jar, and if we cannot replace it we refund it.

9. Questions
- support@real100agroindia.com or +91 94131 75726. Include your order number."""),
    ("cancellation", "Cancellation Policy", """Last updated: 11 November 2026.

This is our Cancellation and Refunds policy. It says when you can cancel, and when a refund is paid. A product that arrives damaged, missing or spoiled is covered by the Return and Refund Policy, not by this page.

1. Cancel before dispatch
- You can cancel any time before we hand the order to Delhivery, from My Profile, My Orders, or by email to support@real100agroindia.com or phone +91 94131 75726. Include the order number.
- There is no cancellation fee.
- If you paid online, we refund the full amount, including any shipping charge, to the original payment method within 5-7 business days of confirming the cancellation. Your bank or wallet may take a little longer to show it.
- A Cash on Delivery order cancelled before dispatch has nothing to refund.

2. After dispatch
- Once Delhivery has the parcel, the order cannot be cancelled in our system.
- You may refuse it when it arrives. Delhivery brings it back to our Jind warehouse as an RTO.
- After we receive that parcel, a prepaid order is refunded to the original payment method within 5-7 business days. The shipping charge is not refunded on a refusal, because the courier has already carried the parcel out and back.
- A Cash on Delivery order that is refused has nothing to refund.

3. Orders we cancel
- We may cancel if a product is out of stock, a price was listed incorrectly, the pincode is not serviceable, or we cannot verify the payment.
- Any amount you already paid is refunded in full to the original payment method within 5-7 business days. There is no deduction.

4. How the refund is paid
- Prepaid refunds go back to the same UPI, card, net banking or wallet you paid with. We do not move a refund to a different mode unless you ask us to, in writing.
- Cash on Delivery refunds, where any amount is due, are paid by UPI or bank transfer to details you send us, within the same 5-7 business days.

5. Contact
- support@real100agroindia.com or +91 94131 75726.
- Grievance Officer: Sahil, Real 100 Agro India Pvt Ltd, Killa No. 1250, Raghu Nagar, Rohtak Road, Near New Anaj Mandi, Jind, Haryana 126102. We acknowledge a complaint within 48 hours."""),
    ("refund", "Return & Refund Policy", """Last updated: 11 November 2026.

real100agro sells sealed ghee. Once an order is confirmed we do not take a jar back because you changed your mind. If a product is damaged, missing or spoiled, email us as set out below and we will replace it. If we cannot replace it, we refund the price of that product to your original payment method within 5-7 business days.

The three cases below are the ones we act on. Write to us as soon as you can. Email is answered within 24-48 hours, and we then stay with the claim until it is closed.

In case of Damaged product
- real100agro needs to be notified of a damaged product within 5 days from the delivery date via email to support@real100agroindia.com.
- In the email, order number, image of invoice, 1 outer box image, 2 clear images of the damaged product are to be sent.
- In case of multiple item shipments, only the affected product can be returned and replaced.
- We will be happy to re-send and replace the product promptly, and we will work with you on providing an amicable solution.
- If we cannot replace it, we refund the price of that product to the original payment method within 5-7 business days.
- Email will be responded to within 24-48 hrs and full assistance will be provided thereafter.

In case of Missing product
- real100agro needs to be notified of a missing product within 5 days from the delivery date via email to support@real100agroindia.com.
- In the email, order number, image of the invoice, 1 outer box image, 2 clear images of the opened box with all items received are to be sent.
- Where we can re-send the missing product, we do that promptly and we do not refund it instead.
- If we cannot re-send it, we refund the price of the missing product to the original payment method within 5-7 business days.
- Email will be responded to within 24-48 hrs and full assistance will be provided thereafter.

In case of spoiled product
- real100agro needs to be notified of spoilage of a product within 10 days from the delivery date via email to support@real100agroindia.com.
- In the email, order number, date of packaging / date of manufacture, and clear images or video of the product are to be shared.
- We will be unable to accept returns due to variance in taste, texture, colour or aroma. This is because our products are completely natural and made mostly by hand, so no two batches will be identical. No compromise is made in the natural production process, use of best and natural ingredients, and we will ensure that maximum nutritional value is retained.
- We will work with you on providing an amicable solution.
- The product will be replaced after due investigation and diligence, and we assure a fair outcome at all times. If we cannot replace it, we refund the price of that product to the original payment method within 5-7 business days.
- Email will be responded to within 24-48 hrs, and full assistance will be provided thereafter.

Refunds
- A refund is also paid when you cancel a prepaid order before dispatch, when we cancel an order, or when a prepaid parcel comes back to us undelivered. Those rules, including the 5-7 business day timeline, are in the Cancellation Policy.
- Every prepaid refund goes to the original payment method (the same UPI, card, net banking or wallet). Cash on Delivery amounts, where a refund is due, are paid by UPI or bank transfer within 5-7 business days.
- Replacement shipments are sent free of charge. We do not deduct a fee from a refund.

How a parcel comes back through Delhivery
- If the damage is visible at the door, refuse the parcel. Delhivery returns it to our warehouse as an RTO (return to origin).
- If we need the jar or box back after delivery, we book a Delhivery reverse pickup from the address we delivered to. You do not pay for that pickup.
- Returned parcels are delivered to Real 100 Agro India Pvt Ltd, Killa No. 1250, Raghu Nagar, Rohtak Road, Near New Anaj Mandi, Jind, Haryana 126102. Keep the outer box until we confirm the claim.
- A prepaid refund for an RTO or an accepted return is issued after the parcel reaches that warehouse, within 5-7 business days, to the original payment method.

Contact
- support@real100agroindia.com or +91 94131 75726. Please include your order number.
- Grievance Officer: Sahil, Real 100 Agro India Pvt Ltd, at the warehouse address above. We acknowledge a complaint within 48 hours and aim to close it within 30 days."""),
]

FAQS = [
    ("Is your ghee really A2?", "Yes. It is made from desi cow milk using the traditional bilona method."),
    ("What is the shelf life?", "9 months from manufacturing when stored in a cool, dry place away from sunlight."),
    ("Do you deliver to my pincode?", "Check serviceability on the checkout page — we deliver across India via Delhivery."),
]

SETTINGS = [
    ("contact_email", "support@real100agroindia.com"),
    ("contact_phone", "+91 94131 75726"),
    ("instagram_url", ""),
    ("facebook_url", ""),
    ("youtube_url", ""),
]


class Command(BaseCommand):
    help = "Seed catalogue, policies, FAQs and site settings."

    def handle(self, *args, **options):
        for cat_name in ["A2 Cow Ghee", "Buffalo Ghee", "Gift Sets", "Combos"]:
            Category.objects.get_or_create(
                name=cat_name, defaults={"slug": cat_name.lower().replace(" ", "-").replace("&", "and")}
            )
        for cat_name, name, slug, price, mrp, size, sku, featured, bestseller in PRODUCTS:
            cat = Category.objects.get(name=cat_name)
            product, _ = Product.objects.get_or_create(
                slug=slug, defaults={"category": cat, "name": name, "is_featured": featured, "is_bestseller": bestseller}
            )
            variant, _ = ProductVariant.objects.get_or_create(
                sku=sku, defaults={"product": product, "size_label": size, "price": price, "mrp": mrp, "stock": 100}
            )
            # One batch per variant: 9-month shelf life from today (FIFO).
            Batch.objects.get_or_create(
                variant=variant, batch_no=f"B-{date.today():%Y-%m}-001",
                defaults={"manufactured_on": date.today(),
                          "expires_on": date.today() + timedelta(days=270),
                          "quantity": variant.stock},
            )
        # Combo components: A2 & Buffalo Combo = A2 1L x1 + Buffalo 500ml x1.
        # Buffalo 500ml does not exist as a product/variant yet (no price
        # given), so only the A2 part is linked here — add the Buffalo
        # 500ml variant in admin with its real price, then link it.
        combo_variant = ProductVariant.objects.filter(sku="COMBO-A2BUF").first()
        a2_1l = ProductVariant.objects.filter(sku="A2-1L").first()
        if combo_variant and a2_1l:
            ComboComponent.objects.get_or_create(
                combo_variant=combo_variant, component_variant=a2_1l, defaults={"quantity": 1}
            )
            self.stdout.write(self.style.WARNING(
                "Combo COMBO-A2BUF linked to A2-1L only — add Buffalo 500ml variant in admin to complete it."
            ))
        for slug, title, body in POLICIES:
            # update_or_create so re-seeding refreshes policy text on
            # existing databases (edit the seed, re-run, text updates).
            Policy.objects.update_or_create(slug=slug, defaults={"title": title, "body": body})
        for i, (q, a) in enumerate(FAQS):
            FAQ.objects.get_or_create(question=q, defaults={"answer": a, "sort_order": i})
        for key, value in SETTINGS:
            # update_or_create so re-seeding refreshes settings (e.g. the
            # contact email) on existing databases.
            SiteSetting.objects.update_or_create(key=key, defaults={"value": value})
        for key in ("whatsapp_url", "x_url"):
            SiteSetting.objects.get_or_create(key=key, defaults={"value": ""})
        Coupon.objects.get_or_create(
            code="WELCOME10",
            defaults={"discount_type": "percent", "value": 10, "max_discount": 300, "is_active": True},
        )
        self.stdout.write(self.style.SUCCESS(
            "Seeded: 4 categories, 5 products, 5 policies, 3 FAQs, settings, coupon WELCOME10."
        ))
