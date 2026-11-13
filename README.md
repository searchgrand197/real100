# real100agro — backend (Django + DRF)

API + Django admin for the real100agro storefront (static site on
Cloudflare Workers). Frontend lives in `backend/frontend/`; this
backend replaces the frontend demo (`store.js` localStorage cart,
demo OTP `1234`, local-only orders) with real data.

## Stack

- Django 5.1, Django REST Framework, Token auth
- Postgres in production (`DATABASE_URL`), SQLite when unset (dev only)
- Firebase Phone Auth (OTP), Razorpay (prepaid), Delhivery (shipping)
- Django admin at `/admin/` — the client-facing admin UI

## Run locally

```sh
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit: SECRET_KEY at minimum
python manage.py migrate
python manage.py seed_catalog
python manage.py createsuperuser
python manage.py runserver
```

- API health: `GET http://127.0.0.1:8000/api/health/`
- Admin: `http://127.0.0.1:8000/admin/`

## API (all under `/api/`)

| Area | Endpoints |
| --- | --- |
| Catalog | `GET categories/`, `GET products/` (`?category=&q=&featured=&bestseller=`), `GET products/<slug>/`, `GET products/<slug>/reviews/` (POST to add, needs approval; combo reviews aggregate component reviews, each with `source_product` + `is_from_component`, plus `rating_summary`) |
| Review invites | `GET review-invite/<uuid:token>/` — what a (possibly gifted) delivered order can review: ordered products + their components |
| Auth | `POST auth/firebase-login/` `{"id_token": ...}` → DRF token; `GET/PATCH auth/me/` |
| Addresses | `GET/POST addresses/`, `GET/PATCH/DELETE addresses/<id>/` (auth) |
| Cart | `GET/POST/DELETE cart/` (auth or session) |
| Checkout | `POST checkout/` `{"address_id" or inline address, "payment_method": "cod"\|"prepaid", "coupon_code", "gift_message"}` |
| Orders | `GET orders/`, `GET orders/<id>/`, `POST orders/<id>/cancel/`, `GET orders/<id>/tracking/`, `POST orders/<id>/replacements/` (component-only replacement for a leaked/damaged jar) |
| Coupons | `POST coupons/validate/` |
| Shipping | `GET serviceability/?pincode=110001&weight_grams=2000` (weight-aware: heavy combos) |
| Content | `GET policies/`, `GET policies/<slug>/`, `GET faqs/`, `GET settings/`, `GET announcements/`, `POST newsletter/`, `POST contact/` |
| Webhook | `POST webhooks/razorpay/` (signature-verified) |

## Integrations — what to provide

All three are env-configured and fail loudly (503 + clear message)
until credentials exist; nothing is hard-coded.

- **Firebase OTP**: `FIREBASE_CREDENTIALS_PATH` = service-account JSON.
  Frontend sends OTP via Firebase client SDK and POSTs the ID token.
  Dev only: demo OTP is on by default when `DEBUG` is on
  (`ALLOW_DEMO_AUTH` defaults to `DEBUG`; `GET /api/auth/config/`
  reports it and the login modal shows the code, `1234` by default).
  Never enable demo auth in production — it publishes the OTP and
  bypasses Firebase.
