/* real100agro — admin-managed content, rendered from the Django API.
   Announcements, site settings (contact + socials), FAQs, categories
   and policy pages all come from the backend. Every section keeps its
   static HTML as a fallback if the API is unreachable. */

(function () {
  "use strict";

  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function api() {
    return window.real100agro && window.real100agro.api;
  }

  function listFrom(data) {
    return (data && data.results) || data || [];
  }

  function readQueryParam(name) {
    try {
      return new URLSearchParams(window.location.search || "").get(name) || "";
    } catch (e) {
      return "";
    }
  }

  /* ---------- Announcements: the top bar ---------- */
  function renderAnnouncements() {
    var track = document.querySelector(".announcement-bar__track");
    if (!track || !api()) return;
    api().request("/announcements/").then(function (data) {
      var list = listFrom(data);
      var combined = list.map(function (item) { return item.text || ""; }).filter(Boolean).join("  ·  ");
      if (!combined) return;
      // The mobile marquee animates translateX(-50%) and only loops
      // seamlessly with two identical spans — keep both, don't wipe one.
      var text = escapeHtml(combined);
      track.innerHTML = "<span>" + text + '</span><span aria-hidden="true">' + text + "</span>";
    }).catch(function () {});
  }

  /* ---------- Site settings: contact email/phone + social links ---------- */
  function renderSettings() {
    if (!api()) return;
    api().request("/settings/").then(function (data) {
      var settings = {};
      listFrom(data).forEach(function (s) { settings[s.key] = s.value || ""; });
      if (settings.contact_email) {
        document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
          a.setAttribute("href", "mailto:" + settings.contact_email);
          a.textContent = settings.contact_email;
        });
      }
      if (settings.contact_phone) {
        var digits = settings.contact_phone.replace(/[^+\d]/g, "");
        document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
          a.setAttribute("href", "tel:" + digits);
          a.textContent = settings.contact_phone;
        });
      }
      var socials = {
        Instagram: settings.instagram_url,
        Facebook: settings.facebook_url,
        WhatsApp: settings.whatsapp_url,
        YouTube: settings.youtube_url,
        X: settings.x_url,
      };
      document.querySelectorAll(".footer-social__link").forEach(function (a) {
        var label = (a.getAttribute("aria-label") || "").split(" ")[0];
        var url = socials[label];
        if (url) {
          a.setAttribute("href", url);
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        }
      });
    }).catch(function () {});
  }

  /* ---------- FAQs (contact page) ---------- */
  function renderFaqs() {
    var list = document.querySelector(".faq-list");
    if (!list || !api()) return;
    api().request("/faqs/").then(function (data) {
      var faqs = listFrom(data);
      if (!faqs.length) return;
      list.innerHTML = faqs.map(function (f) {
        return "<li><details><summary>" + escapeHtml(f.question) + "</summary><p>" +
          escapeHtml(f.answer) + "</p></details></li>";
      }).join("");
    }).catch(function () {});
  }

  /* ---------- Categories: extra filter pills for new categories ---------- */
  function renderCategoryPills() {
    var rows = document.querySelectorAll(".products-category-row, [data-category-pills]");
    if (!rows.length || !api()) return;
    var alias = {
      "a2-cow-ghee": "a2",
      "buffalo-ghee": "buffalo",
      "gift-sets": "gift",
      "combos": "combo",
    };
    api().request("/categories/").then(function (data) {
      var categories = listFrom(data);
      var existing = {};
      document.querySelectorAll("[data-filter]").forEach(function (b) {
        existing[b.getAttribute("data-filter")] = true;
      });
      categories.forEach(function (c) {
        if (!c.slug) return;
        var known = alias[c.slug];
        if (known && existing[known]) {
          document.querySelectorAll('[data-filter="' + known + '"]').forEach(function (b) {
            b.textContent = c.name;
          });
          return;
        }
        if (existing[c.slug]) return;
        existing[c.slug] = true;
        rows.forEach(function (row) {
          var btn = document.createElement("button");
          btn.className = "pill";
          btn.type = "button";
          btn.setAttribute("data-filter", c.slug);
          btn.setAttribute("aria-pressed", "false");
          btn.textContent = c.name;
          btn.addEventListener("click", function () {
            // main.js owns filtering; it listens for hash changes.
            window.location.hash = "#" + c.slug;
          });
          row.appendChild(btn);
        });
      });
    }).catch(function () {});
  }

  /* ---------- Footer policy links from /policies/ ---------- */
  function renderPolicyLinks() {
    if (!api()) return;
    api().request("/policies/").then(function (data) {
      var policies = listFrom(data);
      if (!policies.length) return;
      document.querySelectorAll('nav[aria-label="Policies"] ul').forEach(function (ul) {
        ul.textContent = "";
        policies.forEach(function (p) {
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = "policy.html?slug=" + encodeURIComponent(p.slug);
          a.textContent = p.title || p.slug;
          li.appendChild(a);
          ul.appendChild(li);
        });
      });
    }).catch(function () {});
  }

  /* ---------- Policy page (policy.html?slug=...) ---------- */
  /* Numbered points ("1. Title") and short section titles are the
     headings. Bullet lines and paragraphs stay regular weight. */
  function policyBodyHtml(text) {
    return String(text || "").split("\n").map(function (line) {
      var trimmed = line.trim();
      var escaped = escapeHtml(line);
      var numbered = /^\d+\.\s+\S/.test(trimmed);
      var heading = trimmed &&
        trimmed.charAt(0) !== "-" &&
        trimmed.length <= 80 &&
        !/[.!?]$/.test(trimmed);
      if (numbered || heading) return "<strong>" + escaped + "</strong>";
      return escaped;
    }).join("\n");
  }

  function showPolicy(root, slug) {
    var articles = root.querySelectorAll("[data-policy-slug]");
    var matched = false;
    articles.forEach(function (article) {
      var on = article.getAttribute("data-policy-slug") === slug;
      article.hidden = !on;
      if (on) matched = true;
    });
    if (!matched && articles[0]) articles[0].hidden = false;
    var visible = root.querySelector("[data-policy-slug]:not([hidden])");
    var titleEl = visible && visible.querySelector("[data-policy-title]");
    if (titleEl) document.title = titleEl.textContent.trim() + " — real100agro";
    return visible;
  }

  function renderPolicyPage() {
    var root = document.querySelector("[data-policy-page]");
    if (!root) return;
    var slug = (readQueryParam("slug") || "privacy-policy").replace(/[^a-z0-9-]/gi, "") || "privacy-policy";
    showPolicy(root, slug);
    root.querySelectorAll("[data-policy-body]").forEach(function (bodyEl) {
      bodyEl.innerHTML = policyBodyHtml(bodyEl.textContent);
    });
    if (!api()) return;
    api().request("/policies/" + encodeURIComponent(slug) + "/").then(function (p) {
      var article = root.querySelector('[data-policy-slug="' + slug + '"]');
      if (!article || !p) return;
      var titleEl = article.querySelector("[data-policy-title]");
      var bodyEl = article.querySelector("[data-policy-body]");
      if (titleEl && p.title) titleEl.textContent = p.title;
      if (bodyEl && p.body) bodyEl.innerHTML = policyBodyHtml(p.body);
      document.title = (p.title || "Policy") + " — real100agro";
    }).catch(function () {
      /* Static copy on the page stays. A crawler that never reaches the API still sees the policy. */
    });
  }

  onReady(function () {
    renderAnnouncements();
    renderSettings();
    renderFaqs();
    renderCategoryPills();
    renderPolicyLinks();
    renderPolicyPage();
  });
})();
