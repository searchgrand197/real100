/* Customer reviews — full-bleed endless carousel.
   Drag / swipe / click-to-center; equal-height cards; no nav chrome. */

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
    var stage = document.querySelector("[data-review-carousel]");
    var track = document.querySelector("[data-review-track]");
    if (!stage || !track) return;

    var originals = Array.prototype.slice.call(
      track.querySelectorAll("[data-review-card]")
    );
    var total = originals.length;
    if (total < 2) return;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var setWidth = 0;
    var offset = 0;
    var activeIndex = 0;
    var clonesReady = false;
    var suppressClick = false;

    var drag = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastT: 0,
      deltaX: 0,
      velocity: 0,
      moved: false,
      axis: null,
      baseOffset: 0,
      targetCard: null,
    };

    function cardWidth() {
      var first = track.querySelector(".review-card");
      if (!first) return 320;
      return first.getBoundingClientRect().width;
    }

    function stepSize() {
      var styles = getComputedStyle(track);
      var gap = parseFloat(styles.columnGap || styles.gap) || 0;
      return cardWidth() + gap;
    }

    function centerPad() {
      return (stage.clientWidth - cardWidth()) / 2;
    }

    function measureSet() {
      setWidth = stepSize() * total;
    }

    /* Absolute child index whose left edge sits at the centred slot. */
    function indexFromOffset(value) {
      var step = stepSize();
      if (!step) return total;
      return Math.round((centerPad() - value) / step);
    }

    function offsetForIndex(index) {
      return centerPad() - index * stepSize();
    }

    function applyTransform(instant) {
      if (instant || reduceMotion.matches) {
        track.style.transition = "none";
      } else {
        track.style.transition =
          "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)";
      }
      track.style.transform = "translate3d(" + offset + "px, 0, 0)";
    }

    function wrapOffset() {
      if (!setWidth) return 0;
      var shift = 0;
      var idx = indexFromOffset(offset);
      /* Keep the centred card inside the middle (original) set. */
      while (idx < total) {
        shift -= setWidth;
        idx = indexFromOffset(offset + shift);
      }
      while (idx >= total * 2) {
        shift += setWidth;
        idx = indexFromOffset(offset + shift);
      }
      offset += shift;
      return shift;
    }

    function normalizeLoop(instant) {
      wrapOffset();
      activeIndex = indexFromOffset(offset);
      applyTransform(instant);
    }

    function goToIndex(index, instant) {
      offset = offsetForIndex(index);
      wrapOffset();
      activeIndex = indexFromOffset(offset);
      applyTransform(instant);
    }

    function snapToNearest() {
      goToIndex(indexFromOffset(offset), false);
    }

    function buildClones() {
      if (clonesReady) return;
      var fragBefore = document.createDocumentFragment();
      var fragAfter = document.createDocumentFragment();

      originals.forEach(function (card) {
        var before = card.cloneNode(true);
        var after = card.cloneNode(true);
        before.setAttribute("aria-hidden", "true");
        after.setAttribute("aria-hidden", "true");
        before.removeAttribute("data-review-card");
        after.removeAttribute("data-review-card");
        before.classList.add("is-clone");
        after.classList.add("is-clone");
        fragBefore.appendChild(before);
        fragAfter.appendChild(after);
      });

      track.insertBefore(fragBefore, track.firstChild);
      track.appendChild(fragAfter);
      clonesReady = true;
    }

    function goHome(instant) {
      measureSet();
      /* First original card sits at child index `total` after before-clones. */
      goToIndex(total, instant);
    }

    function endDrag(event) {
      if (!drag.active) return;
      if (event && drag.pointerId != null && event.pointerId !== drag.pointerId) {
        return;
      }

      var velocity = drag.velocity;
      var didMove = drag.moved;
      var targetCard = drag.targetCard;

      drag.active = false;
      drag.pointerId = null;
      drag.axis = null;
      drag.targetCard = null;
      stage.classList.remove("is-dragging");

      if (!didMove) {
        if (targetCard) {
          var cards = Array.prototype.slice.call(track.children);
          var idx = cards.indexOf(targetCard);
          if (idx >= 0 && idx !== activeIndex) {
            suppressClick = true;
            window.setTimeout(function () {
              suppressClick = false;
            }, 320);
            goToIndex(idx, false);
            return;
          }
        }
        normalizeLoop(true);
        return;
      }

      suppressClick = true;
      window.setTimeout(function () {
        suppressClick = false;
      }, 320);

      var step = stepSize();
      var projected =
        offset + clamp(velocity * 170, -step * 1.25, step * 1.25);
      goToIndex(indexFromOffset(projected), false);
    }

    buildClones();
    goHome(true);

    stage.addEventListener("pointerdown", function (event) {
      if (event.button != null && event.button !== 0) return;

      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.lastX = event.clientX;
      drag.lastT = performance.now();
      drag.deltaX = 0;
      drag.velocity = 0;
      drag.moved = false;
      drag.axis = null;
      drag.baseOffset = offset;
      drag.targetCard = event.target.closest(".review-card");

      track.style.transition = "none";

      try {
        stage.setPointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
    });

    stage.addEventListener("pointermove", function (event) {
      if (!drag.active || event.pointerId !== drag.pointerId) return;

      var dx = event.clientX - drag.startX;
      var dy = event.clientY - drag.startY;

      if (!drag.axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.15) {
          drag.active = false;
          drag.pointerId = null;
          try {
            stage.releasePointerCapture(event.pointerId);
          } catch (err) {
            /* ignore */
          }
          return;
        }
        drag.axis = "x";
        stage.classList.add("is-dragging");
      }

      if (drag.axis !== "x") return;

      var now = performance.now();
      var dt = now - drag.lastT;
      var x = event.clientX;
      if (dt > 8) {
        drag.velocity = clamp((x - drag.lastX) / dt, -1.4, 1.4);
        drag.lastX = x;
        drag.lastT = now;
      }

      drag.deltaX = dx;
      if (Math.abs(dx) > 5) drag.moved = true;

      offset = drag.baseOffset + dx;
      drag.baseOffset += wrapOffset();
      applyTransform(true);
    });

    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("lostpointercapture", function () {
      if (drag.active) endDrag();
    });

    track.addEventListener("click", function (event) {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      var card = event.target.closest(".review-card");
      if (!card || !track.contains(card)) return;

      var cards = Array.prototype.slice.call(track.children);
      var idx = cards.indexOf(card);
      if (idx < 0 || idx === activeIndex) return;

      event.preventDefault();
      goToIndex(idx, false);
    });

    track.addEventListener("transitionend", function (event) {
      if (event.target !== track || event.propertyName !== "transform") return;
      normalizeLoop(true);
    });

    stage.addEventListener(
      "wheel",
      function (event) {
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
        event.preventDefault();
        offset -= event.deltaX;
        applyTransform(true);
        window.clearTimeout(stage._reviewWheelSnap);
        stage._reviewWheelSnap = window.setTimeout(function () {
          snapToNearest();
        }, 90);
      },
      { passive: false }
    );

    stage.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToIndex(activeIndex - 1, false);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToIndex(activeIndex + 1, false);
      }
    });

    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        measureSet();
        goToIndex(activeIndex, true);
        normalizeLoop(true);
      }, 120);
    });

    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener("change", function () {
        applyTransform(true);
      });
    }
  });
})();