- **Razorpay**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`. Prepaid checkout creates a Razorpay
  order; `payment.captured` webhook marks the order paid/confirmed.
- **Delhivery**: `DELHIVERY_API_TOKEN`, `DELHIVERY_BASE_URL`.
  Pincode serviceability + AWB tracking.

## Checkout rules

- Atomic: stock is reserved (decremented) only when the order is
  created; restored on cancel / failed prepaid payment.
- Free shipping at ₹1,499+, else ₹79 flat.
- GST is included in listed prices (5%); the tax portion is shown
  for the invoice.
- Food is non-returnable once opened; damaged/leaked jars are
  replaced (see Refund policy seed data).

## Combos, stock, batches, reviews

- **Combos are variant-level components** (`ComboComponent`): a combo
  variant = component variants × quantities. Combo stock is
  **derived**, never stored: `min(component stock ÷ quantity)`.
  Checkout expands combos and decrements component stock, never the
  combo's own. Cancel restores component stock.
- **Batches are FIFO**: checkout consumes the oldest-expiring batch
  first; near-expiry is 60 days.
- **Bundle pricing**: set `bundle_discount_percent` on a combo
  product, then run `python manage.py reprice_bundles` — combo price
  becomes sum(parts) × (1 − discount). It warns when a combo costs
  more than its parts.
- **Pre-order**: `is_preorder` + `dispatch_date` lets a product sell
  with no stock; checkout skips the stock check for it. A combo
  cannot be partially cancelled — whole order only.
- **Reviews**: one review per buyer per product (re-submitting edits
  it, re-moderated). `is_verified` only when the buyer has a
  delivered order containing the product directly or via a combo.
  Dimension ratings (`taste/packaging/delivery`) + free-form `tags`
  keep a late courier from dragging down the ghee's stars. A combo
  buyer may also review each component — each review is its own row,
  aggregated for display on the combo without double-counting.
- **Review invites**: `python manage.py send_review_invites` lists
  delivered orders 3+ days old with no review yet (link:
  `/api/review-invite/<token>/`). Wire your SMS/WhatsApp provider
  in that command.
- **Ops commands**: `check_low_stock` (exit 1 when anything is low,
  combo stock derived), `forecast --days 30 --surge 5` (component
  quantities to stock for a festival surge).

## Deploy

```sh
gunicorn config.wsgi:application --bind 0.0.0.0:8000
```

Set `DATABASE_URL`, `SECRET_KEY`, `DEBUG=False`,
`ALLOWED_HOSTS`, `FRONTEND_ORIGIN` in the host env. Run
`python manage.py migrate` + `collectstatic` on deploy. The frontend
already calls this API (`frontend/assets/js/api.js` under
`backend/frontend/` auto-detects the base URL); the backend is not
deployed yet, so
`https://api.real100agro.com/api` does not answer and the live site
falls back to static HTML. The policy pages are the exception —
they carry full static copies and render live already. After
deploy, re-run `seed_catalog` and create a superuser, then
re-create any local admin content (FAQs, policies) in the
production admin — local admin data stays local.

## Local dev notes (2026-11-10, commit `b7ac9f2`)

- CORS allows any `localhost`/`127.0.0.1` port (regex) + the
  `X-Cart-Key` header, so the frontend on `:8001` talks to the API
  on `:8000` with no env override.
- Guest carts merge into the user cart on login (keyed by
  `X-Cart-Key` from `localStorage`).
- Category/product image URLs are absolute; media is served in
  `DEBUG`, so admin-uploaded photos show on the product page.
- Tracking returns 200 with the order status when not shipped yet
  (was 404); serviceability accepts any 6-digit pincode in `DEBUG`
  until Delhivery is connected.
- `SessionAuthentication` is off (an admin login cookie used to
  break cart/checkout POSTs with CSRF errors); DRF uses Token auth.
- Seed adds coupon `WELCOME10` (10% off, up to ₹300) and empty
  `whatsapp_url` / `x_url` settings.

## Local dev notes (2026-11-11, commit `d001f2c`)

- Policies were rewritten in the seed (last-updated date, Jind
  jurisdiction, grievance officer Sahil with 48-hour
  acknowledgement / 30-day closure, refunds in 5–7 business
  days). The same text is baked as static articles into
  `frontend/policy.html` (under `backend/frontend/`), so the policy
  pages render live before the backend is deployed; `content.js`
  shows the static article and replaces it from
  `/api/policies/<slug>/` when the API answers. **When a policy
  changes, update the seed AND the static article** — the two
  copies were verified identical at `d001f2c`, and they will
  drift silently if only one is edited.
- The trust badges on the product page (`fssai_logo.png`,
  `lab_logo.png`, `health_logo.png`, `natural_logo.png`) and the
  footer ISO/HACCP SVGs are frontend-only image files, not
  admin-managed; swapping one means replacing the file in
  `backend/frontend/assets/images/`.
