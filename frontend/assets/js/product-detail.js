/* Product detail — Dabur-style gallery (vertical thumbs + loupe zoom),
   size/qty, mobile arrows, sticky bar price sync, review carousel. */

(function () {
  "use strict";

  function onReady(fn) {
    if (document.readyState !== "loading") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  onReady(function () {
    var root = document.querySelector("[data-product-detail]");
    if (!root) return;

    /* ---------- Product from the API (?slug=…) ---------- */
    function readQueryParam(name) {
      try { return new URLSearchParams(window.location.search || "").get(name) || ""; }
      catch (e) { return ""; }
    }
    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    var productSlug = readQueryParam("slug") || "a2-ghee-1l";
    var reviewToken = readQueryParam("review_token") || "";
    var store = window.real100agro && window.real100agro.store;
    var api = window.real100agro && window.real100agro.api;

    function setText(selector, text) {
      var el = document.querySelector(selector);
      if (el) el.textContent = text;
    }
    function offPercent(price, mrp) {
      return mrp > price ? "-" + Math.round((1 - price / mrp) * 100) + "% OFF" : "";
    }
    function applyProduct(p) {
      if (!p) return;
      var fmt = store.formatPrice;
      root.setAttribute("data-product-id", p.id);
      var crumb = document.querySelector(".product-breadcrumb [aria-current='page']");
      if (crumb) crumb.textContent = p.name;
      document.title = p.name + " — real100agro";
      setText(".product-mobile-intro__title", p.name);
      setText(".product-info__title--desktop", p.name);
      var eyebrow = p.categoryName + (p.isBestseller ? " — Bestseller" : "");
      setText(".product-info__eyebrow--desktop", eyebrow);
      setText(".product-mobile-intro__eyebrow", eyebrow);
      if (p.description) setText(".product-info__lead--desktop", p.description);
      var v0 = (p.variants && p.variants[0]) || null;
      var now = v0 ? fmt(v0.price) : fmt(p.price);
      var old = v0 && v0.mrp ? fmt(v0.mrp) : "";
      var off = v0 ? offPercent(v0.price, v0.mrp) : "";
      setText("[data-product-price-now]", now);
      setText("[data-product-price-old]", old);
      setText("[data-product-price-off]", off);
      setText("[data-sticky-price-now]", now);
      setText("[data-sticky-price-off]", off);
      // Rating pills (filled in with the summary below when it loads).
      var ratingText = p.ratingCount
        ? (p.ratingAverage || 0).toFixed(1) + "/5  |  " + p.ratingCount + " reviews"
        : "No reviews yet";
      document.querySelectorAll(".product-info__review-pill").forEach(function (a) {
        a.childNodes.forEach(function (n) {
          if (n.nodeType === 3) n.textContent = " " + ratingText;
        });
      });
      var seeAll = document.querySelector(".product-info__review-link");
      if (seeAll) seeAll.setAttribute("href", "product-reviews.html?slug=" + encodeURIComponent(p.id));
      // Size pills become this product's variants (was: other products).
      var sizesRow = document.querySelector("[data-product-sizes]");
      if (sizesRow && p.variants && p.variants.length) {
        sizesRow.innerHTML = p.variants.map(function (v, i) {
          return '<button class="pill" type="button" data-product-size="' + escapeHtml(v.size_label) +
            '" data-product-id="' + p.id + '" data-variant-id="' + v.id +
            '" data-now="' + fmt(v.price) + '" data-old="' + (v.mrp ? fmt(v.mrp) : "") +
            '" data-off="' + offPercent(v.price, v.mrp) +
            '" aria-pressed="' + (i === 0 ? "true" : "false") + '">' +
            escapeHtml(v.size_label) + "</button>";
        }).join("");
        // Delegated price sync (the static handler bound the old buttons).
        sizesRow.addEventListener("click", function (event) {
          var btn = event.target.closest("[data-product-size]");
          if (!btn) return;
          sizesRow.querySelectorAll("[data-product-size]").forEach(function (b) {
            b.setAttribute("aria-pressed", b === btn ? "true" : "false");
          });
          setText("[data-product-price-now]", btn.getAttribute("data-now") || "");
          setText("[data-product-price-old]", btn.getAttribute("data-old") || "");
          setText("[data-product-price-off]", btn.getAttribute("data-off") || "");
          setText("[data-sticky-price-now]", btn.getAttribute("data-now") || "");
          setText("[data-sticky-price-off]", btn.getAttribute("data-off") || "");
        });
      }
      // Gallery: admin uploads replace the placeholder thumbs.
      var mainImage = document.querySelector("[data-zoom-image]");
      if (mainImage && p.image) {
        mainImage.setAttribute("src", p.image);
        mainImage.setAttribute("alt", p.name);
      }
      if (p.hasUploadedImages && p.images && p.images.length) {
        var rail = document.querySelector("[data-gallery-thumbs]");
        if (rail) {
          rail.innerHTML = p.images.map(function (img, i) {
            var alt = img.alt || p.name;
            return '<button class="product-gallery__thumb' + (i === 0 ? " is-active" : "") +
              '" type="button" role="listitem" data-gallery-thumb aria-label="' + escapeHtml(alt) +
              '" aria-current="' + (i === 0 ? "true" : "false") + '" data-full="' + escapeHtml(img.src) +
              '" data-alt="' + escapeHtml(alt) + '"><img src="' + escapeHtml(img.src) +
              '" alt="" width="72" height="72" decoding="async"></button>';
          }).join("");
          if (window.real100agro && window.real100agro.refreshProductGallery) {
            window.real100agro.refreshProductGallery();
          }
        }
      }
      // Suggested products: everything else, from the API.
      var suggested = document.querySelector(".product-grid--suggested");
      if (suggested) {
        var others = Object.keys(store.getProducts() || {})
          .map(function (s) { return store.getProduct(s); })
          .filter(function (o) { return o && o.id !== p.id; });
        if (others.length) {
          suggested.innerHTML = others.map(function (o) {
            var ov = (o.variants && o.variants[0]) || null;
            var oNow = ov ? fmt(ov.price) : fmt(o.price);
            var oOld = ov && ov.mrp ? fmt(ov.mrp) : "";
            var oOff = ov ? offPercent(ov.price, ov.mrp) : "";
            return '<article class="product-card" data-product-id="' + o.id + '" data-name="' +
              escapeHtml(o.name) + '">' +
              '<a class="product-card__link" href="product.html?slug=' + encodeURIComponent(o.id) + '">' +
              '<div class="product-card__media"><img src="' + o.image + '" alt="' + escapeHtml(o.name) +
              '" width="306" height="306" loading="lazy" decoding="async">' +
              (oOff ? '<span class="product-card__badge">Sale</span>' : "") + "</div></a>" +
              '<h3 class="product-card__name"><a href="product.html?slug=' + encodeURIComponent(o.id) + '">' +
              escapeHtml(o.name) + "</a></h3>" +
              '<p class="product-card__price">' +
              (oOld ? '<span class="price--old">' + oOld + "</span> " : "") +
              '<span class="price--now">' + oNow + "</span>" +
              (oOff ? ' <span class="price--off">' + oOff + "</span>" : "") + "</p>" +
              '<button class="button button--primary button--full" type="button" data-add-to-cart>Add to Cart</button>' +
              "</article>";
          }).join("");
        }
      }
    }
    function relativeTime(iso) {
      try {
        var days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
        if (days < 1) return "Today";
        if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
        if (days < 30) return Math.floor(days / 7) + " weeks ago";
        return Math.floor(days / 30) + " months ago";
      } catch (e) { return ""; }
    }
    function renderPdpReviews() {
      var track = document.querySelector(".pdp-review-carousel__track");
      if (!track || !api) return;
      api().request("/products/" + encodeURIComponent(productSlug) + "/reviews/").then(function (data) {
        var list = data.results || data;
        if (!list.length) return;
        track.innerHTML = list.map(function (r) {
          return '<li class="pdp-review-tile">' +
            '<div class="pdp-review-tile__head">' +
            '<span class="pdp-rating-badge" aria-label="' + r.rating + ' out of 5">' + r.rating +
            ' <span class="pdp-rating-badge__star" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 2.4l2.7 6.5 7 .6-5.3 4.5 1.7 7-6.1-3.7-6.1 3.7 1.7-7-5.3-4.5 7-.6L12 2.4z"></path></svg></span></span>' +
            '<h3 class="pdp-review-tile__title">' + escapeHtml(r.title || "Review") + "</h3>" +
            '<p class="pdp-review-tile__time">' + escapeHtml(relativeTime(r.created_at)) + "</p>" +
            "</div>" +
            '<p class="pdp-review-tile__body">' + escapeHtml(r.body || "") +
            (r.source_product ? ' <span class="pdp-review-tile__source"> — for ' + escapeHtml(r.source_product.name) + "</span>" : "") +
            "</p>" +
            '<div class="pdp-review-tile__foot"><div>' +
            '<p class="pdp-review-tile__author">' + escapeHtml(r.name || "Customer") + "</p>" +
            (r.is_verified ? '<p class="verified-badge"><span class="verified-badge__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"></path></svg></span> Verified Customer</p>' : "") +
            "</div></div></li>";
        }).join("");
      }).catch(function () {});
    }
    if (store && store.ready) {
      store.ready().then(function () {
        applyProduct(store.getProduct(productSlug));
        renderPdpReviews();
      }).catch(function () {});
    }

    /* ---------- Review form (POST /api/products/<slug>/reviews/) ---------- */
    var reviewForm = document.querySelector("[data-review-form]");
    if (reviewForm) {
      reviewForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var msg = reviewForm.querySelector("[data-review-message]");
        var fd = new FormData(reviewForm);
        var body = {
          name: String(fd.get("name") || "").trim(),
          rating: parseInt(fd.get("rating"), 10),
          title: String(fd.get("title") || "").trim(),
          body: String(fd.get("body") || "").trim(),
        };
        if (reviewToken) body.review_token = reviewToken;
        if (!body.name || !body.rating || !body.body) {
          if (msg) msg.textContent = "Please add your name, a rating and a few words.";
          return;
        }
        if (!api) return;
        api().request("/products/" + encodeURIComponent(productSlug) + "/reviews/", {
          method: "POST", body: body,
        }).then(function () {
          if (msg) msg.textContent = "Thank you — your review is submitted and will appear after moderation.";
          reviewForm.reset();
          renderPdpReviews();
        }).catch(function (err) {
          if (msg) msg.textContent = (err && err.message) || "Could not submit your review.";
        });
      });
    }

    var gallery = document.querySelector("[data-product-gallery]");
    var galleryMain = gallery
      ? gallery.querySelector(".product-gallery__main")
      : null;
    var stage = document.querySelector("[data-zoom-stage]");
    var mainImage = document.querySelector("[data-zoom-image]");
    var lens = document.querySelector("[data-zoom-lens]");
    var zoomPane = document.querySelector("[data-zoom-pane]");
    var thumbsRail = document.querySelector("[data-gallery-thumbs]");
    function galleryThumbs() {
      return thumbsRail ? thumbsRail.querySelectorAll("[data-gallery-thumb]") : [];
    }
    var thumbsPrev = document.querySelector("[data-thumbs-prev]");
    var thumbsNext = document.querySelector("[data-thumbs-next]");
    var galleryPrev = document.querySelector("[data-gallery-prev]");
    var galleryNext = document.querySelector("[data-gallery-next]");
    var activeIndex = 0;
    var canHover =
      window.matchMedia &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var ZOOM = 2.4;

    function isMobile() {
      return window.matchMedia && window.matchMedia("(max-width: 767px)").matches;
    }

    function fitGalleryToViewport() {
      if (!gallery) return;
      if (isMobile()) {
        gallery.style.height = "";
        gallery.style.maxHeight = "";
        return;
      }
      var top = gallery.getBoundingClientRect().top;
      var available = Math.floor(window.innerHeight - top - 12);
      if (available < 300) available = 300;
      gallery.style.height = available + "px";
      gallery.style.maxHeight = available + "px";
    }

    fitGalleryToViewport();
    window.addEventListener("resize", fitGalleryToViewport);
    window.addEventListener("load", fitGalleryToViewport);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitGalleryToViewport).catch(function () {});
    }

    function setActiveThumb(index) {
      var thumbs = galleryThumbs();
      if (!thumbs.length) return;
      activeIndex = (index + thumbs.length) % thumbs.length;
      var thumb = thumbs[activeIndex];
      var full = thumb.getAttribute("data-full");
      var alt = thumb.getAttribute("data-alt") || "";
      if (mainImage && full) {
        mainImage.src = full;
        if (alt) mainImage.alt = alt;
      }
      if (zoomPane && full) {
        zoomPane.style.backgroundImage = 'url("' + full + '")';
      }
      for (var i = 0; i < thumbs.length; i++) {
        var on = i === activeIndex;
        thumbs[i].classList.toggle("is-active", on);
        thumbs[i].setAttribute("aria-current", on ? "true" : "false");
      }
      if (thumb && thumb.scrollIntoView) {
        thumb.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth"
        });
      }
      if (stage) stage.classList.remove("is-zooming");
      if (galleryMain) galleryMain.classList.remove("is-zooming");
    }

    if (mainImage && zoomPane) {
      zoomPane.style.backgroundImage =
        'url("' + (mainImage.currentSrc || mainImage.src) + '")';
    }

    (function markInitialThumb() {
      var thumbs = galleryThumbs();
      for (var t = 0; t < thumbs.length; t++) {
        if (thumbs[t].classList.contains("is-active")) activeIndex = t;
      }
    })();
    if (thumbsRail) {
      thumbsRail.addEventListener("click", function (event) {
        var thumb = event.target.closest("[data-gallery-thumb]");
        if (!thumb || !thumbsRail.contains(thumb)) return;
        var thumbs = galleryThumbs();
        for (var i = 0; i < thumbs.length; i++) {
          if (thumbs[i] === thumb) { setActiveThumb(i); return; }
        }
      });
    }
    (window.real100agro = window.real100agro || {}).refreshProductGallery = function () {
      setActiveThumb(0);
    };

    if (galleryPrev) {
      galleryPrev.addEventListener("click", function () {
        setActiveThumb(activeIndex - 1);
      });
    }
    if (galleryNext) {
      galleryNext.addEventListener("click", function () {
        setActiveThumb(activeIndex + 1);
      });
    }

    function scrollThumbs(direction) {
      if (!thumbsRail) return;
      var thumbs = galleryThumbs();
      var amount = (thumbs[0] ? thumbs[0].offsetHeight : 68) + 8;
      if (isMobile()) {
        amount = (thumbs[0] ? thumbs[0].offsetWidth : 56) + 8;
        thumbsRail.scrollBy({ left: direction * amount, behavior: "smooth" });
      } else {
        thumbsRail.scrollBy({ top: direction * amount, behavior: "smooth" });
      }
    }

    if (thumbsPrev) {
      thumbsPrev.addEventListener("click", function () {
        scrollThumbs(-1);
      });
    }
    if (thumbsNext) {
      thumbsNext.addEventListener("click", function () {
        scrollThumbs(1);
      });
    }

    function updateLoupe(clientX, clientY) {
      if (!stage || !lens || !zoomPane || !canHover || isMobile()) return;
      var rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      var lensW = lens.offsetWidth || 120;
      var lensH = lens.offsetHeight || 120;
      var x = clamp(clientX - rect.left, lensW / 2, rect.width - lensW / 2);
      var y = clamp(clientY - rect.top, lensH / 2, rect.height - lensH / 2);

      lens.style.left = x + "px";
      lens.style.top = y + "px";

      var bgW = rect.width * ZOOM;
      var bgH = rect.height * ZOOM;
      var paneW = zoomPane.clientWidth || 360;
      var paneH = zoomPane.clientHeight || 360;

      zoomPane.style.backgroundSize = bgW + "px " + bgH + "px";
      zoomPane.style.backgroundPosition =
        -(x * ZOOM - paneW / 2) + "px " + -(y * ZOOM - paneH / 2) + "px";
    }

    function showZoom(on) {
      if (!stage || !galleryMain) return;
      stage.classList.toggle("is-zooming", on);
      galleryMain.classList.toggle("is-zooming", on);
      if (zoomPane) zoomPane.setAttribute("aria-hidden", on ? "false" : "true");
    }

    if (stage && lens && zoomPane && canHover) {
      stage.addEventListener("mouseenter", function (event) {
        if (isMobile()) return;
        showZoom(true);
        updateLoupe(event.clientX, event.clientY);
      });
      stage.addEventListener("mousemove", function (event) {
        if (isMobile()) return;
        showZoom(true);
        updateLoupe(event.clientX, event.clientY);
      });
      stage.addEventListener("mouseleave", function () {
        showZoom(false);
      });
    }

    /* ---------- Size pills update price ---------- */
    var sizeButtons = document.querySelectorAll("[data-product-size]");
    var priceNow = document.querySelector("[data-product-price-now]");
    var priceOld = document.querySelector("[data-product-price-old]");
    var priceOff = document.querySelector("[data-product-price-off]");
    var stickyNow = document.querySelector("[data-sticky-price-now]");
    var stickyOff = document.querySelector("[data-sticky-price-off]");

    for (var s = 0; s < sizeButtons.length; s++) {
      sizeButtons[s].addEventListener("click", function () {
        var btn = this;
        for (var i = 0; i < sizeButtons.length; i++) {
          sizeButtons[i].setAttribute(
            "aria-pressed",
            sizeButtons[i] === btn ? "true" : "false"
          );
        }
        var now = btn.getAttribute("data-now") || "";
        var old = btn.getAttribute("data-old") || "";
        var off = btn.getAttribute("data-off") || "";
        if (priceNow) priceNow.textContent = now;
        if (priceOld) priceOld.textContent = old;
        if (priceOff) priceOff.textContent = off;
        if (stickyNow) stickyNow.textContent = now;
        if (stickyOff) stickyOff.textContent = off;
      });
    }

    /* ---------- Quantity ---------- */
    var qtyInput = document.querySelector("[data-qty-input]");
    var qtyMinus = document.querySelector("[data-qty-minus]");
    var qtyPlus = document.querySelector("[data-qty-plus]");
    function readQty() {
      if (!qtyInput) return 1;
      var value = parseInt(qtyInput.value, 10);
      if (isNaN(value) || value < 1) value = 1;
      if (value > 20) value = 20;
      qtyInput.value = String(value);
      return value;
    }

    if (qtyMinus) {
      qtyMinus.addEventListener("click", function () {
        if (!qtyInput) return;
        qtyInput.value = String(Math.max(1, readQty() - 1));
      });
    }
    if (qtyPlus) {
      qtyPlus.addEventListener("click", function () {
        if (!qtyInput) return;
        qtyInput.value = String(Math.min(20, readQty() + 1));
      });
    }
    if (qtyInput) qtyInput.addEventListener("change", readQty);

    /* Add-to-cart qty is handled by commerce.js via data-add-qty. */

    /* ---------- Review carousel arrows ---------- */
    var carousel = document.querySelector("[data-pdp-review-carousel]");
    var viewport = document.querySelector("[data-pdp-review-viewport]");
    var prevBtn = document.querySelector("[data-pdp-review-prev]");
    var nextBtn = document.querySelector("[data-pdp-review-next]");

    function updateCarouselNav() {
      if (!viewport || !prevBtn || !nextBtn) return;
      var maxScroll = viewport.scrollWidth - viewport.clientWidth;
      var left = viewport.scrollLeft;
      var atStart = left <= 4;
      var atEnd = left >= maxScroll - 4;
      if (maxScroll <= 4) {
        prevBtn.hidden = true;
        nextBtn.hidden = true;
        return;
      }
      if (atStart) prevBtn.setAttribute("hidden", "");
      else prevBtn.removeAttribute("hidden");
      if (atEnd) nextBtn.setAttribute("hidden", "");
      else nextBtn.removeAttribute("hidden");
    }

    function scrollCarousel(direction) {
      if (!viewport) return;
      var card = viewport.querySelector(".pdp-review-tile");
      var step = card ? card.getBoundingClientRect().width + 14 : 280;
      viewport.scrollBy({ left: direction * step, behavior: "smooth" });
    }

    if (carousel && viewport) {
      if (prevBtn) {
        prevBtn.addEventListener("click", function () {
          scrollCarousel(-1);
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", function () {
          scrollCarousel(1);
        });
      }
      viewport.addEventListener("scroll", updateCarouselNav, { passive: true });
      window.addEventListener("resize", updateCarouselNav);
      updateCarouselNav();
    }
  });
})();
