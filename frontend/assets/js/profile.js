/* Profile page — account, addresses, my orders (Django API). */

(function () {
  "use strict";

  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  onReady(function () {
    var pageFile = (location.pathname || "").split("/").pop();
    if (pageFile === "profile.html" && location.hash === "#orders") {
      location.replace("orders.html");
      return;
    }
    if (pageFile === "profile.html" && location.hash === "#addresses") {
      location.replace("addresses.html");
      return;
    }

    var store = window.real100agro && window.real100agro.store;
    if (!store) return;
    var profileSavedUntil = 0;
    var editing = { name: false, email: false };

    function escapeHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function formatDate(iso) {
      try {
        var d = new Date(iso);
        return d.toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch (e) {
        return iso;
      }
    }

    function renderAccount() {
      var body = document.querySelector("[data-profile-account-body]");
      if (!body) return;
      var user = store.getUser();
      if (!user || !user.loggedIn) {
        body.innerHTML =
          '<p class="profile-empty">You are not logged in.</p>' +
          '<div class="profile-actions">' +
          '<button class="button button--primary" type="button" data-open-login>Login with mobile</button>' +
          "</div>";
        return;
      }
      var draftName = user.name || "";
      var draftEmail = user.email || "";
      var existing = body.querySelector("[data-profile-details]");
      if (existing) {
        var liveName = existing.querySelector('[name="name"]');
        var liveEmail = existing.querySelector('[name="email"]');
        if (liveName && (editing.name || liveName.value.trim() !== (user.name || ""))) {
          draftName = liveName.value;
          editing.name = true;
        }
        if (liveEmail && (editing.email || liveEmail.value.trim().toLowerCase() !== (user.email || ""))) {
          draftEmail = liveEmail.value;
          editing.email = true;
        }
      }
      var nameLocked = !!(user.name) && !editing.name;
      var emailLocked = !!(user.email) && !editing.email;
      var dirty =
        draftName.trim() !== (user.name || "") ||
        draftEmail.trim().toLowerCase() !== (user.email || "");
      body.innerHTML =
        '<form class="profile-details" data-profile-details>' +
        '<p class="profile-meta"><span>+91 ' +
        escapeHtml(user.phone) +
        "</span></p>" +
        profileField("Name", "name", "text", draftName, nameLocked, !!user.name) +
        profileField("Email", "email", "email", draftEmail, emailLocked, !!user.email) +
        '<p class="commerce-error" data-profile-error hidden></p>' +
        '<p class="commerce-hint" data-profile-saved' +
        (Date.now() < profileSavedUntil && !dirty ? "" : " hidden") +
        ">Saved.</p>" +
        '<div class="profile-actions">' +
        '<button class="button button--primary" type="submit" data-profile-save' +
        (dirty ? "" : " hidden") +
        ">Save</button>" +
        '<button class="button button--outline" type="button" data-profile-logout>Logout</button>' +
        "</div>" +
        "</form>";
    }

    function profileField(label, name, type, value, locked, showEdit) {
      var extra = type === "email"
        ? ' autocomplete="email" placeholder="you@email.com"'
        : ' autocomplete="name" maxlength="120"';
      return (
        '<label class="commerce-field"><span>' + label + "</span>" +
        '<span class="profile-field">' +
        '<input type="' + type + '" name="' + name + '" value="' + escapeHtml(value) + '"' +
        extra +
        (locked ? " disabled" : "") +
        ">" +
        (showEdit
          ? '<button class="profile-field__edit" type="button" data-profile-edit="' + name + '">Edit</button>'
          : "") +
        "</span></label>"
      );
    }

    function profileDirty(form) {
      var user = store.getUser() || {};
      var nameInput = form.querySelector('[name="name"]');
      var emailInput = form.querySelector('[name="email"]');
      var name = nameInput ? nameInput.value.trim() : "";
      var email = emailInput ? emailInput.value.trim().toLowerCase() : "";
      return name !== (user.name || "") || email !== (user.email || "");
    }

    function renderAddresses() {
      var body = document.querySelector("[data-profile-addresses-body]");
      if (!body) return;
      if (!store.isLoggedIn()) {
        body.innerHTML =
          '<p class="profile-empty">Login to manage saved addresses.</p>';
        return;
      }
      var list = store.getAddresses();
      if (!list.length) {
        body.innerHTML =
          '<p class="profile-empty">No addresses yet. Add one when you place an order.</p>';
        return;
      }
      body.innerHTML =
        '<div class="profile-address-list">' +
        list
          .map(function (a) {
            return (
              '<article class="profile-address-item">' +
              "<strong>" +
              escapeHtml(a.name) +
              (a.forSomeoneElse
                ? ' <span class="order-card__status">(someone else)</span>'
                : "") +
              "</strong>" +
              "<p>" +
              escapeHtml(a.line1) +
              (a.line2 ? ", " + escapeHtml(a.line2) : "") +
              "</p>" +
              "<p>" +
              escapeHtml(a.city) +
              ", " +
              escapeHtml(a.state) +
              " — " +
              escapeHtml(a.pincode) +
              "</p>" +
              "<p>+91 " +
              escapeHtml(a.phone) +
              "</p>" +
              (a.email ? "<p>" + escapeHtml(a.email) + "</p>" : "") +
              '<button class="cart-line__remove" type="button" data-profile-remove-address="' +
              escapeHtml(a.id) +
              '">Remove</button>' +
              "</article>"
            );
          })
          .join("") +
        "</div>";
    }

    function renderOrders() {
      var body = document.querySelector("[data-profile-orders-body]");
      if (!body) return;
      if (!store.isLoggedIn()) {
        body.innerHTML =
          '<p class="profile-empty">Login to see your orders.</p>';
        return;
      }
      var user = store.getUser();
      function last10(value) {
        return String(value || "").replace(/\D/g, "").slice(-10);
      }
      var orders = store.getOrders().filter(function (o) {
        return last10(o.phone) === last10(user.phone);
      });
      if (!orders.length) {
        body.innerHTML =
          '<p class="profile-empty">No orders yet. Add ghee to your cart and place an order.</p>' +
          '<div class="profile-actions">' +
          '<a class="button button--primary" href="products.html#all">Shop products</a>' +
          "</div>";
        return;
      }
      body.innerHTML =
        '<div class="order-list">' +
        orders
          .map(function (order) {
            var slugByVariant = {};
            Object.keys(store.getProducts() || {}).forEach(function (slug) {
              var p = store.getProduct(slug);
              (p.variants || []).forEach(function (v) { slugByVariant[v.id] = slug; });
            });
            var items = (order.items || [])
              .map(function (item) {
                var slug = slugByVariant[item.id] || "";
                var reviewLink = slug
                  ? ' <a href="product.html?slug=' + encodeURIComponent(slug) + '&review=1">Write a review</a>'
                  : "";
                var replaceBtn = order.status === "delivered" && item.orderItemId
                  ? ' <button class="button button--ghost" type="button" data-order-replacement="' +
                    item.orderItemId + '" data-order-id="' + (order.numericId || "") +
                    '">Request replacement</button>'
                  : "";
                return (
                  "<li>" +
                  escapeHtml(item.name) +
                  " × " +
                  item.qty +
                  " — " +
                  store.formatPrice(item.lineTotal) +
                  reviewLink + replaceBtn +
                  "</li>"
                );
              })
              .join("");
            var canCancel = order.status === "placed" || order.status === "confirmed";
            return (
              '<article class="order-card" data-order-card="' + (order.numericId || "") + '">' +
              '<div class="order-card__head">' +
              '<p class="order-card__id">' +
              escapeHtml(order.id) +
              "</p>" +
              '<span class="order-card__status">' +
              escapeHtml(order.status || "Placed") +
              "</span>" +
              "</div>" +
              '<p class="order-card__meta">' +
              formatDate(order.createdAt) +
              " · Total " +
              store.formatPrice(order.total) +
              "</p>" +
              '<p class="order-card__meta">Deliver to ' +
              escapeHtml(order.address && order.address.name) +
              ", " +
              escapeHtml(order.address && order.address.city) +
              "</p>" +
              '<ul class="order-card__items">' +
              items +
              "</ul>" +
              '<p class="order-card__detail" data-order-detail hidden></p>' +
              '<div class="order-card__actions">' +
              '<button class="button button--ghost" type="button" data-order-track="' + (order.numericId || "") + '">Track order</button>' +
              (canCancel
                ? '<button class="button button--ghost" type="button" data-order-cancel="' + (order.numericId || "") + '">Cancel order</button>'
                : "") +
              "</div>" +
              "</article>"
            );
          })
          .join("") +
        "</div>";
    }

    function paint() {
      renderAccount();
      renderAddresses();
      renderOrders();
    }

    function loadLists() {
      var start = store.ready ? store.ready() : Promise.resolve();
      return start.then(function () {
        if (!store.isLoggedIn()) return null;
        return store.refreshAddresses();
      }).then(function () {
        if (!store.isLoggedIn()) return null;
        return store.refreshOrders();
      }).catch(function () {});
    }

    function orderDetailEl(orderId) {
      var card = document.querySelector('[data-order-card="' + orderId + '"]');
      return card ? card.querySelector("[data-order-detail]") : null;
    }
    function showOrderDetail(orderId, text) {
      var el = orderDetailEl(orderId);
      if (!el) return;
      el.textContent = text;
      el.removeAttribute("hidden");
    }

    document.addEventListener("input", function (event) {
      var form = event.target.closest && event.target.closest("[data-profile-details]");
      if (!form) return;
      var save = form.querySelector("[data-profile-save]");
      var note = form.querySelector("[data-profile-saved]");
      var dirty = profileDirty(form);
      if (save) save.hidden = !dirty;
      if (note && dirty) note.hidden = true;
    });

    document.addEventListener("submit", function (event) {
      var form = event.target.closest("[data-profile-details]");
      if (!form) return;
      event.preventDefault();
      var err = form.querySelector("[data-profile-error]");
      var saved = form.querySelector("[data-profile-saved]");
      var nameInput = form.querySelector('[name="name"]');
      var emailInput = form.querySelector('[name="email"]');
      var name = nameInput ? nameInput.value.trim() : "";
      var email = emailInput ? emailInput.value.trim().toLowerCase() : "";
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (err) {
          err.textContent = "Enter a valid email, or leave it blank.";
          err.removeAttribute("hidden");
        }
        if (saved) saved.setAttribute("hidden", "");
        return;
      }
      if (err) err.setAttribute("hidden", "");
      var button = form.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      store.updateProfile({ name: name, email: email }).then(function () {
        editing.name = false;
        editing.email = false;
        profileSavedUntil = Date.now() + 4000;
        renderAccount();
      }).catch(function (e) {
        var current = document.querySelector("[data-profile-error]");
        if (current) {
          current.textContent = (e && e.message) || "Could not save.";
          current.removeAttribute("hidden");
        }
        if (button) button.disabled = false;
      });
    });

    document.addEventListener("click", function (event) {
      var editBtn = event.target.closest("[data-profile-edit]");
      if (editBtn) {
        event.preventDefault();
        var field = editBtn.getAttribute("data-profile-edit");
        editing[field] = true;
        var input = editBtn.parentElement && editBtn.parentElement.querySelector("input");
        if (input) {
          input.disabled = false;
          input.focus();
          var end = input.value.length;
          if (input.setSelectionRange) input.setSelectionRange(end, end);
        }
        return;
      }
      var logout = event.target.closest("[data-profile-logout]");
      if (logout) {
        editing.name = false;
        editing.email = false;
        store.logout();
        paint();
        return;
      }
      var remove = event.target.closest("[data-profile-remove-address]");
      if (remove) {
        store.removeAddress(remove.getAttribute("data-profile-remove-address")).then(paint).catch(paint);
      }
      var api = window.real100agro && window.real100agro.api;
      var track = event.target.closest("[data-order-track]");
      if (track) {
        var trackId = track.getAttribute("data-order-track");
        showOrderDetail(trackId, "Checking tracking…");
        api.request("/orders/" + encodeURIComponent(trackId) + "/tracking/").then(function (t) {
          showOrderDetail(trackId,
            "Status: " + (t.status || "—") +
            (t.awb ? " · AWB: " + t.awb : "") +
            (t.courier ? " · Courier: " + t.courier : " · Tracking updates once the order ships."));
        }).catch(function (err) {
          showOrderDetail(trackId, (err && err.message) || "Could not load tracking.");
        });
        return;
      }
      var cancel = event.target.closest("[data-order-cancel]");
      if (cancel) {
        var cancelId = cancel.getAttribute("data-order-cancel");
        if (!window.confirm("Cancel this order? Stock will be restored.")) return;
        api.request("/orders/" + encodeURIComponent(cancelId) + "/cancel/", { method: "POST" }).then(function () {
          store.refreshOrders().then(paint);
        }).catch(function (err) {
          showOrderDetail(cancelId, (err && err.message) || "Could not cancel this order.");
        });
        return;
      }
      var replace = event.target.closest("[data-order-replacement]");
      if (replace) {
        var orderId = replace.getAttribute("data-order-id");
        var itemId = replace.getAttribute("data-order-replacement");
        var reason = window.prompt("What happened to the jar? (leaked / damaged / wrong_item / other)", "leaked");
        if (!reason) return;
        api.request("/orders/" + encodeURIComponent(orderId) + "/replacements/", {
          method: "POST",
          body: { order_item: parseInt(itemId, 10), reason: reason, note: "Requested from My Orders" },
        }).then(function () {
          showOrderDetail(orderId, "Replacement requested — we will ship only the damaged jar, not the whole order.");
        }).catch(function (err) {
          showOrderDetail(orderId, (err && err.message) || "Could not request a replacement.");
        });
      }
    });

    window.addEventListener("real100agro:user-change", paint);
    window.addEventListener("real100agro:addresses-change", paint);
    window.addEventListener("real100agro:orders-change", paint);

    paint();
    loadLists();
  });
})();
