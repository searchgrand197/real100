/* real100agro — commerce store backed by the Django API (see api.js).
   Products, cart, auth, addresses and orders all live on the server.
   Only the DRF auth token is kept in localStorage (api.js).
   Cart mutations update the local cache optimistically so the drawer
   stays snappy; the server is the source of truth and is re-fetched
   on load. Product images fall back to the placeholder URLs below
   until real photos are uploaded in the Django admin. */

(function () {
  "use strict";

  var IMAGE_FALLBACK = {
    "a2-ghee-1l": "assets/images/products/a2-desi-cow-1l.png",
    "a2-ghee-500ml": "assets/images/products/a2-desi-cow-1l.png",
    "buffalo-ghee-1l": "assets/images/products/buffalo-ghee-1l.png",
    "a2-ghee-gift": "assets/images/products/a2-desi-cow-1l.png",
    "a2-buffalo-combo": "assets/images/products/buffalo-ghee-1l.png",
    "a2-gir-ghee-1l": "assets/images/products/a2-gir-cow-1l.png",
    "pahadi-cow-ghee-1l": "assets/images/products/pahadi-cow-1l.png",
    "a2-ghee-5l": "assets/images/products/a2-desi-cow-5l.png",
  };

  var SIZE_LABEL = {
    "a2-ghee-1l": "1 Litre",
    "a2-ghee-500ml": "500 ml",
    "buffalo-ghee-1l": "1 Litre",
    "a2-ghee-gift": "Gift Pack",
    "a2-buffalo-combo": "Combo",
    "a2-gir-ghee-1l": "1 Litre",
    "pahadi-cow-ghee-1l": "1 Litre",
    "a2-ghee-5l": "5 Litre",
  };

  var PRODUCTS = {}; // slug -> {id(slug), name, size, price, oldPrice, image, variants:[{id, size_label, price, mrp, stock}]}
  var cartCache = []; // [{id: slug, variantId, name, size, image, price, oldPrice, qty, lineTotal}]
  var userCache = null; // {phone, name, email, loggedIn}
  var addressesCache = [];
  var addressesFetchGen = 0;
  var ordersCache = [];
  var loaded = false;

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || null })); } catch (e) { /* ignore */ }
  }

  function apiClient() {
    return window.real100agro && window.real100agro.api;
  }

  function productFromApi(p) {
    var variant = (p.variants && p.variants[0]) || null;
    var uploaded = (p.images || []).filter(function (img) { return img && img.image; }).map(function (img) {
      return { src: img.image, alt: img.alt_text || p.name };
    });
    var images = uploaded.length
      ? uploaded
      : (IMAGE_FALLBACK[p.slug] ? [{ src: IMAGE_FALLBACK[p.slug], alt: p.name }] : []);
    return {
      id: p.slug,
      name: p.name,
      description: p.description || "",
      categorySlug: (p.category && p.category.slug) || "",
      categoryName: (p.category && p.category.name) || "",
      isFeatured: !!p.is_featured,
      isBestseller: !!p.is_bestseller,
      isPreorder: !!p.is_preorder,
      ratingAverage: p.rating_average,
      ratingCount: p.rating_count || 0,
      size: SIZE_LABEL[p.slug] || (variant ? variant.size_label : ""),
      price: variant ? Number(variant.price) : Number(p.price || 0),
      oldPrice: variant ? Number(variant.mrp) : 0,
      image: images.length ? images[0].src : "",
      images: images,
      hasUploadedImages: uploaded.length > 0,
      variants: (p.variants || []).map(function (v) {
        return { id: v.id, size_label: v.size_label, price: Number(v.price), mrp: Number(v.mrp), stock: v.stock, available_stock: v.available_stock, weight_grams: v.weight_grams || 0, in_stock: v.in_stock, is_combo: !!v.is_combo };
      }),
    };
  }

  function refreshProducts() {
    return apiClient().request("/products/?page_size=100").then(function (data) {
      var list = data.results || data;
      PRODUCTS = {};
      list.forEach(function (p) { PRODUCTS[p.slug] = productFromApi(p); });
      return PRODUCTS;
    });
  }

  function refreshCart() {
    return apiClient().request("/cart/").then(function (data) {
      cartCache = (data.items || []).map(function (item) {
        var slug = null, product = null;
        // Match the item's variant to a product by variant id.
        Object.keys(PRODUCTS).forEach(function (key) {
          (PRODUCTS[key].variants || []).forEach(function (v) {
            if (v.id === item.variant) { slug = key; product = PRODUCTS[key]; }
          });
        });
        var price = Number(item.price || (product ? product.price : 0));
        return {
          id: slug || String(item.variant),
          variantId: item.variant,
          name: item.product_name || (product ? product.name : ""),
          size: item.size_label || (product ? product.size : ""),
          image: product ? product.image : "",
          price: price,
          oldPrice: product ? product.oldPrice : 0,
          qty: item.quantity,
          lineTotal: price * item.quantity,
        };
      });
      emit("real100agro:cart-change", { cart: cartCache });
      return cartCache;
    });
  }

  function userFromApi(u) {
    return {
      phone: String(u.phone || "").replace(/\D/g, "").slice(-10),
      name: u.name || "",
      email: String(u.email || "").trim().toLowerCase(),
      loggedIn: true,
    };
  }

  function refreshUser() {
    if (!apiClient().getToken()) { userCache = null; return Promise.resolve(null); }
    return apiClient().request("/auth/me/").then(function (u) {
      userCache = userFromApi(u);
      emit("real100agro:user-change", { user: userCache });
      return userCache;
    }).catch(function () { userCache = null; return null; });
  }

  function refreshAddresses() {
    if (!isLoggedIn()) {
      addressesFetchGen += 1;
      addressesCache = [];
      return Promise.resolve([]);
    }
    var gen = ++addressesFetchGen;
    return apiClient().request("/addresses/").then(function (data) {
      // A slower, older response must not wipe an address that was just saved.
      if (gen !== addressesFetchGen) return addressesCache.slice();
      var list = (data && data.results) || data;
      if (!Array.isArray(list)) list = [];
      addressesCache = list.map(function (a) {
        return {
          id: String(a.id), name: a.name || "", phone: String(a.phone || "").replace(/\D/g, ""),
          email: String(a.email || "").trim().toLowerCase(),
          line1: a.address_line1 || "", line2: a.address_line2 || "",
          city: a.city || "", state: a.state || "", pincode: a.pincode || "", forSomeoneElse: false,
        };
      });
      emit("real100agro:addresses-change", { addresses: addressesCache });
      return addressesCache.slice();
    });
  }

  function refreshOrders() {
    if (!isLoggedIn()) { ordersCache = []; return Promise.resolve([]); }
    return apiClient().request("/orders/").then(function (data) {
      var list = data.results || data;
      ordersCache = list.map(function (o) {
        return {
          id: o.order_number, numericId: o.id, createdAt: o.created_at, status: o.status,
          paymentStatus: o.payment_status, awb: o.delhivery_awb || "",
          phone: o.phone, total: Number(o.total),
          address: { name: o.name, city: o.city },
          items: (o.items || []).map(function (it) {
            return { id: it.variant, orderItemId: it.id, name: it.product_name, size: it.size_label, price: Number(it.price), qty: it.quantity, lineTotal: Number(it.price) * it.quantity };
          }),
          itemCount: (o.items || []).reduce(function (s, it) { return s + it.quantity; }, 0),
        };
      });
      emit("real100agro:orders-change", { orders: ordersCache });
      return ordersCache;
    });
  }

  var readyPromise = null;
  function ready() {
    if (!readyPromise) {
      readyPromise = refreshProducts()
        .catch(function () { return {}; })
        .then(refreshCart)
        .catch(function () { return []; })
        .then(refreshUser)
        .catch(function () { return null; })
        .then(function () {
          if (!isLoggedIn()) return [];
          return refreshAddresses();
        })
        .catch(function () { return []; })
        .then(function () {
          if (!isLoggedIn()) return [];
          return refreshOrders();
        })
        .catch(function () { return []; })
        .then(function () { loaded = true; return true; });
    }
    return readyPromise;
  }

  /* ---------- Sync reads (from cache; call ready() first) ---------- */
  function getProduct(id) { return PRODUCTS[id] || null; }
  function getProducts() { return PRODUCTS; }
  function getCart() { return cartCache.slice(); }
  function cartCount() { return cartCache.reduce(function (s, it) { return s + (parseInt(it.qty, 10) || 0); }, 0); }
  function cartLines() { return cartCache.slice(); }
  function cartTotal() { return cartCache.reduce(function (s, it) { return s + it.lineTotal; }, 0); }
  function getUser() { return userCache; }
  function isLoggedIn() { return !!(userCache && userCache.loggedIn); }
  function getAddresses() { return addressesCache.slice(); }
  function getAddress(id) {
    for (var i = 0; i < addressesCache.length; i++) if (String(addressesCache[i].id) === String(id)) return addressesCache[i];
    return null;
  }
  function getOrders() { return ordersCache.slice(); }

  /* ---------- Cart (optimistic cache + server) ---------- */
  function resolveVariant(productId) {
    var product = PRODUCTS[productId];
    if (!product || !product.variants || !product.variants.length) return null;
    return product.variants[0];
  }

  function addToCart(productId, qty, variantId) {
    var product = PRODUCTS[productId];
    var variant = null;
    if (variantId) {
      (product && product.variants || []).forEach(function (v) {
        if (String(v.id) === String(variantId)) variant = v;
      });
    }
    if (!variant) variant = resolveVariant(productId);
    if (!product || !variant) return Promise.resolve(false);
    var amount = parseInt(qty, 10);
    if (isNaN(amount) || amount < 1) amount = 1;
    if (amount > 20) amount = 20;
    var existing = null;
    cartCache.forEach(function (it) { if (it.variantId === variant.id) existing = it; });
    var newQty = Math.min(20, (existing ? existing.qty : 0) + amount);
    if (existing) { existing.qty = newQty; existing.lineTotal = existing.price * newQty; }
    else {
      cartCache.push({ id: productId, variantId: variant.id, name: product.name, size: variant.size_label || product.size, image: product.image, price: variant.price, oldPrice: variant.mrp, qty: newQty, lineTotal: variant.price * newQty });
    }
    emit("real100agro:cart-change", { cart: cartCache });
    return apiClient().request("/cart/", { method: "POST", body: { variant: variant.id, quantity: newQty } })
      .then(refreshCart)
      .then(function () { return true; })
      .catch(function (err) { refreshCart(); throw err; });
  }

  function setQty(productId, qty) {
    var amount = parseInt(qty, 10);
    var item = null;
    cartCache.forEach(function (it) { if (it.id === productId) item = it; });
    if (isNaN(amount) || amount < 1) return removeFromCart(productId);
    amount = Math.min(20, amount);
    if (item) { item.qty = amount; item.lineTotal = item.price * amount; }
    emit("real100agro:cart-change", { cart: cartCache });
    var variantId = item ? item.variantId : (resolveVariant(productId) || {}).id;
    if (!variantId) return Promise.resolve();
    return apiClient().request("/cart/", { method: "POST", body: { variant: variantId, quantity: amount } })
      .then(refreshCart).catch(function (err) { refreshCart(); throw err; });
  }

  function removeFromCart(productId) {
    var item = null;
    cartCache.forEach(function (it) { if (it.id === productId) item = it; });
    cartCache = cartCache.filter(function (it) { return it.id !== productId; });
    emit("real100agro:cart-change", { cart: cartCache });
    if (!item) return Promise.resolve();
    return apiClient().request("/cart/?variant=" + encodeURIComponent(item.variantId), { method: "DELETE" })
      .then(refreshCart).catch(function (err) { refreshCart(); throw err; });
  }

  function clearCart() {
    cartCache = [];
    emit("real100agro:cart-change", { cart: cartCache });
    return Promise.resolve();
  }

  /* ---------- Auth (Firebase OTP -> backend token) ---------- */
  function requestOtp(phone) {
    var cleaned = String(phone || "").replace(/\D/g, "");
    if (cleaned.length !== 10) return Promise.reject(new Error("Enter a valid 10-digit mobile number."));
    return apiClient().sendOtp(cleaned);
  }

  function verifyOtp(code) {
    return apiClient().verifyOtp(code).then(function (idToken) {
      return apiClient().request("/auth/firebase-login/", { method: "POST", body: { id_token: idToken } });
    }).then(function (data) {
      apiClient().setToken(data.token);
      userCache = userFromApi(data.user);
      emit("real100agro:user-change", { user: userCache });
      return refreshAddresses().then(refreshOrders).then(function () { return userCache; });
    });
  }

  function logout() {
    apiClient().setToken("");
    if (apiClient().signOutFirebase) apiClient().signOutFirebase();
    userCache = null;
    addressesCache = [];
    ordersCache = [];
    emit("real100agro:user-change", { user: null });
    return refreshCart();
  }

  function updateProfile(fields) {
    if (!isLoggedIn()) return Promise.reject(new Error("Login to save your profile."));
    var body = {};
    if (Object.prototype.hasOwnProperty.call(fields, "name")) {
      body.name = String(fields.name || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(fields, "email")) {
      body.email = String(fields.email || "").trim().toLowerCase();
    }
    return apiClient().request("/auth/me/", { method: "PATCH", body: body }).then(function (u) {
      userCache = userFromApi(u);
      emit("real100agro:user-change", { user: userCache });
      return userCache;
    });
  }

  function setProfileName(name) {
    if (!isLoggedIn() || userCache.name) return Promise.resolve();
    return updateProfile({ name: name });
  }

  function setAccountEmail(email) {
    if (!isLoggedIn() || userCache.email) return Promise.resolve();
    var trimmed = String(email || "").trim().toLowerCase();
    if (!trimmed) return Promise.resolve();
    return updateProfile({ email: trimmed });
  }

  /* ---------- Addresses ---------- */
  function addAddress(address, options) {
    options = options || {};
    var payload = {
      label: "Home",
      name: String(address.name || "").trim(),
      phone: String(address.phone || "").replace(/\D/g, ""),
      email: String(address.email || "").trim().toLowerCase(),
      address_line1: String(address.line1 || "").trim(),
      address_line2: String(address.line2 || "").trim(),
      city: String(address.city || "").trim(),
      state: String(address.state || "").trim(),
      pincode: String(address.pincode || "").replace(/\D/g, ""),
    };
    return apiClient().request("/addresses/", { method: "POST", body: payload }).then(function (a) {
      var entry = {
        id: String(a.id), name: a.name, phone: payload.phone, email: payload.email,
        line1: a.address_line1, line2: a.address_line2 || "", city: a.city, state: a.state,
        pincode: a.pincode, forSomeoneElse: !!address.forSomeoneElse,
      };
      addressesCache.push(entry);
      emit("real100agro:addresses-change", { addresses: addressesCache });
      // Profile name/email is a side effect. A failure there must not
      // hide the address that was just saved or block checkout.
      var named = (!options.skipProfileName && !entry.forSomeoneElse)
        ? setProfileName(entry.name)
        : Promise.resolve();
      return named.catch(function () { return null; })
        .then(function () { return setAccountEmail(entry.email); })
        .catch(function () { return null; })
        .then(function () { return entry; });
    });
  }

  function removeAddress(id) {
    addressesCache = addressesCache.filter(function (a) { return String(a.id) !== String(id); });
    emit("real100agro:addresses-change", { addresses: addressesCache });
    return apiClient().request("/addresses/" + encodeURIComponent(id) + "/", { method: "DELETE" }).then(refreshAddresses);
  }

  /* ---------- Orders / checkout ---------- */
  function placeOrder(addressId, paymentMethod, couponCode) {
    var body = { payment_method: paymentMethod || "cod" };
    if (addressId) body.address_id = parseInt(addressId, 10);
    if (couponCode) body.coupon_code = couponCode;
    return apiClient().request("/checkout/", { method: "POST", body: body }).then(function (data) {
      var order = data.order;
      var mapped = {
        id: order.order_number, numericId: order.id, createdAt: order.created_at, status: order.status,
        phone: order.phone, total: Number(order.total),
        address: { name: order.name, city: order.city },
        items: (order.items || []).map(function (it) {
          return { id: it.variant, name: it.product_name, size: it.size_label, price: Number(it.price), qty: it.quantity, lineTotal: Number(it.price) * it.quantity };
        }),
        itemCount: (order.items || []).reduce(function (s, it) { return s + it.quantity; }, 0),
      };
      ordersCache.unshift(mapped);
      cartCache = [];
      emit("real100agro:cart-change", { cart: cartCache });
      emit("real100agro:orders-change", { orders: ordersCache });
      return { order: mapped, razorpay_order: data.razorpay_order || null };
    });
  }

  function formatPrice(n) {
    var num = Math.round(Number(n) || 0);
    return "₹" + num.toLocaleString("en-IN");
  }

  var api = (window.real100agro = window.real100agro || {});
  api.store = {
    ready: ready,
    isReady: function () { return loaded; },
    getProduct: getProduct,
    getProducts: getProducts,
    getCart: getCart,
    cartCount: cartCount,
    cartLines: cartLines,
    cartTotal: cartTotal,
    addToCart: addToCart,
    setQty: setQty,
    removeFromCart: removeFromCart,
    clearCart: clearCart,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    requestOtp: requestOtp,
    verifyOtp: verifyOtp,
    logout: logout,
    setProfileName: setProfileName,
    setAccountEmail: setAccountEmail,
    updateProfile: updateProfile,
    getAddresses: getAddresses,
    addAddress: addAddress,
    getAddress: getAddress,
    removeAddress: removeAddress,
    getOrders: getOrders,
    refreshOrders: refreshOrders,
    refreshAddresses: refreshAddresses,
    placeOrder: placeOrder,
    formatPrice: formatPrice,
  };

  // Start loading in the background as soon as this file loads.
  ready();
})();
