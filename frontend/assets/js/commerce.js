/* real100agro — cart drawer, OTP login, address + checkout UI.
   Depends on api.js + store.js (Django API backend). */

(function () {
  "use strict";

  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  onReady(function () {
    var store = window.real100agro && window.real100agro.store;
    if (!store) return;

    var root = null;
    var selectedAddressId = null;
    var pendingPhone = "";
    var checkoutAfterLogin = false;
    var appliedCoupon = null;
    var addressStepToken = 0;

    function $(sel, ctx) {
      return (ctx || document).querySelector(sel);
    }

    function $all(sel, ctx) {
      return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
    }

    function escapeHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function mountShell() {
      if (document.querySelector("[data-commerce-root]")) {
        root = document.querySelector("[data-commerce-root]");
        return;
      }
      var wrap = document.createElement("div");
      wrap.setAttribute("data-commerce-root", "");
      wrap.innerHTML =
        '<div class="commerce-overlay" data-commerce-overlay hidden></div>' +
        '<aside class="cart-drawer" data-cart-drawer aria-hidden="true" role="dialog" aria-labelledby="cart-drawer-title">' +
        '  <div class="cart-drawer__head">' +
        '    <h2 id="cart-drawer-title">Your Cart</h2>' +
        '    <button class="commerce-icon-btn" type="button" data-cart-close aria-label="Close cart">' +
        '      <span aria-hidden="true">×</span>' +
        "    </button>" +
        "  </div>" +
        '  <div class="cart-drawer__body" data-cart-body></div>' +
        '  <div class="cart-drawer__foot" data-cart-foot hidden>' +
        '    <div class="cart-drawer__total">' +
        "      <span>Total</span>" +
        '      <strong data-cart-total>₹0</strong>' +
        "    </div>" +
        '    <button class="button button--primary button--full" type="button" data-cart-checkout>Place Order</button>' +
        "  </div>" +
        "</aside>" +
        '<div class="commerce-modal" data-commerce-modal hidden role="dialog" aria-modal="true" aria-labelledby="commerce-modal-title">' +
        '  <div class="commerce-modal__panel">' +
        '    <button class="commerce-icon-btn commerce-modal__close" type="button" data-modal-close aria-label="Close">' +
        '      <span aria-hidden="true">×</span>' +
        "    </button>" +
        '    <div data-modal-content></div>' +
        "  </div>" +
        "</div>" +
        '<div class="commerce-toast" data-commerce-toast hidden role="status"></div>';
      document.body.appendChild(wrap);
      root = wrap;
    }

    function showOverlay(on) {
      var overlay = $("[data-commerce-overlay]", root);
      if (!overlay) return;
      if (on) overlay.removeAttribute("hidden");
      else overlay.setAttribute("hidden", "");
    }

    function lockScroll(on) {
      document.body.classList.toggle("commerce-lock", !!on);
    }

    function openCart() {
      var drawer = $("[data-cart-drawer]", root);
      if (!drawer) return;
      renderCart();
      drawer.setAttribute("aria-hidden", "false");
      drawer.classList.add("is-open");
      showOverlay(true);
      lockScroll(true);
    }

    function closeCart() {
      var drawer = $("[data-cart-drawer]", root);
      if (!drawer) return;
      drawer.setAttribute("aria-hidden", "true");
      drawer.classList.remove("is-open");
      if ($("[data-commerce-modal]", root).hasAttribute("hidden")) {
        showOverlay(false);
        lockScroll(false);
      }
    }

    function openModal(html, variant) {
      var modal = $("[data-commerce-modal]", root);
      var content = $("[data-modal-content]", root);
      if (!modal || !content) return;
      content.innerHTML = html;
      modal.classList.toggle("is-page", variant === "page");
      modal.removeAttribute("hidden");
      showOverlay(true);
      lockScroll(true);
    }

    function closeModal() {
      var modal = $("[data-commerce-modal]", root);
      if (!modal) return;
      modal.classList.remove("is-page");
      modal.setAttribute("hidden", "");
      var drawer = $("[data-cart-drawer]", root);
      var drawerOpen = drawer && drawer.classList.contains("is-open");
      if (!drawerOpen) {
        showOverlay(false);
        lockScroll(false);
      }
    }

    function toast(message) {
      var el = $("[data-commerce-toast]", root);
      if (!el) return;
      el.textContent = message;
      el.removeAttribute("hidden");
      el.classList.add("is-visible");
      window.clearTimeout(toast._t);
      toast._t = window.setTimeout(function () {
        el.classList.remove("is-visible");
        el.setAttribute("hidden", "");
      }, 2200);
    }

    function updateCartBadge() {
      var count = store.cartCount();
      $all("[data-cart-count-number]").forEach(function (el) {
        el.textContent = String(count);
      });
      $all("[data-cart-count]").forEach(function (el) {
        el.setAttribute(
          "aria-label",
          "Cart, " + count + (count === 1 ? " item" : " items")
        );
      });
    }

    function renderCart() {
      var body = $("[data-cart-body]", root);
      var foot = $("[data-cart-foot]", root);
      var totalEl = $("[data-cart-total]", root);
      if (!body || !foot) return;
      var lines = store.cartLines();
      if (!lines.length) {
        body.innerHTML =
          '<div class="cart-empty">' +
          "<p>Your cart is empty.</p>" +
          '<a class="button button--outline" href="products.html#all" data-cart-close>Shop ghee</a>' +
          "</div>";
        if (totalEl) totalEl.textContent = store.formatPrice(0);
        foot.setAttribute("hidden", "");
        updateCartBadge();
        return;
      }
      body.innerHTML = lines
        .map(function (line) {
          return (
            '<article class="cart-line" data-cart-line="' +
            escapeHtml(line.id) +
            '">' +
            '<img class="cart-line__img" src="' +
            escapeHtml(line.image) +
            '" alt="" width="72" height="72" loading="lazy">' +
            '<div class="cart-line__meta">' +
            '<p class="cart-line__name">' +
            escapeHtml(line.name) +
            "</p>" +
            '<p class="cart-line__price">' +
            store.formatPrice(line.price) +
            "</p>" +
            '<div class="cart-line__row">' +
            '<div class="cart-qty" role="group" aria-label="Quantity">' +
            '<button class="cart-qty__btn" type="button" data-cart-qty-minus="' +
            escapeHtml(line.id) +
            '" aria-label="Decrease quantity"><span>-</span></button>' +
            '<span class="cart-qty__value"><span>' +
            line.qty +
            "</span></span>" +
            '<button class="cart-qty__btn" type="button" data-cart-qty-plus="' +
            escapeHtml(line.id) +
            '" aria-label="Increase quantity"><span>+</span></button>' +
            "</div>" +
            '<button class="cart-line__remove" type="button" data-cart-remove="' +
            escapeHtml(line.id) +
            '">Remove</button>' +
            "</div>" +
            "</div>" +
            '<p class="cart-line__total">' +
            store.formatPrice(line.lineTotal) +
            "</p>" +
            "</article>"
          );
        })
        .join("");
      if (totalEl) totalEl.textContent = store.formatPrice(store.cartTotal());
      foot.removeAttribute("hidden");
      updateCartBadge();
    }

    function resolveProductId(btn) {
      if (!btn) return null;
      var direct = btn.getAttribute("data-product-id");
      if (direct) return direct;
      var host = btn.closest("[data-product-id]");
      if (host) return host.getAttribute("data-product-id");
      var detail =
        btn.closest("[data-product-detail]") ||
        document.querySelector("[data-product-detail]");
      if (detail) {
        var activeSize = detail.querySelector(
          "[data-product-size][aria-pressed='true']"
        );
        if (activeSize && activeSize.getAttribute("data-product-id")) {
          return activeSize.getAttribute("data-product-id");
        }
        return detail.getAttribute("data-product-id");
      }
      var pageSize = document.querySelector(
        "[data-product-size][aria-pressed='true']"
      );
      if (pageSize && pageSize.getAttribute("data-product-id")) {
        return pageSize.getAttribute("data-product-id");
      }
      return null;
    }

    function resolveQty(btn) {
      if (btn && btn.hasAttribute("data-add-qty")) {
        var input = document.querySelector("[data-qty-input]");
        if (input) {
          var q = parseInt(input.value, 10);
          if (!isNaN(q) && q > 0) return Math.min(20, q);
        }
      }
      return 1;
    }

    /* ---------- Checkout steps ---------- */

    function startCheckout() {
      if (!store.cartCount()) {
        toast("Your cart is empty");
        return;
      }
      closeCart();
      if (!store.isLoggedIn()) {
        checkoutAfterLogin = true;
        showLoginStep();
        return;
      }
      showAddressStep();
    }

    function showLoginStep() {
      openModal(
        '<div class="commerce-step" data-login-step="phone">' +
          '<p class="commerce-step__eyebrow">Login to continue</p>' +
          '<h2 id="commerce-modal-title">Enter mobile number</h2>' +
          '<p class="commerce-step__lead">We will send a one-time password to verify it is you.</p>' +
          '<form data-login-phone-form>' +
          '<label class="commerce-field">' +
          '<span>Mobile number</span>' +
          '<div class="commerce-phone">' +
          '<span class="commerce-phone__prefix">+91</span>' +
          '<input type="tel" name="phone" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" placeholder="10-digit number" required autocomplete="tel-national">' +
          "</div>" +
          "</label>" +
          '<p class="commerce-error" data-login-error hidden></p>' +
          '<button class="button button--primary button--full" type="submit" data-send-otp-btn>Send OTP</button>' +
          "</form>" +
          "</div>"
      );
    }

    function showOtpStep(phone, info) {
      pendingPhone = phone;
      var demo = info && info.demo;
      var otpLen = demo ? 4 : 6;
      var lead = demo
        ? "Local testing code is " + info.otp + ". Enter it below — Firebase is not connected on this machine."
        : "We sent a 6-digit code by SMS to +91 " + phone + ".";
      openModal(
        '<div class="commerce-step" data-login-step="otp">' +
          '<p class="commerce-step__eyebrow">Verify OTP</p>' +
          '<h2 id="commerce-modal-title">Enter the code</h2>' +
          '<p class="commerce-step__lead">' +
          escapeHtml(lead) +
          "</p>" +
          '<form data-login-otp-form>' +
          '<label class="commerce-field">' +
          "<span>OTP</span>" +
          '<input type="text" name="otp" inputmode="numeric" maxlength="' +
          otpLen +
          '" pattern="[0-9]{' +
          otpLen +
          '}" placeholder="' +
          (demo ? "••••" : "••••••") +
          '" required autocomplete="one-time-code">' +
          "</label>" +
          '<p class="commerce-error" data-login-error hidden></p>' +
          '<button class="button button--primary button--full" type="submit" data-verify-otp-btn>Verify &amp; continue</button>' +
          '<button class="button button--ghost button--full" type="button" data-resend-otp>Resend OTP</button>' +
          "</form>" +
          "</div>"
      );
    }

    function withLoader(btn, labelBusy, work) {
      if (!btn) return work();
      var original = btn.innerHTML;
      btn.disabled = true;
      btn.classList.add("is-loading");
      btn.innerHTML =
        '<span class="commerce-spinner" aria-hidden="true"></span>' +
        '<span>' +
        escapeHtml(labelBusy) +
        "</span>";
      return Promise.resolve().then(work)
        .finally(function () {
          btn.disabled = false;
          btn.classList.remove("is-loading");
          btn.innerHTML = original;
        });
    }

    function showAddressStep(preferredId) {
      var token = ++addressStepToken;
      var cached = store.getAddresses();
      if (cached.length) paintAddressSelect(cached, preferredId);
      else {
        openModal(
          '<div class="commerce-step commerce-step--page" data-address-step="loading">' +
            '<p class="commerce-step__eyebrow">Checkout</p>' +
            '<h2 id="commerce-modal-title">Select address</h2>' +
            '<p class="commerce-step__lead">Loading your saved addresses…</p>' +
            "</div>",
          "page"
        );
      }
      var refresh = store.refreshAddresses
        ? store.refreshAddresses()
        : Promise.resolve(cached);
      return Promise.resolve(refresh)
        .catch(function () {
          return store.getAddresses();
        })
        .then(function (list) {
          if (token !== addressStepToken) return;
          if (!Array.isArray(list)) list = store.getAddresses();
          if (!list.length) {
            // Keep a picker we already drew from the address just saved.
            // An empty refresh must not send the customer back to the form.
            if (!cached.length) showAddressForm(true);
            return;
          }
          if (sameAddressIds(cached, list)) return;
          paintAddressSelect(list, preferredId);
        });
    }

    function sameAddressIds(a, b) {
      if (!a || !b || a.length !== b.length) return false;
      var ids = {};
      a.forEach(function (item) { ids[String(item.id)] = true; });
      for (var i = 0; i < b.length; i++) {
        if (!ids[String(b[i].id)]) return false;
      }
      return true;
    }

    function paintAddressSelect(addresses, preferredId) {
      var chosen = null;
      addresses.forEach(function (a) {
        if (preferredId != null && String(a.id) === String(preferredId)) chosen = a.id;
      });
      if (chosen == null && addresses.length) chosen = addresses[0].id;
      selectedAddressId = chosen;

      var listHtml = addresses
        .map(function (a) {
          var checked = String(a.id) === String(selectedAddressId);
          return (
            '<label class="address-card' +
            (checked ? " is-selected" : "") +
            '">' +
            '<input type="radio" name="checkout-address" value="' +
            escapeHtml(a.id) +
            '"' +
            (checked ? " checked" : "") +
            ">" +
            '<span class="address-card__body">' +
            "<strong>" +
            escapeHtml(a.name) +
            "</strong>" +
            "<span>" +
            escapeHtml(a.line1) +
            (a.line2 ? ", " + escapeHtml(a.line2) : "") +
            "</span>" +
            "<span>" +
            escapeHtml(a.city) +
            ", " +
            escapeHtml(a.state) +
            " — " +
            escapeHtml(a.pincode) +
            "</span>" +
            "<span>+91 " +
            escapeHtml(a.phone) +
            "</span>" +
            (a.email
              ? "<span>" + escapeHtml(a.email) + "</span>"
              : "") +
            "</span>" +
            "</label>"
          );
        })
        .join("");

      openModal(
        '<div class="commerce-step commerce-step--page" data-address-step="select">' +
          '<div class="commerce-step__body">' +
          '<p class="commerce-step__eyebrow">Checkout</p>' +
          '<h2 id="commerce-modal-title">Select address</h2>' +
          '<p class="commerce-step__lead">Where should we send this order?</p>' +
          '<div class="address-list" data-address-list>' +
          listHtml +
          "</div>" +
          '<button class="button button--outline button--full" type="button" data-address-add-open>Add new address</button>' +
          '<div class="pay-methods" role="radiogroup" aria-label="Payment method">' +
          '<p class="pay-methods__label">Payment method</p>' +
          '<label class="pay-option">' +
          '<input type="radio" name="payment-method" value="cod" checked>' +
          '<span><strong>Cash on delivery</strong><small>Pay when the order arrives</small></span>' +
          "</label>" +
          '<label class="pay-option">' +
          '<input type="radio" name="payment-method" value="prepaid">' +
          '<span><strong>Pay online</strong><small>UPI or card</small></span>' +
          "</label>" +
          "</div>" +
          '<label class="commerce-field checkout-coupon"><span>Coupon code (optional)</span>' +
          '<div class="commerce-coupon-row"><input type="text" data-coupon-input placeholder="Enter coupon code" autocomplete="off">' +
          '<button class="button button--outline" type="button" data-coupon-apply>Apply</button></div>' +
          '<p class="commerce-hint" data-coupon-message hidden></p></label>' +
          '<p class="commerce-hint checkout-legal">By placing this order you agree to our <a href="policy.html?slug=terms">Terms &amp; Conditions</a>, <a href="policy.html?slug=privacy-policy">Privacy Policy</a>, <a href="policy.html?slug=shipping">Shipping Policy</a>, <a href="policy.html?slug=cancellation">Cancellation Policy</a> and <a href="policy.html?slug=refund">Return &amp; Refund Policy</a>.</p>' +
          "</div>" +
          '<div class="commerce-step__actions">' +
          '<button class="button button--primary button--full" type="button" data-place-order>Place order · ' +
          store.formatPrice(store.cartTotal()) +
          "</button>" +
          "</div>" +
          "</div>",
        "page"
      );
    }

    function showAddressForm(required) {
      addressStepToken += 1;
      var user = store.getUser();
      var phoneDefault = user && user.phone ? user.phone : "";
      var emailDefault = user && user.email ? user.email : "";
      var nameDefault = user && user.name ? user.name : "";
      openModal(
        '<form class="commerce-step commerce-step--form commerce-step--page" data-address-step="form" data-address-form action="javascript:void(0)" onsubmit="event.preventDefault();">' +
          '<div class="commerce-step__body">' +
          '<p class="commerce-step__eyebrow">Delivery</p>' +
          '<h2 id="commerce-modal-title">' +
          (required ? "Add delivery address" : "New address") +
          "</h2>" +
          '<p class="commerce-step__lead">' +
          (required
            ? "Add an address to place your order."
            : "Save another delivery address.") +
          "</p>" +
          '<label class="commerce-check">' +
          '<input type="checkbox" name="forSomeoneElse" data-for-someone-else>' +
          "<span>Ordering for someone else</span>" +
          "</label>" +
          '<label class="commerce-field"><span>Full name</span>' +
          '<input type="text" name="name" required autocomplete="name" value="' +
          escapeHtml(nameDefault) +
          '"></label>' +
          '<label class="commerce-field"><span>Mobile number</span>' +
          '<input type="tel" name="phone" inputmode="numeric" maxlength="10" pattern="[0-9]{10}" required value="' +
          escapeHtml(phoneDefault) +
          '"></label>' +
          '<label class="commerce-field"><span>Email</span>' +
          '<input type="email" name="email" required autocomplete="email" placeholder="you@email.com" value="' +
          escapeHtml(emailDefault) +
          '"></label>' +
          '<p class="commerce-hint" data-email-hint hidden></p>' +
          '<label class="commerce-field"><span>Address line 1</span>' +
          '<input type="text" name="line1" required autocomplete="address-line1"></label>' +
          '<label class="commerce-field"><span>Address line 2 (optional)</span>' +
          '<input type="text" name="line2" autocomplete="address-line2"></label>' +
          '<div class="commerce-field-row commerce-field-row--3">' +
          '<label class="commerce-field"><span>City</span>' +
          '<input type="text" name="city" required autocomplete="address-level2"></label>' +
          '<label class="commerce-field"><span>State</span>' +
          '<input type="text" name="state" required autocomplete="address-level1"></label>' +
          '<label class="commerce-field"><span>PIN code</span>' +
          '<input type="text" name="pincode" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required autocomplete="postal-code"></label>' +
          "</div>" +
          '<p class="commerce-hint" data-serviceability-hint hidden></p>' +
          '<p class="commerce-hint" data-name-hint hidden></p>' +
          '<p class="commerce-error" data-address-error hidden></p>' +
          "</div>" +
          '<div class="commerce-step__actions">' +
          '<button class="button button--primary button--full" type="button" data-address-save>Save address</button>' +
          (required
            ? ""
            : '<button class="button button--ghost button--full" type="button" data-address-back>Back</button>') +
          "</div>" +
          "</form>",
        "page"
      );
      updateSomeoneElseHint();
    }

    function setHint(el, text) {
      if (!el) return;
      if (!text) {
        el.textContent = "";
        el.setAttribute("hidden", "");
        return;
      }
      el.textContent = text;
      el.removeAttribute("hidden");
    }

    function updateSomeoneElseHint() {
      var check = $("[data-for-someone-else]", root);
      var user = store.getUser() || {};
      var someoneElse = check && check.checked;
      var nameHint = "";
      if (!user.name) {
        nameHint = someoneElse
          ? "This name stays on the delivery address. It won’t be saved on your profile."
          : "We’ll save this name on your profile.";
      }
      var emailHint = user.email ? "" : "We’ll save this email on your profile for order updates.";
      setHint($("[data-name-hint]", root), nameHint);
      setHint($("[data-email-hint]", root), emailHint);
    }

    function showSuccess(order) {
      openModal(
        '<div class="commerce-step commerce-step--success" data-order-success>' +
          '<div class="commerce-success-mark" aria-hidden="true">✓</div>' +
          '<h2 id="commerce-modal-title">Congratulations!</h2>' +
          '<p class="commerce-step__lead">Your order <strong>' +
          escapeHtml(order.id) +
          "</strong> is placed. Total " +
          store.formatPrice(order.total) +
          ".</p>" +
          '<p class="commerce-step__lead">We’ll deliver to ' +
          escapeHtml(order.address.city) +
          ". Track it anytime in My Orders.</p>" +
          (store.getUser() && store.getUser().email
            ? '<p class="commerce-step__lead">A confirmation is on its way to ' +
              escapeHtml(store.getUser().email) +
              ".</p>"
            : "") +
          '<a class="button button--primary button--full" href="orders.html">View my orders</a>' +
          '<button class="button button--ghost button--full" type="button" data-modal-close>Keep shopping</button>' +
          "</div>"
      );
      renderCart();
      updateCartBadge();
    }

    function placeSelectedOrder() {
      if (!selectedAddressId) {
        var checked = $('input[name="checkout-address"]:checked', root);
        if (checked) selectedAddressId = checked.value;
      }
      if (!selectedAddressId) {
        toast("Select an address");
        return;
      }
      var chosen = null;
      store.getAddresses().forEach(function (a) {
        if (String(a.id) === String(selectedAddressId)) chosen = a;
      });
      var account = store.getUser();
      if (chosen && !chosen.email && !(account && account.email)) {
        toast("Add an email on this address so we can send order updates.");
        showAddressForm(false);
        return;
      }
      var btn = $("[data-place-order]", root);
      var methodEl = root.querySelector('input[name="payment-method"]:checked');
      var method = methodEl ? methodEl.value : "cod";
      var couponCode = appliedCoupon;
      withLoader(btn, "Placing order…", function () {
        return store.placeOrder(selectedAddressId, method, couponCode).then(function (result) {
          appliedCoupon = null;
          var order = result.order;
          if (result.razorpay_order) {
            var api = window.real100agro && window.real100agro.api;
            api.openRazorpay(result.razorpay_order, order, function () {
              showSuccess(order);
            }, function (err) {
              toast(err.message || "Payment not completed — order is saved in My Orders.");
              closeModal();
            });
            return;
          }
          showSuccess(order);
        }).catch(function (err) {
          toast(err.message || "Could not place order");
        });
      });
    }

    /* ---------- Events ---------- */

    function bindShell() {
      root.addEventListener("click", function (event) {
        var t = event.target.closest("[data-cart-close]");
        if (t) {
          closeCart();
          /* Allow real links (e.g. empty-cart "Shop ghee") to navigate. */
          var href = t.tagName === "A" ? t.getAttribute("href") : null;
          if (href && href !== "#") return;
          event.preventDefault();
          return;
        }
        if (event.target.closest("[data-commerce-overlay]")) {
          closeCart();
          closeModal();
          return;
        }
        if (event.target.closest("[data-modal-close]")) {
          closeModal();
          return;
        }
        var minus = event.target.closest("[data-cart-qty-minus]");
        if (minus) {
          var id = minus.getAttribute("data-cart-qty-minus");
          var lines = store.cartLines();
          for (var i = 0; i < lines.length; i++) {
            if (lines[i].id === id) {
              store.setQty(id, lines[i].qty - 1);
              break;
            }
          }
          renderCart();
          return;
        }
        var plus = event.target.closest("[data-cart-qty-plus]");
        if (plus) {
          var pid = plus.getAttribute("data-cart-qty-plus");
          var list = store.cartLines();
          for (var j = 0; j < list.length; j++) {
            if (list[j].id === pid) {
              store.setQty(pid, list[j].qty + 1);
              break;
            }
          }
          renderCart();
          return;
        }
        var remove = event.target.closest("[data-cart-remove]");
        if (remove) {
          store.removeFromCart(remove.getAttribute("data-cart-remove"));
          renderCart();
          return;
        }
        if (event.target.closest("[data-cart-checkout]")) {
          startCheckout();
          return;
        }
        if (event.target.closest("[data-address-add-open]")) {
          showAddressForm(false);
          return;
        }
        if (event.target.closest("[data-address-back]")) {
          showAddressStep();
          return;
        }
        var saveAddressBtn = event.target.closest("[data-address-save]");
        if (saveAddressBtn) {
          event.preventDefault();
          var addressFormEl = saveAddressBtn.closest("[data-address-form]");
          if (addressFormEl) saveAddressForm(addressFormEl);
          return;
        }
        if (event.target.closest("[data-place-order]")) {
          placeSelectedOrder();
          return;
        }
        var couponBtn = event.target.closest("[data-coupon-apply]");
        if (couponBtn) {
          var couponInput = root.querySelector("[data-coupon-input]");
          var couponMsg = root.querySelector("[data-coupon-message]");
          var code = couponInput ? couponInput.value.trim().toUpperCase() : "";
          if (!code) return;
          var api = window.real100agro && window.real100agro.api;
          withLoader(couponBtn, "Checking…", function () {
            return api.request("/coupons/validate/", { method: "POST", body: { code: code } }).then(function (c) {
              appliedCoupon = c.code;
              if (couponMsg) {
                var desc = c.discount_type === "percent" ? c.value + "% off" : "₹" + c.value + " off";
                couponMsg.textContent = "Coupon " + c.code + " applied — " + desc +
                  (Number(c.min_order_value) > 0 ? " (min order ₹" + c.min_order_value + ")" : "") + ".";
                couponMsg.removeAttribute("hidden");
              }
              toast("Coupon applied");
            }).catch(function (err) {
              appliedCoupon = null;
              if (couponMsg) {
                couponMsg.textContent = (err && err.message) || "This coupon is not valid.";
                couponMsg.removeAttribute("hidden");
              }
            });
          });
          return;
        }
        if (event.target.closest("[data-resend-otp]")) {
          var resendBtn = event.target.closest("[data-resend-otp]");
          withLoader(resendBtn, "Sending…", function () {
            return store.requestOtp(pendingPhone).then(function (info) {
              toast(info && info.demo ? "Local code is still " + info.otp : "OTP sent again");
            }).catch(function (err) {
              toast(err.message || "Could not resend OTP");
            });
          });
          return;
        }
      });

      root.addEventListener("change", function (event) {
        if (event.target.name === "checkout-address") {
          selectedAddressId = event.target.value;
          $all(".address-card", root).forEach(function (card) {
            var input = card.querySelector("input");
            card.classList.toggle("is-selected", !!(input && input.checked));
          });
        }
        if (event.target.matches("[data-for-someone-else]")) {
          updateSomeoneElseHint();
        }
        // Serviceability: once a full pincode is typed, check Delhivery
        // for the cart's total weight and say so before the order is placed.
        if (event.target.name === "pincode") {
          var pin = (event.target.value || "").replace(/\D/g, "");
          var hint = root.querySelector("[data-serviceability-hint]");
          if (pin.length !== 6 || !hint) return;
          var api = window.real100agro && window.real100agro.api;
          var weight = 0;
          store.getCart().forEach(function (line) {
            var product = store.getProduct(line.id);
            (product && product.variants || []).forEach(function (v) {
              if (v.id === line.variantId) weight += (v.weight_grams || 0) * line.qty;
            });
          });
          hint.textContent = "Checking delivery to " + pin + "…";
          hint.removeAttribute("hidden");
          api.request("/serviceability/?pincode=" + pin + "&weight_grams=" + weight).then(function (res) {
            hint.textContent = res.serviceable
              ? "✓ We deliver to " + pin + "."
              : "✗ Delivery is not available to " + pin + " yet.";
          }).catch(function () {
            hint.textContent = "Could not check delivery for " + pin + " right now.";
          });
        }
      });

      root.addEventListener("submit", function (event) {
        // Checkout forms live in a modal. A native submit reloads the shop
        // page and drops the address picker, even after the address is saved.
        event.preventDefault();
        var phoneForm = event.target.closest("[data-login-phone-form]");
        if (phoneForm) {
          event.preventDefault();
          var phoneInput = phoneForm.querySelector('input[name="phone"]');
          var err = phoneForm.querySelector("[data-login-error]");
          var phone = (phoneInput.value || "").replace(/\D/g, "");
          if (phone.length !== 10) {
            if (err) {
              err.textContent = "Enter a valid 10-digit mobile number.";
              err.removeAttribute("hidden");
            }
            return;
          }
          if (err) err.setAttribute("hidden", "");
          var sendBtn = phoneForm.querySelector("[data-send-otp-btn]");
          withLoader(sendBtn, "Sending OTP…", function () {
            return store.requestOtp(phone).then(function (info) {
              showOtpStep(phone, info);
              toast(info && info.demo ? "Local code " + info.otp : "OTP sent");
            }).catch(function (e) {
              if (err) {
                err.textContent = e.message || "Could not send OTP.";
                err.removeAttribute("hidden");
              }
            });
          });
          return;
        }

        var otpForm = event.target.closest("[data-login-otp-form]");
        if (otpForm) {
          event.preventDefault();
          var otpInput = otpForm.querySelector('input[name="otp"]');
          var otpErr = otpForm.querySelector("[data-login-error]");
          var otp = (otpInput.value || "").trim();
          var verifyBtn = otpForm.querySelector("[data-verify-otp-btn]");
          withLoader(verifyBtn, "Verifying…", function () {
            return store.verifyOtp(otp).then(function () {
              toast("Logged in");
              if (checkoutAfterLogin) {
                checkoutAfterLogin = false;
                showAddressStep();
              } else {
                closeModal();
              }
            }).catch(function (e) {
              if (otpErr) {
                otpErr.textContent = e.message || "Incorrect OTP. Try again.";
                otpErr.removeAttribute("hidden");
              }
            });
          });
          return;
        }

        var addressForm = event.target.closest("[data-address-form]");
        if (addressForm) saveAddressForm(addressForm);
      });

      root.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        var typingForm = event.target.closest && event.target.closest("[data-address-form]");
        if (!typingForm || event.target.closest("textarea")) return;
        event.preventDefault();
        saveAddressForm(typingForm);
      });

    function saveAddressForm(addressForm) {
      var fd = new FormData(addressForm);
      var forSomeoneElse = !!addressForm.querySelector(
        '[name="forSomeoneElse"]:checked'
      );
      var payload = {
        name: String(fd.get("name") || "").trim(),
        phone: String(fd.get("phone") || "").replace(/\D/g, ""),
        email: String(fd.get("email") || "").trim().toLowerCase(),
        line1: String(fd.get("line1") || "").trim(),
        line2: String(fd.get("line2") || "").trim(),
        city: String(fd.get("city") || "").trim(),
        state: String(fd.get("state") || "").trim(),
        pincode: String(fd.get("pincode") || "").replace(/\D/g, ""),
        forSomeoneElse: forSomeoneElse,
      };
      if (addressForm.getAttribute("data-saving") === "1") return;
      var aErr = addressForm.querySelector("[data-address-error]");
      if (
        !payload.name ||
        payload.phone.length !== 10 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
        !payload.line1 ||
        !payload.city ||
        !payload.state ||
        payload.pincode.length !== 6
      ) {
        if (aErr) {
          aErr.textContent = "Please fill all required fields correctly, including a valid email.";
          aErr.removeAttribute("hidden");
        }
        return;
      }
      addressForm.setAttribute("data-saving", "1");
      var saveBtn = addressForm.querySelector("[data-address-save]");
      withLoader(saveBtn, "Saving…", function () {
        return store.addAddress(payload, { skipProfileName: forSomeoneElse }).then(function (saved) {
          selectedAddressId = saved && saved.id;
          toast("Address saved");
          return showAddressStep(selectedAddressId);
        }).catch(function (e) {
          if (aErr) {
            var message = (e && e.message) || "Could not save address.";
            if (e && e.data && typeof e.data === "object") {
              var parts = [];
              Object.keys(e.data).forEach(function (key) {
                var val = e.data[key];
                if (typeof val === "string") parts.push(val);
                else if (Array.isArray(val)) parts.push(val.join(" "));
              });
              if (parts.length) message = parts.join(" ");
            }
            aErr.textContent = message;
            aErr.removeAttribute("hidden");
          }
          addressForm.removeAttribute("data-saving");
        });
      });
    }
    }

    function bindPage() {
      document.addEventListener("click", function (event) {
        var cartBtn = event.target.closest("[data-cart-count]");
        if (cartBtn) {
          event.preventDefault();
          openCart();
          return;
        }

        var addBtn = event.target.closest("[data-add-to-cart]");
        if (addBtn) {
          event.preventDefault();
          var productId = resolveProductId(addBtn);
          if (!productId || !store.getProduct(productId)) {
            toast("Product unavailable");
            return;
          }
          var qty = resolveQty(addBtn);
          // On the product page the active size pill carries the variant.
          var detailHost = addBtn.closest("[data-product-detail]") || document.querySelector("[data-product-detail]");
          var activeSize = detailHost ? detailHost.querySelector("[data-product-size][aria-pressed='true']") : null;
          var variantId = activeSize ? activeSize.getAttribute("data-variant-id") : null;
          store.addToCart(productId, qty, variantId);
          updateCartBadge();
          toast("Added to cart");
          if (/buy\s*now/i.test(addBtn.textContent || "")) {
            openCart();
          }
          return;
        }

        var profileLogin = event.target.closest("[data-open-login]");
        if (profileLogin) {
          event.preventDefault();
          checkoutAfterLogin = false;
          showLoginStep();
        }
      });

      window.addEventListener("real100agro:cart-change", function () {
        updateCartBadge();
        var drawer = $("[data-cart-drawer]", root);
        if (drawer && drawer.classList.contains("is-open")) renderCart();
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          closeModal();
          closeCart();
          closeAccountMenu();
        }
      });
    }

    var accountCloseTimer = null;
    var accountLastTouch = 0;
    var accountPointer = "mouse";

    function strokeIcon(body) {
      return (
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        body +
        "</svg>"
      );
    }

    var ACCOUNT_ICONS = {
      user:
        '<circle cx="12" cy="8" r="3.2"></circle>' +
        '<path d="M5.6 19.2a6.8 6.8 0 0 1 12.8 0"></path>',
      chevron: '<path d="M6 9l6 6 6-6"></path>',
      profile:
        '<circle cx="12" cy="8" r="3.2"></circle>' +
        '<path d="M5.6 19.2a6.8 6.8 0 0 1 12.8 0"></path>',
      orders:
        '<path d="M3.5 7.5 12 3.5l8.5 4L12 11.5 3.5 7.5Z"></path>' +
        '<path d="M3.5 7.5V16.5L12 20.5l8.5-4V7.5"></path>' +
        '<path d="M12 11.5V20.5"></path>',
      address:
        '<path d="M12 21s6.5-5.4 6.5-10.2a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21Z"></path>' +
        '<circle cx="12" cy="10.6" r="2.1"></circle>',
      login:
        '<path d="M10 7V4.5H4.5v15H10V17"></path>' +
        '<path d="M10 12h9.5"></path>' +
        '<path d="M16 8.5 19.5 12 16 15.5"></path>',
      logout:
        '<path d="M14 7V4.5H19.5v15H14V17"></path>' +
        '<path d="M14.5 12H5"></path>' +
        '<path d="M8.5 8.5 5 12l3.5 3.5"></path>',
    };

    function accountDisplayName(user) {
      if (user && user.loggedIn && user.name) {
        var first = String(user.name).trim().split(/\s+/)[0];
        if (first) return first;
      }
      return "Hi user";
    }

    function accountPhone(user) {
      var digits = String((user && user.phone) || "").replace(/\D/g, "");
      if (digits.length === 10) {
        return "+91 " + digits.slice(0, 5) + " " + digits.slice(5);
      }
      return digits ? "+91 " + digits : "";
    }

    function closeMobileNav() {
      var mainNav = document.querySelector("[data-main-nav]");
      var siteHeader = document.querySelector(".site-header");
      var navToggle = document.querySelector("[data-nav-toggle]");
      if (mainNav) mainNav.classList.remove("is-open");
      if (siteHeader) siteHeader.classList.remove("is-menu-open");
      if (navToggle) navToggle.setAttribute("aria-expanded", "false");
    }

    function closeAccountMenu() {
      var menu = document.querySelector("[data-account-menu]");
      var trigger = menu && menu.querySelector("[data-account-trigger]");
      if (!menu) return;
      window.clearTimeout(accountCloseTimer);
      menu.classList.remove("is-open");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    }

    function openAccountMenu() {
      var menu = document.querySelector("[data-account-menu]");
      var trigger = menu && menu.querySelector("[data-account-trigger]");
      if (!menu) return;
      window.clearTimeout(accountCloseTimer);
      closeMobileNav();
      var siteHeader = document.querySelector(".site-header");
      if (siteHeader) siteHeader.classList.remove("is-hidden");
      menu.classList.add("is-open");
      if (trigger) trigger.setAttribute("aria-expanded", "true");
    }

    function renderAccountMenu(menu) {
      var user = store.getUser();
      var loggedIn = !!(user && user.loggedIn);
      var label = menu.querySelector("[data-account-label]");
      var sub = menu.querySelector("[data-account-sub]");
      var auth = menu.querySelector("[data-account-auth]");
      var trigger = menu.querySelector("[data-account-trigger]");
      var name = accountDisplayName(user);
      if (label) label.textContent = name;
      if (trigger) {
        trigger.setAttribute("aria-label", "Account menu, " + name);
      }
      if (sub) {
        if (loggedIn) {
          var phone = accountPhone(user);
          sub.hidden = !phone;
          sub.textContent = phone;
        } else {
          sub.hidden = false;
          sub.textContent = "Login to see orders and addresses";
        }
      }
      if (auth) {
        if (loggedIn) {
          auth.innerHTML = strokeIcon(ACCOUNT_ICONS.logout) + "<span>Logout</span>";
          auth.setAttribute("data-account-action", "logout");
        } else {
          auth.innerHTML = strokeIcon(ACCOUNT_ICONS.login) + "<span>Login</span>";
          auth.setAttribute("data-account-action", "login");
        }
      }
    }

    function ensureAccountMenu() {
      var header = document.querySelector(".header-inner");
      if (!header || header.querySelector("[data-account-menu]")) return;
      var cart = header.querySelector("[data-cart-count]");
      if (!cart) return;

      var menu = document.createElement("div");
      menu.className = "account-menu";
      menu.setAttribute("data-account-menu", "");
      menu.innerHTML =
        '<button class="account-menu__trigger" type="button" data-account-trigger aria-expanded="false" aria-haspopup="true" aria-controls="account-menu-panel">' +
        '<span class="account-menu__icon" aria-hidden="true">' +
        strokeIcon(ACCOUNT_ICONS.user) +
        "</span>" +
        '<span class="account-menu__label" data-account-label>Hi user</span>' +
        '<span class="account-menu__chevron" aria-hidden="true">' +
        strokeIcon(ACCOUNT_ICONS.chevron) +
        "</span>" +
        "</button>" +
        '<div class="account-menu__panel" id="account-menu-panel">' +
        '<div class="account-menu__card">' +
        '<p class="account-menu__heading">Your Account</p>' +
        '<p class="account-menu__sub" data-account-sub>Login to see orders and addresses</p>' +
        '<div class="account-menu__list" role="menu" aria-label="Your account">' +
        '<a class="account-menu__item" role="menuitem" href="profile.html">' +
        strokeIcon(ACCOUNT_ICONS.profile) +
        "<span>My Profile</span></a>" +
        '<a class="account-menu__item" role="menuitem" href="orders.html">' +
        strokeIcon(ACCOUNT_ICONS.orders) +
        "<span>Orders</span></a>" +
        '<a class="account-menu__item" role="menuitem" href="addresses.html">' +
        strokeIcon(ACCOUNT_ICONS.address) +
        "<span>Saved Addresses</span></a>" +
        '<button class="account-menu__item" type="button" role="menuitem" data-account-auth data-account-action="login">' +
        strokeIcon(ACCOUNT_ICONS.login) +
        "<span>Login</span></button>" +
        "</div></div></div>";

      header.insertBefore(menu, cart);
      renderAccountMenu(menu);
      var accountPath = (location.pathname || "").split("/").pop() || "index.html";
      menu.querySelectorAll(".account-menu__item[href]").forEach(function (link) {
        var href = (link.getAttribute("href") || "").split("#")[0];
        if (href === accountPath) link.setAttribute("aria-current", "page");
      });

      var trigger = menu.querySelector("[data-account-trigger]");

      menu.addEventListener("pointerover", function (event) {
        accountPointer = event.pointerType || "mouse";
        if (event.pointerType === "touch") accountLastTouch = Date.now();
      });

      menu.addEventListener("pointerenter", function (event) {
        if (event.pointerType === "touch") return;
        if (Date.now() - accountLastTouch < 800) return;
        openAccountMenu();
      });

      menu.addEventListener("pointerleave", function (event) {
        if (event.pointerType === "touch") return;
        if (Date.now() - accountLastTouch < 800) return;
        window.clearTimeout(accountCloseTimer);
        accountCloseTimer = window.setTimeout(closeAccountMenu, 180);
      });

      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var touchToggle = accountPointer === "touch" || event.detail === 0;
        if (touchToggle) {
          if (menu.classList.contains("is-open")) closeAccountMenu();
          else openAccountMenu();
          return;
        }
        openAccountMenu();
      });

      menu.addEventListener("focusout", function () {
        window.setTimeout(function () {
          if (!menu.contains(document.activeElement)) closeAccountMenu();
        }, 0);
      });

      menu.addEventListener("click", function (event) {
        var actionEl = event.target.closest("[data-account-action]");
        if (actionEl) {
          event.preventDefault();
          var action = actionEl.getAttribute("data-account-action");
          closeAccountMenu();
          if (action === "logout") {
            store.logout();
            toast("Signed out");
          } else {
            checkoutAfterLogin = false;
            showLoginStep();
          }
          return;
        }
        if (event.target.closest("a")) closeAccountMenu();
      });

      document.addEventListener("click", function (event) {
        if (!menu.classList.contains("is-open")) return;
        if (menu.contains(event.target)) return;
        closeAccountMenu();
      });

      var navToggle = document.querySelector("[data-nav-toggle]");
      if (navToggle) {
        navToggle.addEventListener("click", closeAccountMenu);
      }

      window.addEventListener("real100agro:user-change", function () {
        renderAccountMenu(menu);
      });
    }

    mountShell();
    bindShell();
    bindPage();
    ensureAccountMenu();
    updateCartBadge();
    if (store.ready) {
      store.ready().then(function () {
        updateCartBadge();
        var menu = document.querySelector("[data-account-menu]");
        if (menu) renderAccountMenu(menu);
      }).catch(function () {});
    }

    window.real100agro.commerce = {
      openCart: openCart,
      closeCart: closeCart,
      startCheckout: startCheckout,
      showLoginStep: showLoginStep,
      updateCartBadge: updateCartBadge,
    };
  });
})();
