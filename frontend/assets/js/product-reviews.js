/* Full product reviews page — sort chips + lazy-loaded feed (Django API). */

(function () {
  "use strict";

  var STAR_PATH =
    "M12 2.4l2.7 6.5 7 .6-5.3 4.5 1.7 7-6.1-3.7-6.1 3.7 1.7-7-5.3-4.5 7-.6L12 2.4z";

  /* Reviews come from the API: GET /api/products/a2-ghee-1l/reviews/
     (approved reviews only; new ones need admin approval). */
  var ALL_REVIEWS = [];
  var REVIEWS_SLUG = "a2-ghee-1l";
  try {
    var slugParam = new URLSearchParams(window.location.search || "").get("slug");
    if (slugParam) REVIEWS_SLUG = slugParam;
  } catch (e) { /* keep default */ }

  function relativeTime(iso) {
    try {
      var days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
      if (days < 1) return "Today";
      if (days < 7) return days + (days === 1 ? " day ago" : " days ago");
      if (days < 30) return Math.floor(days / 7) + " weeks ago";
      return Math.floor(days / 30) + " months ago";
    } catch (e) { return ""; }
  }

  function loadReviews(onDone) {
    var api = window.real100agro && window.real100agro.api;
    if (!api) { onDone(); return; }
    api.request("/products/" + REVIEWS_SLUG + "/reviews/").then(function (data) {
      var list = data.results || data;
      var summary = data.rating_summary;
      if (summary && summary.count) {
        var el = document.querySelector("[data-reviews-summary]");
        if (el) el.textContent = summary.average + " out of 5 (" + summary.count + " reviews" +
          (summary.component_count ? ", " + summary.component_count + " from this combo's products" : "") + ")";
      }
      ALL_REVIEWS = list.map(function (r) {
        return {
          rating: r.rating, title: r.title || "", body: r.body || "",
          author: r.name || "Customer", verified: !!r.is_verified,
          date: String(r.created_at || "").slice(0, 10),
          relative: relativeTime(r.created_at),
          variant: r.source_product ? r.source_product.name : "A2 Desi Cow Bilona Ghee — 1 Litre",
          fromComponent: !!r.is_from_component,
          tags: r.tags || "",
          helpful: 0, unhelpful: 0,
        };
      });
      onDone();
    }).catch(function () { onDone(); });
  }

  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function starsHtml(rating) {
    var html = "";
    var i;
    for (i = 1; i <= 5; i++) {
      html +=
        '<svg class="star-rating__star ' +
        (i <= rating ? "is-filled" : "is-empty") +
        '" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
        STAR_PATH +
        '"></path></svg>';
    }
    return html;
  }

  function reviewItemHtml(review) {
    var verified = review.verified
      ? '<p class="verified-badge"><span class="verified-badge__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"></path></svg></span> Verified Customer</p>'
      : "";

    return (
      '<li class="reviews-feed-item" data-rating="' +
      review.rating +
      '" data-helpful="' +
      review.helpful +
      '" data-date="' +
      escapeHtml(review.date) +
      '">' +
      '<div class="reviews-feed-item__head">' +
      '<span class="reviews-feed-item__score" aria-label="' +
      review.rating +
      ' out of 5">' +
      starsHtml(review.rating) +
      '<span class="reviews-feed-item__score-num">' +
      review.rating.toFixed(1) +
      "</span></span>" +
      '<span aria-hidden="true">•</span>' +
      '<h3 class="reviews-feed-item__title">' +
      escapeHtml(review.title) +
      "</h3>" +
      "</div>" +
      '<p class="reviews-feed-item__variant">Review for: ' +
      escapeHtml(review.variant) +
      (review.fromComponent ? " · from this combo's products" : "") +
      (review.tags ? " · " + escapeHtml(review.tags) : "") +
      "</p>" +
      '<p class="reviews-feed-item__body">' +
      escapeHtml(review.body) +
      "</p>" +
      '<div class="reviews-feed-item__meta">' +
      '<div class="reviews-feed-item__author-wrap">' +
      '<p class="reviews-feed-item__author">' +
      escapeHtml(review.author) +
      "</p>" +
      verified +
      '<span class="reviews-feed-item__time">' +
      escapeHtml(review.relative) +
      "</span>" +
      "</div>" +
      '<div class="pdp-review-tile__votes" aria-label="Helpful votes">' +
      '<span class="pdp-review-tile__vote"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 22V11M3 12v8a2 2 0 0 0 2 2h9.4a2 2 0 0 0 1.9-1.4l2.2-7A2 2 0 0 0 16.6 11H13V5a2 2 0 0 0-2-2h0a3 3 0 0 0-3 3v5H7z"></path></svg> ' +
      review.helpful +
      "</span>" +
      '<span class="pdp-review-tile__vote"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2v11M21 12V4a2 2 0 0 0-2-2h-9.4a2 2 0 0 0-1.9 1.4l-2.2 7A2 2 0 0 0 7.4 13H11v6a2 2 0 0 0 2 2h0a3 3 0 0 0 3-3v-5h2z"></path></svg> ' +
      review.unhelpful +
      "</span>" +
      "</div>" +
      "</div>" +
      "</li>"
    );
  }

  function sortReviews(list, mode) {
    var copy = list.slice();
    if (mode === "latest") {
      copy.sort(function (a, b) {
        return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
      });
      return copy;
    }
    if (mode === "positive") {
      return copy.filter(function (r) {
        return r.rating >= 4;
      }).sort(function (a, b) {
        return b.helpful - a.helpful;
      });
    }
    if (mode === "negative") {
      return copy.filter(function (r) {
        return r.rating <= 2;
      }).sort(function (a, b) {
        return b.helpful - a.helpful;
      });
    }
    copy.sort(function (a, b) {
      return b.helpful - a.helpful || (a.date < b.date ? 1 : -1);
    });
    return copy;
  }

  onReady(function () {
    var page = document.querySelector("[data-reviews-page]");
    if (!page) return;

    var feed = page.querySelector("[data-reviews-feed]");
    var loading = page.querySelector("[data-reviews-loading]");
    var sentinel = page.querySelector("[data-reviews-sentinel]");
    var sortButtons = page.querySelectorAll("[data-reviews-sort-value]");
    var sortMode = "helpful";
    var queue = [];
    var cursor = 0;
    var pageSize = 4;
    var loadingMore = false;
    var observer = null;

    function setLoading(on) {
      if (!loading) return;
      if (on) {
        loading.hidden = false;
        loading.removeAttribute("hidden");
      } else {
        loading.hidden = true;
        loading.setAttribute("hidden", "");
      }
    }

    function appendBatch() {
      if (!feed || loadingMore) return;
      if (cursor >= queue.length) {
        setLoading(false);
        if (observer && sentinel) observer.unobserve(sentinel);
        return;
      }

      loadingMore = true;
      setLoading(true);

      window.setTimeout(function () {
        var end = Math.min(cursor + pageSize, queue.length);
        var html = "";
        var i;
        for (i = cursor; i < end; i++) {
          html += reviewItemHtml(queue[i]);
        }
        feed.insertAdjacentHTML("beforeend", html);
        cursor = end;
        loadingMore = false;

        if (cursor >= queue.length) {
          setLoading(false);
          if (observer && sentinel) observer.unobserve(sentinel);
        } else {
          setLoading(false);
        }
      }, 350);
    }

    function resetFeed() {
      queue = sortReviews(ALL_REVIEWS, sortMode);
      cursor = 0;
      if (feed) feed.innerHTML = "";
      if (observer && sentinel) {
        try {
          observer.unobserve(sentinel);
        } catch (e) {
          /* ignore */
        }
      }
      appendBatch();
      if (sentinel && "IntersectionObserver" in window) {
        observer.observe(sentinel);
      }
    }

    for (var s = 0; s < sortButtons.length; s++) {
      sortButtons[s].addEventListener("click", function () {
        var btn = this;
        sortMode = btn.getAttribute("data-reviews-sort-value") || "helpful";
        for (var i = 0; i < sortButtons.length; i++) {
          sortButtons[i].setAttribute(
            "aria-pressed",
            sortButtons[i] === btn ? "true" : "false"
          );
        }
        resetFeed();
      });
    }

    if ("IntersectionObserver" in window && sentinel) {
      observer = new IntersectionObserver(
        function (entries) {
          if (!entries.length || !entries[0].isIntersecting) return;
          appendBatch();
        },
        { rootMargin: "240px 0px" }
      );
    } else {
      /* Fallback: load everything once. */
      pageSize = ALL_REVIEWS.length;
    }

    /* Review invite (?token=…): a delivered order — possibly a gift —
       can review each product in it, plus the combo itself. */
    var inviteToken = "";
    try {
      inviteToken = new URLSearchParams(window.location.search || "").get("token") || "";
    } catch (e) { /* ignore */ }
    if (inviteToken) {
      var api = window.real100agro && window.real100agro.api;
      if (api) {
        api.request("/review-invite/" + encodeURIComponent(inviteToken) + "/").then(function (invite) {
          if (!invite || !invite.products || !invite.products.length) return;
          var banner = document.createElement("div");
          banner.className = "review-invite-banner";
          banner.innerHTML =
            "<h3>Review your order " + escapeHtml(invite.order_number || "") + "</h3>" +
            (invite.can_review
              ? "<p>Your order was delivered — tap a product to review it (and the combo itself, if you bought one).</p>"
              : "<p>Reviews open once your order is delivered.</p>") +
            "<ul>" + invite.products.map(function (p) {
              return '<li><a href="product.html?slug=' + encodeURIComponent(p.slug) +
                "&review_token=" + encodeURIComponent(inviteToken) + '">' +
                escapeHtml(p.name) + "</a></li>";
            }).join("") + "</ul>";
          page.insertBefore(banner, page.firstChild);
        }).catch(function () {});
      }
    }

    loadReviews(function () {
      if (!ALL_REVIEWS.length && feed) {
        feed.innerHTML = '<p class="profile-empty">No reviews yet. Be the first to review this ghee.</p>';
      }
      resetFeed();
    });
  });
})();
