/* real100agro — frontend-only homepage behaviour.
   No framework, no build step. Plain, widely supported JavaScript
   (Chrome, Firefox, Safari, Edge) so this file also drops cleanly
   into Django templates later.

   Cart, newsletter and contact form all call the Django API
   (api.js + store.js + commerce.js). */

(function () {
  "use strict";

  function onReady(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  /* Shared flag so Benefits / Journey scroll-pins release for in-page
     nav (html { scroll-behavior: smooth } otherwise fights the lock). */
  var api = (window.real100agro = window.real100agro || {});
  api.pinsSuppressed = false;
  var pinSuppressRaf = null;
  var pinSuppressTimer = null;

  function clearPinSuppress() {
    api.pinsSuppressed = false;
    if (pinSuppressRaf) {
      window.cancelAnimationFrame(pinSuppressRaf);
      pinSuppressRaf = null;
    }
    if (pinSuppressTimer) {
      window.clearTimeout(pinSuppressTimer);
      pinSuppressTimer = null;
    }
  }

  function suppressScrollPins(targetEl) {
    api.pinsSuppressed = true;
    try {
      window.dispatchEvent(new CustomEvent("real100agro:suppress-pins"));
    } catch (err) {
      /* IE-era CustomEvent gaps — flag alone is enough for modern browsers. */
    }
    if (pinSuppressRaf) window.cancelAnimationFrame(pinSuppressRaf);
    if (pinSuppressTimer) window.clearTimeout(pinSuppressTimer);

    var start = Date.now();
    function tick() {
      var done = Date.now() - start > 3000;
      if (!done && targetEl && targetEl.getBoundingClientRect) {
        var top = targetEl.getBoundingClientRect().top;
        /* Settled near the destination (header ~72–88px). */
        if (Math.abs(top) < 120) done = true;
      }
      if (done) {
        clearPinSuppress();
        return;
      }
      pinSuppressRaf = window.requestAnimationFrame(tick);
    }
    pinSuppressRaf = window.requestAnimationFrame(tick);
    pinSuppressTimer = window.setTimeout(clearPinSuppress, 3200);
  }

  api.suppressScrollPins = suppressScrollPins;

  onReady(function () {
    /* Hash links (nav, hero CTAs, footer): release pinned sections
       before smooth scroll so they cannot snap the page back. */
    document.addEventListener(
      "click",
      function (event) {
        var link =
          event.target && event.target.closest
            ? event.target.closest('a[href^="#"]')
            : null;
        if (!link) return;
        var href = link.getAttribute("href");
        if (!href || href.length < 2) return;
        var target = document.querySelector(href);
        if (!target) return;
        suppressScrollPins(target);
      },
      true
    );

    /* Position-aware button ripple (Kyle Brumm btn-6 style).
       Any .button / .pill / chrome control gets it via delegation —
       new markup only needs those classes; no extra HTML or JS. */
    /* Cart is omitted: its count badge sits outside the clipped icon
       face, and the expanding maroon ripple would paint over the pill. */
    var RIPPLE_SEL =
      ".button, .pill, .nav-toggle, .search-form__button, .trust-media__play, .video-frame__play, .video-card__play, .carousel-controls button";

    function closestRippleButton(node) {
      if (!node || !node.closest) return null;
      return node.closest(RIPPLE_SEL);
    }

    function ensureRipple(btn) {
      var ripple = btn.querySelector(".button__ripple");
      if (!ripple) {
        ripple = document.createElement("span");
        ripple.className = "button__ripple";
        ripple.setAttribute("aria-hidden", "true");
        btn.insertBefore(ripple, btn.firstChild);
      }
      return ripple;
    }

    /* Expand from the cursor. Collapse in place (do not jump the
       origin on leave) — that jump mid-size is what made the wave
       look broken on fast hover in/out. */
    function placeRipple(btn, event, expand) {
      var rect = btn.getBoundingClientRect();
      var ripple = ensureRipple(btn);
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;

      if (expand) {
        var size = Math.ceil(Math.hypot(rect.width, rect.height) * 2.25);
        ripple.classList.remove("is-on");
        /* Drop transition so origin/size reset at scale(0) without
           animating from the previous hover's mid-state. */
        ripple.style.transition = "none";
        ripple.style.left = x + "px";
        ripple.style.top = y + "px";
        ripple.style.width = size + "px";
        ripple.style.height = size + "px";
        void ripple.offsetWidth;
        ripple.style.transition = "";
        ripple.classList.add("is-on");
      } else {
        ripple.classList.remove("is-on");
      }
    }

    document.addEventListener("mouseover", function (event) {
      var btn = closestRippleButton(event.target);
      if (!btn) return;
      var from = closestRippleButton(event.relatedTarget);
      if (from === btn) return;
      placeRipple(btn, event, true);
    });

    document.addEventListener("mouseout", function (event) {
      var btn = closestRippleButton(event.target);
      if (!btn) return;
      var to = closestRippleButton(event.relatedTarget);
      if (to === btn) return;
      placeRipple(btn, event, false);
    });

    /* Mobile navigation — .is-open on .main-nav shows the links,
       .is-menu-open on .site-header shows the phone search inside
       the menu (see responsive.css). Both are cleared together. */
    var navToggle = document.querySelector("[data-nav-toggle]");
    var mainNav = document.querySelector("[data-main-nav]");
    var siteHeader = document.querySelector(".site-header");
    function closeMenu() {
      if (mainNav) mainNav.classList.remove("is-open");
      if (siteHeader) siteHeader.classList.remove("is-menu-open");
      if (navToggle) navToggle.setAttribute("aria-expanded", "false");
    }
    if (navToggle && mainNav) {
      navToggle.addEventListener("click", function () {
        var isOpen = mainNav.classList.toggle("is-open");
        if (siteHeader) {
          siteHeader.classList.toggle("is-menu-open", isOpen);
          /* Keep the bar reachable while the menu panel is open. */
          if (isOpen) siteHeader.classList.remove("is-hidden");
        }
        navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
      var navLinks = mainNav.querySelectorAll("a");
      for (var i = 0; i < navLinks.length; i++) {
        navLinks[i].addEventListener("click", closeMenu);
      }
    }

    /* Floating glass header: hide on scroll down, show on scroll up.
       Also toggles .is-scrolled so the pill can deepen its shadow.
       Stays visible near the top and while the mobile menu is open. */
    var headerTicking = false;
    var lastScrollY = window.scrollY || 0;
    var HEADER_TOP_REVEAL = 80;
    var HEADER_DIR_THRESHOLD = 6;
    function updateHeaderScrollState() {
      headerTicking = false;
      if (!siteHeader) return;

      var currentY = Math.max(0, window.scrollY || 0);
      var delta = currentY - lastScrollY;
      var menuOpen = siteHeader.classList.contains("is-menu-open");
      var accountOpen = !!document.querySelector("[data-account-menu].is-open");

      siteHeader.classList.toggle("is-scrolled", currentY > 40);

      if (menuOpen || accountOpen || currentY <= HEADER_TOP_REVEAL) {
        siteHeader.classList.remove("is-hidden");
      } else if (delta > HEADER_DIR_THRESHOLD) {
        siteHeader.classList.add("is-hidden");
      } else if (delta < -HEADER_DIR_THRESHOLD) {
        siteHeader.classList.remove("is-hidden");
      }

      /* Lets sticky page chrome (e.g. PDP gallery) reclaim the
         space the floating pill vacated while it is hidden. */
      document.body.classList.toggle(
        "is-nav-hidden",
        siteHeader.classList.contains("is-hidden")
      );

      lastScrollY = currentY;
    }
    updateHeaderScrollState();
    window.addEventListener("scroll", function () {
      if (headerTicking) return;
      headerTicking = true;
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(updateHeaderScrollState);
      } else {
        updateHeaderScrollState();
      }
    }, { passive: true });

    /* Logo fallback — if logo.png is not in the repo yet, show the
       text logo instead of a broken image. When logo.png arrives,
       the image shows and the text stays hidden by CSS. */
    var logoImage = document.querySelector(".logo__image");
    if (logoImage) {
      logoImage.addEventListener("error", function () {
        var logoLink = logoImage.closest(".logo");
        if (logoLink) logoLink.classList.add("logo--image-missing");
      });
      if (logoImage.complete && logoImage.naturalWidth === 0) {
        var logoLinkEarly = logoImage.closest(".logo");
        if (logoLinkEarly) logoLinkEarly.classList.add("logo--image-missing");
      }
    }

    /* Footer logo fallback — same file, same problem: if logo.png
       is missing, hide the broken footer image and show its text. */
    var footerLogo = document.querySelector(".footer-logo");
    if (footerLogo) {
      footerLogo.addEventListener("error", function () {
        var footerBrand = footerLogo.closest(".footer-brand");
        if (footerBrand) footerBrand.classList.add("footer-brand--logo-missing");
      });
      if (footerLogo.complete && footerLogo.naturalWidth === 0) {
        var footerBrandEarly = footerLogo.closest(".footer-brand");
        if (footerBrandEarly) footerBrandEarly.classList.add("footer-brand--logo-missing");
      }
    }

    /* Cart add / count handled by api.js + store.js + commerce.js (Django API). */

    /* Hero size pills update price only — photo stays hero_banner_image.png. */
    var heroPriceNow = document.querySelector("[data-hero-price-now]");
    var heroPriceOld = document.querySelector("[data-hero-price-old]");
    var heroSizeButtons = document.querySelectorAll("[data-hero-size]");
    var heroVariants = [
      { size: "500 ml", now: "₹1,299", old: "₹1,699" },
      { size: "1 Litre", now: "₹2,140", old: "₹2,790" },
      { size: "Gift Pack", now: "₹2,699", old: "₹3,199" },
    ];
    /* Prices come from the API when it loads (fallback above is the seed data). */
    (function syncHeroPrices() {
      var store = window.real100agro && window.real100agro.store;
      if (!store || !store.ready) return;
      store.ready().then(function () {
        var map = { "500 ml": "a2-ghee-500ml", "1 Litre": "a2-ghee-1l", "Gift Pack": "a2-ghee-gift" };
        heroVariants.forEach(function (v) {
          var p = store.getProduct(map[v.size]);
          if (!p) return;
          v.now = store.formatPrice(p.price);
          v.old = p.oldPrice ? store.formatPrice(p.oldPrice) : "";
        });
        var active = 0;
        for (var h = 0; h < heroSizeButtons.length; h++) {
          if (heroSizeButtons[h].getAttribute("aria-pressed") === "true") active = h;
        }
        showHeroVariant(active);
      }).catch(function () {});
    })();
    function showHeroVariant(index) {
      var variant = heroVariants[index];
      if (!variant) return;
      if (heroPriceNow) heroPriceNow.textContent = variant.now;
      if (heroPriceOld) heroPriceOld.textContent = variant.old;
      for (var k = 0; k < heroSizeButtons.length; k++) {
        var isActive =
          heroSizeButtons[k].getAttribute("data-hero-size") === variant.size;
        heroSizeButtons[k].setAttribute(
          "aria-pressed",
          isActive ? "true" : "false"
        );
      }
    }
    for (var m = 0; m < heroSizeButtons.length; m++) {
      (function (button, index) {
        button.addEventListener("click", function () {
          showHeroVariant(index);
        });
      })(heroSizeButtons[m], m);
    }

    /* Product filtering — homepage + products-page category pills.
       Nav All Products / Bestsellers maps to the All / Bestseller pills. */
    var filterButtons = document.querySelectorAll("[data-filter]");
    var productCards = document.querySelectorAll("[data-categories]");
    var productsNavLinks = document.querySelectorAll("[data-nav-products]");
    var productsEmpty = document.querySelector("[data-products-empty]");
    var searchForm = document.querySelector("[data-search-form]");
    var searchInput = document.querySelector("[data-search-input]");
    var isProductsPage = Boolean(document.getElementById("products-panel"));
    var activeCategory = "all";
    var activeQuery = "";

    function parseProductsHash() {
      var hash = (window.location.hash || "").replace(/^#/, "").toLowerCase();
      if (hash === "bestsellers" || hash === "bestseller") return "bestseller";
      if (
        hash === "all" ||
        hash === "a2" ||
        hash === "buffalo" ||
        hash === "gift" ||
        hash === "combo"
      ) {
        return hash;
      }
      // A category added in admin gets its own pill (content.js) whose
      // filter value is the category slug — accept any slug-like hash
      // so it filters instead of falling back to All.
      if (/^[a-z0-9-]+$/.test(hash)) return hash;
      return "all";
    }

    function readQueryParam(name) {
      try {
        var params = new URLSearchParams(window.location.search || "");
        return params.get(name) || "";
      } catch (err) {
        return "";
      }
    }

    function navViewFromCategory(category) {
      return category === "bestseller" ? "bestseller" : "all";
    }

    function syncProductsChrome() {
      var navView = navViewFromCategory(activeCategory);
      for (var n = 0; n < productsNavLinks.length; n++) {
        var linkView = productsNavLinks[n].getAttribute("data-nav-products");
        if (isProductsPage && linkView === navView) {
          productsNavLinks[n].setAttribute("aria-current", "page");
        } else {
          productsNavLinks[n].removeAttribute("aria-current");
        }
      }
      // Re-query each time: category pills added by content.js (from the
      // API) are not in the static NodeList captured at init.
      var liveButtons = document.querySelectorAll("[data-filter]");
      for (var p = 0; p < liveButtons.length; p++) {
        var active =
          liveButtons[p].getAttribute("data-filter") === activeCategory;
        liveButtons[p].setAttribute(
          "aria-pressed",
          active ? "true" : "false"
        );
      }
    }

    function applyProductVisibility() {
      var visibleCount = 0;
      for (var i = 0; i < productCards.length; i++) {
        var categories =
          productCards[i].getAttribute("data-categories") || "";
        var name = (
          productCards[i].getAttribute("data-name") || ""
        ).toLowerCase();
        var categoryList = categories.split(/\s+/);
        var matchesCategory =
          activeCategory === "all" ||
          categoryList.indexOf(activeCategory) !== -1;
        var matchesQuery =
          activeQuery === "" || name.indexOf(activeQuery) !== -1;
        var show = matchesCategory && matchesQuery;
        productCards[i].hidden = !show;
        if (show) visibleCount += 1;
      }
      if (productsEmpty) {
        productsEmpty.classList.toggle("is-visible", visibleCount === 0);
      }
    }

    function updateProductsHash(category) {
      if (!isProductsPage) return;
      var nextHash = category === "bestseller" ? "bestsellers" : category || "all";
      if ((window.location.hash || "").replace(/^#/, "") === nextHash) return;
      if (window.history && window.history.replaceState) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + "#" + nextHash
        );
      } else {
        window.location.hash = nextHash;
      }
    }

    function applyFilter(filter, options) {
      var opts = options || {};
      activeCategory = filter || "all";
      syncProductsChrome();
      applyProductVisibility();
      if (isProductsPage && opts.updateHash !== false) {
        updateProductsHash(activeCategory);
      }
    }

    for (var q = 0; q < filterButtons.length; q++) {
      filterButtons[q].addEventListener("click", function (event) {
        applyFilter(event.currentTarget.getAttribute("data-filter"), {
          updateHash: true,
        });
      });
    }

    if (isProductsPage) {
      window.addEventListener("hashchange", function () {
        applyFilter(parseProductsHash(), { updateHash: false });
      });
      var initialFilter = readQueryParam("filter").toLowerCase();
      var initialQuery = readQueryParam("q");
      if (initialQuery) {
        activeQuery = initialQuery.trim().toLowerCase();
        if (searchInput) searchInput.value = initialQuery;
      }
      if (initialFilter === "bestsellers") {
        initialFilter = "bestseller";
      }
      if (initialFilter && initialFilter !== "all") {
        applyFilter(initialFilter, { updateHash: true });
      } else {
        applyFilter(parseProductsHash(), { updateHash: true });
      }
    } else {
      applyFilter("all", { updateHash: false });
    }

    /* Product cards from the API — names, prices, stock and ratings
       come from the Django backend, so a product added or repriced in
       admin appears here after a refresh. The static cards in the HTML
       stay as the fallback if the API is unreachable. */
    var CATEGORY_ALIAS = {
      "a2-cow-ghee": "a2",
      "buffalo-ghee": "buffalo",
      "gift-sets": "gift",
      "combos": "combo",
    };
    var STAR_PATH_CARD =
      "M12 2.4l2.7 6.5 7 .6-5.3 4.5 1.7 7-6.1-3.7-6.1 3.7 1.7-7-5.3-4.5 7-.6L12 2.4z";
    function cardStarsHtml(avg) {
      var filled = Math.round(avg || 0);
      var html = "";
      for (var i = 1; i <= 5; i++) {
        html +=
          '<svg class="star-rating__star ' +
          (i <= filled ? "is-filled" : "is-empty") +
          '" viewBox="0 0 24 24"><path d="' + STAR_PATH_CARD + '"></path></svg>';
      }
      return html;
    }
    function productCardHtml(p) {
      var store = window.real100agro && window.real100agro.store;
      var fmt = store && store.formatPrice ? store.formatPrice : function (n) { return "₹" + n; };
      var tokens = [p.categorySlug, CATEGORY_ALIAS[p.categorySlug] || ""];
      if (p.isBestseller) tokens.push("bestseller");
      var cats = tokens.filter(function (t) { return !!t; }).join(" ");
      var off = p.oldPrice > p.price
        ? Math.round((1 - p.price / p.oldPrice) * 100)
        : 0;
      var avg = p.ratingAverage || 0;
      var count = p.ratingCount || 0;
      var ratingLabel = count
        ? "Rated " + avg.toFixed(1) + " out of 5 from " + count + " reviews"
        : "No reviews yet";
      var inStock = p.variants && p.variants.length
        ? p.variants.some(function (v) { return v.in_stock; })
        : true;
      return (
        '<article class="product-card" data-categories="' + cats + '" data-product-id="' + p.id +
        '" data-name="' + p.name.replace(/"/g, "&quot;") + '">' +
        '<a class="product-card__link" href="product.html?slug=' + encodeURIComponent(p.id) +
        '" aria-label="View ' + p.name.replace(/"/g, "&quot;") + '">' +
        '<div class="product-card__media">' +
        '<img src="' + p.image + '" alt="' + p.name.replace(/"/g, "&quot;") +
        '" width="306" height="306" loading="lazy" decoding="async">' +
        (off ? '<span class="product-card__badge">Sale</span>' : "") +
        "</div></a>" +
        '<div class="product-card__rating" aria-label="' + ratingLabel + '">' +
        '<span class="star-rating" aria-hidden="true">' + cardStarsHtml(avg) + "</span>" +
        '<span class="product-card__review-count">' + count + "</span>" +
        "</div>" +
        '<h3 class="product-card__name"><a href="product.html?slug=' + encodeURIComponent(p.id) + '">' +
        p.name + "</a></h3>" +
        '<p class="product-card__price">' +
        (p.oldPrice > p.price ? '<span class="price--old">' + fmt(p.oldPrice) + "</span> " : "") +
        '<span class="price--now">' + fmt(p.price) + "</span>" +
        (off ? ' <span class="price--off">-' + off + "% OFF</span>" : "") +
        "</p>" +
        (inStock
          ? '<button class="button button--primary button--full" type="button" data-add-to-cart>Add to Cart</button>'
          : '<button class="button button--primary button--full" type="button" disabled>Out of stock</button>') +
        "</article>"
      );
    }
    (function renderProductCardsFromApi() {
      var store = window.real100agro && window.real100agro.store;
      if (!store || !store.ready) return;
      store.ready().then(function () {
        var all = store.getProducts() || {};
        var slugs = Object.keys(all);
        if (!slugs.length) return;
        var grids = document.querySelectorAll(".product-grid");
        grids.forEach(function (grid) {
          // Only the homepage featured grid and the shop grid are
          // API-rendered; the "suggested" grid on the product page is
          // handled by product-detail.js.
          var featuredOnly = !!grid.closest("#featured-products");
          var isShop = !!grid.closest("#products-panel");
          if (!featuredOnly && !isShop) return;
          var list = slugs
            .map(function (s) { return all[s]; })
            .filter(function (p) { return featuredOnly ? p.isFeatured : true; });
          if (!list.length) return;
          grid.innerHTML = list.map(productCardHtml).join("");
        });
        productCards = document.querySelectorAll("[data-categories]");
        applyProductVisibility();
      }).catch(function () {});
    })();

    /* Header search — on the products page filters cards; elsewhere
       redirects to products.html?q=… (server search: /api/products/?q=…). */
    var productsSection =
      document.querySelector("#products") ||
      document.querySelector("#featured-products");
    if (searchForm && searchInput) {
      searchForm.addEventListener("submit", function (event) {
        event.preventDefault();
        closeMenu();
        var query = searchInput.value.trim();
        if (!productCards.length) {
          window.location.href =
            "products.html?q=" + encodeURIComponent(query);
          return;
        }
        activeQuery = query.toLowerCase();
        if (isProductsPage) {
          applyProductVisibility();
        } else {
          for (var r = 0; r < productCards.length; r++) {
            var name = (
              productCards[r].getAttribute("data-name") || ""
            ).toLowerCase();
            productCards[r].hidden =
              activeQuery !== "" && name.indexOf(activeQuery) === -1;
          }
        }
        if (productsSection && productsSection.scrollIntoView) {
          suppressScrollPins(productsSection);
          productsSection.scrollIntoView({ behavior: "smooth" });
        }
      });
    }

    /* Featured videos cover-flow lives in video-coverflow.js. */

    /* Newsletter — POST /api/newsletter/ */
    var newsletterForm = document.querySelector("[data-newsletter-form]");
    var newsletterMessage = document.querySelector("[data-newsletter-message]");
    if (newsletterForm && newsletterMessage) {
      newsletterForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var email = newsletterForm.querySelector('input[type="email"], input[name="email"]');
        var api = window.real100agro && window.real100agro.api;
        if (!api || !email || !email.value) return;
        api.request("/newsletter/", { method: "POST", body: { email: email.value.trim() } }).then(function () {
          newsletterMessage.textContent =
            "Thank you — you are on the list. We will share new batches and offers here.";
          newsletterForm.reset();
        }).catch(function (err) {
          newsletterMessage.textContent = err.message || "Could not subscribe. Try again.";
        });
      });
    }

    /* Contact form — POST /api/contact/ (stored in the admin inbox) */
    var contactForm = document.querySelector("[data-contact-form]");
    var contactMessage = document.querySelector("[data-contact-message]");
    if (contactForm && contactMessage) {
      contactForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var fd = new FormData(contactForm);
        var api = window.real100agro && window.real100agro.api;
        if (!api) return;
        api.request("/contact/", { method: "POST", body: {
          name: String(fd.get("name") || ""),
          email: String(fd.get("email") || ""),
          phone: String(fd.get("phone") || ""),
          message: String(fd.get("message") || ""),
        } }).then(function () {
          contactMessage.textContent =
            "Thank you — we have your message and will reply within one working day.";
          contactForm.reset();
        }).catch(function (err) {
          contactMessage.textContent = err.message || "Could not send. Try again.";
        });
      });
    }
  });
})();
