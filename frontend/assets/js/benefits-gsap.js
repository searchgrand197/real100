/* real100agro — Benefits panels.
 *
 * Faithful port of GreenSock CodePen XWzRraJ
 * ("Animated Continuous Sections with GSAP Observer"):
 *   nested outer / inner clip reveal + bg parallax + char stagger,
 *   one wheel/swipe = one timed transition (not scroll-scrubbed).
 *
 * Differences from the demo (our requirements):
 *   - no endless wrap: past last photo → Reviews; before heading → up
 *   - panel 0 is the bold heading, then photos 1–5
 *   - no GSAP CDN: same timeline in vanilla rAF
 */

(function () {
  "use strict";

  var wrapper = document.querySelector("[data-benefits-gsap]");
  if (!wrapper) return;

  var stage = wrapper.querySelector(".benefits-gsap__stage");
  var controls = wrapper.querySelector(".benefits-gsap__controls");
  var panels = Array.prototype.slice.call(
    wrapper.querySelectorAll("[data-benefits-panel]")
  );
  var outers = panels.map(function (p) {
    return p.querySelector(".benefits-panel__outer");
  });
  var inners = panels.map(function (p) {
    return p.querySelector(".benefits-panel__inner");
  });
  var images = panels.map(function (p) {
    return p.querySelector(".benefits-panel__bg");
  });
  var prevBtn = wrapper.querySelector("[data-benefits-prev]");
  var nextBtn = wrapper.querySelector("[data-benefits-next]");
  var skipBtn = wrapper.querySelector("[data-benefits-skip]");

  /* CodePen defaults: duration 1.25, ease power1.inOut;
     chars duration 1, delay 0.2, stagger 0.02 from random. */
  var DURATION = 1250;
  var CHAR_DELAY = 200;
  var CHAR_DURATION = 1000;
  var STAGGER = 20;
  var WHEEL_TOLERANCE = 10;
  /* Fingers need a larger threshold than mouse-wheel ticks. */
  var SWIPE_TOLERANCE = 36;
  /* Mobile browser chrome / subpixels rarely land at exact 0. */
  var ENGAGE_SLACK = 48;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    wrapper.classList.add("benefits-gsap--static");
    return;
  }

  /* Split photo captions into chars (spaces stay text nodes). */
  var splitChars = panels.map(function (panel) {
    var headingEl = panel.querySelector(".benefits-panel__heading");
    if (!headingEl) return [];
    var text = headingEl.textContent;
    headingEl.setAttribute("aria-label", text);
    headingEl.textContent = "";
    var chars = [];
    for (var i = 0; i < text.length; i++) {
      if (text[i] === " ") {
        headingEl.appendChild(document.createTextNode(" "));
      } else {
        var span = document.createElement("span");
        span.className = "char";
        span.setAttribute("aria-hidden", "true");
        span.textContent = text[i];
        headingEl.appendChild(span);
        chars.push(span);
      }
    }
    return chars;
  });

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  /* GSAP power1.inOut */
  function power1InOut(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /* GSAP power2 (for char ease) ≈ easeOutQuad-ish; pen uses "power2" */
  function power2Out(t) {
    t = clamp(t, 0, 1);
    return 1 - (1 - t) * (1 - t);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function setYPercent(el, yPercent) {
    if (!el) return;
    el.style.transform = "translateY(" + yPercent + "%)";
  }

  function setPanelVisible(index, visible, z) {
    var panel = panels[index];
    if (!panel) return;
    panel.style.visibility = visible ? "visible" : "hidden";
    panel.style.opacity = visible ? "1" : "0";
    panel.style.zIndex = String(z);
    panel.classList.toggle("is-active", visible && z === 1);
  }

  function setCharsRest(index, visible) {
    var chars = splitChars[index] || [];
    for (var i = 0; i < chars.length; i++) {
      chars[i].style.opacity = visible ? "1" : "0";
      chars[i].style.transform = "translateY(0%)";
    }
  }

  var currentIndex = -1;
  var animating = false;
  var exiting = false;
  var lockedScrollY = null;
  var rafId = null;

  function now() {
    return window.performance && window.performance.now
      ? window.performance.now()
      : Date.now();
  }

  function sectionBefore() {
    var videos = document.querySelector("#videos-heading");
    return videos ? videos.closest("section") : null;
  }

  function sectionAfter() {
    var reviews = document.querySelector("#reviews-heading");
    return reviews ? reviews.closest("section") : null;
  }

  function unlock() {
    lockedScrollY = null;
    exiting = false;
  }

  function pinsSuppressed() {
    return window.real100agro && window.real100agro.pinsSuppressed;
  }

  function releaseForNavigation() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    animating = false;
    lockedScrollY = null;
    exiting = false;
    wheelAccum = 0;
  }

  function lockToSection() {
    if (pinsSuppressed()) return;
    var rect = wrapper.getBoundingClientRect();
    lockedScrollY = window.pageYOffset + rect.top;
    window.scrollTo(0, lockedScrollY);
  }

  window.addEventListener("real100agro:suppress-pins", releaseForNavigation);

  function exitDown() {
    if (exiting) return;
    exiting = true;
    animating = false;
    lockedScrollY = null;
    var target = sectionAfter();
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
    }
    window.setTimeout(unlock, 700);
  }

  function exitUp() {
    if (exiting) return;
    exiting = true;
    animating = false;
    lockedScrollY = null;
    var target = sectionBefore();
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollBy({ top: -window.innerHeight, behavior: "smooth" });
    }
    window.setTimeout(unlock, 700);
  }

  function updateControls() {
    if (!controls) return;
    controls.classList.toggle("is-visible", currentIndex > 0);
  }

  /**
   * CodePen gotoSection(index, direction):
   *   dFactor = direction === -1 ? -1 : 1
   *   outgoing bg → yPercent -15 * dFactor, then hide
   *   incoming outer/inner from ±100 * dFactor → 0
   *   incoming bg from 15 * dFactor → 0
   *   chars from yPercent 150 * dFactor, stagger random
   */
  function gotoSection(index, direction) {
    if (animating) return;
    if (index < 0) {
      exitUp();
      return;
    }
    if (index >= panels.length) {
      exitDown();
      return;
    }
    if (index === currentIndex) return;

    animating = true;
    lockToSection();

    var fromTop = direction === -1;
    var dFactor = fromTop ? -1 : 1;
    var prev = currentIndex;
    var next = index;
    var order = shuffle(
      (splitChars[next] || []).map(function (_, i) {
        return i;
      })
    );

    /* Bring incoming on top; park outer/inner/bg at start pose. */
    setPanelVisible(next, true, 1);
    setYPercent(outers[next], 100 * dFactor);
    setYPercent(inners[next], -100 * dFactor);
    setYPercent(images[next], 15 * dFactor);
    setCharsRest(next, false);

    if (prev >= 0) {
      setPanelVisible(prev, true, 0);
    }

    var start = now();

    function frame(tNow) {
      if (exiting) {
        animating = false;
        rafId = null;
        return;
      }

      var elapsed = tNow - start;
      var p = power1InOut(elapsed / DURATION);

      /* Incoming outer + inner (simultaneous, position 0). */
      setYPercent(outers[next], 100 * dFactor * (1 - p));
      setYPercent(inners[next], -100 * dFactor * (1 - p));
      setYPercent(images[next], 15 * dFactor * (1 - p));

      /* Outgoing image parallax. */
      if (prev >= 0) {
        setYPercent(images[prev], -15 * dFactor * p);
      }

      /* Char stagger: each 0.02s, ease power2, delay 0.2s. */
      var chars = splitChars[next] || [];
      for (var s = 0; s < order.length; s++) {
        var ci = order[s];
        var charEl = chars[ci];
        if (!charEl) continue;
        var charStart = CHAR_DELAY + s * STAGGER;
        var charP = power2Out((elapsed - charStart) / CHAR_DURATION);
        charEl.style.opacity = String(charP);
        charEl.style.transform =
          "translateY(" + (150 * dFactor * (1 - charP)).toFixed(2) + "%)";
      }

      if (elapsed < DURATION + CHAR_DELAY + STAGGER * Math.max(order.length - 1, 0)) {
        rafId = window.requestAnimationFrame(frame);
        return;
      }

      /* Finish: hide previous, settle incoming (CodePen .set autoAlpha 0). */
      if (prev >= 0) {
        setPanelVisible(prev, false, 0);
        setYPercent(images[prev], 0);
        setYPercent(outers[prev], 100);
        setYPercent(inners[prev], -100);
        setCharsRest(prev, false);
      }
      setYPercent(outers[next], 0);
      setYPercent(inners[next], 0);
      setYPercent(images[next], 0);
      setCharsRest(next, true);
      setPanelVisible(next, true, 1);

      currentIndex = next;
      animating = false;
      rafId = null;
      updateControls();
    }

    rafId = window.requestAnimationFrame(frame);
  }

  function viewportHeight() {
    return window.innerHeight || 1;
  }

  function isEngaged() {
    var rect = wrapper.getBoundingClientRect();
    var vh = viewportHeight();
    /* Section fills most of the viewport — take over scroll/swipe.
       Slack matters on phones: 100dvh vs innerHeight + browser chrome
       rarely lands at exact top=0 / bottom=vh. */
    return rect.top <= ENGAGE_SLACK && rect.bottom >= vh - ENGAGE_SLACK;
  }

  function isNearSection() {
    var rect = wrapper.getBoundingClientRect();
    var vh = viewportHeight();
    return rect.top < vh * 0.55 && rect.bottom > vh * 0.45;
  }

  function isActive() {
    return lockedScrollY !== null || isEngaged();
  }

  function snapIntoSection(direction) {
    var rect = wrapper.getBoundingClientRect();
    var vh = viewportHeight();
    if (direction > 0 && rect.top > 0) {
      lockToSection();
      if (currentIndex < 0) gotoSection(0, 1);
      return true;
    }
    if (direction < 0 && rect.bottom < vh) {
      lockToSection();
      return true;
    }
    return false;
  }

  /* --- Observer-style input (wheel / touch / pointer) --- */
  var wheelAccum = 0;

  window.addEventListener(
    "wheel",
    function (event) {
      if (exiting || pinsSuppressed()) return;
      if (!isActive() && !isNearSection()) return;

      /* Snap into the section if we are close but not locked yet. */
      if (!isActive()) {
        var dy = event.deltaY || 0;
        if (dy === 0) return;
        if (snapIntoSection(dy > 0 ? 1 : -1)) {
          event.preventDefault();
        }
        return;
      }

      event.preventDefault();
      if (animating) return;

      wheelAccum += event.deltaY || 0;
      if (Math.abs(wheelAccum) < WHEEL_TOLERANCE) return;
      var dir = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      gotoSection(currentIndex + dir, dir);
    },
    { passive: false }
  );

  var touchStartY = null;
  var touchArmed = false;
  window.addEventListener(
    "touchstart",
    function (event) {
      if (event.touches && event.touches.length) {
        touchStartY = event.touches[0].clientY;
        touchArmed = isActive() || isNearSection();
      }
    },
    { passive: true }
  );
  window.addEventListener(
    "touchmove",
    function (event) {
      if (
        exiting ||
        pinsSuppressed() ||
        !touchArmed ||
        !event.touches ||
        !event.touches.length
      ) {
        return;
      }

      /* Already pinned: block page scroll so swipes step panels. */
      if (isActive()) {
        event.preventDefault();
        return;
      }

      /* Near but not pinned: mirror wheel snap-in on phones
         (desktop had this; touch did not — so mobile scrolled past). */
      if (!isNearSection() || touchStartY === null) return;
      var dy = touchStartY - event.touches[0].clientY;
      if (Math.abs(dy) < 8) return;
      if (snapIntoSection(dy > 0 ? 1 : -1)) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
  window.addEventListener(
    "touchend",
    function (event) {
      if (touchStartY === null) return;
      var endY =
        event.changedTouches && event.changedTouches.length
          ? event.changedTouches[0].clientY
          : touchStartY;
      var delta = touchStartY - endY;
      touchStartY = null;
      touchArmed = false;
      if (exiting || animating || pinsSuppressed()) return;

      if (!isActive()) {
        if (!isNearSection() || Math.abs(delta) < SWIPE_TOLERANCE) return;
        snapIntoSection(delta > 0 ? 1 : -1);
        return;
      }

      if (Math.abs(delta) < SWIPE_TOLERANCE) return;
      var dir = delta > 0 ? 1 : -1;
      gotoSection(currentIndex + dir, dir);
    },
    { passive: true }
  );

  /* Keep scroll locked while a transition owns the stage. */
  window.addEventListener(
    "scroll",
    function () {
      if (exiting || pinsSuppressed()) {
        lockedScrollY = null;
        return;
      }
      if (lockedScrollY !== null && (animating || isEngaged() || isNearSection())) {
        if (Math.abs(window.pageYOffset - lockedScrollY) > 1) {
          window.scrollTo(0, lockedScrollY);
        }
      }
      /* Free-scroll entry (phones have no wheel): pin when the
         stage fills the viewport. Resting heading uses index 0,
         so do not require currentIndex < 0. */
      if (!animating && isEngaged() && lockedScrollY === null) {
        lockToSection();
        if (currentIndex < 0) gotoSection(0, 1);
      }
      if (!isNearSection() && !animating) {
        lockedScrollY = null;
      }
    },
    { passive: true }
  );

  if (prevBtn) {
    prevBtn.addEventListener("click", function () {
      if (animating || exiting) return;
      lockToSection();
      gotoSection(currentIndex - 1, -1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", function () {
      if (animating || exiting) return;
      lockToSection();
      gotoSection(currentIndex + 1, 1);
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener("click", function () {
      exitDown();
    });
  }

  /* Initial pose: all panels parked like the CodePen
     gsap.set(outer, 100) / gsap.set(inner, -100); heading waits
     until the section is engaged, then gotoSection(0, 1). */
  panels.forEach(function (_, i) {
    setYPercent(outers[i], 100);
    setYPercent(inners[i], -100);
    setYPercent(images[i], 0);
    setPanelVisible(i, false, 0);
    setCharsRest(i, false);
  });

  /* If the section is already on screen at load, play heading in. */
  if (isEngaged() || isNearSection()) {
    lockToSection();
    gotoSection(0, 1);
  } else {
    /* Resting visible heading so the blush block isn't blank
       before the user reaches it (no animation until engaged). */
    setYPercent(outers[0], 0);
    setYPercent(inners[0], 0);
    setYPercent(images[0], 0);
    setPanelVisible(0, true, 1);
    currentIndex = 0;
    updateControls();
  }
})();
