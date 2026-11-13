/* Featured videos — infinite cover-flow carousel.
   Centre card is largest; left/right cards scale down for depth.
   Navigate with prev/next, drag/swipe, or click a side card. */

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

  function shortestOffset(index, active, total) {
    var delta = index - active;
    var half = total / 2;
    if (delta > half) delta -= total;
    if (delta < -half) delta += total;
    return delta;
  }

  function wrapIndex(index, total) {
    return ((index % total) + total) % total;
  }

  onReady(function () {
    var stage = document.querySelector("[data-video-carousel]");
    var track = document.querySelector("[data-video-track]");
    if (!stage || !track) return;

    var cards = Array.prototype.slice.call(
      track.querySelectorAll("[data-video-card]")
    );
    var total = cards.length;
    if (total < 2) return;

    var prevBtn = document.querySelector("[data-video-prev]");
    var nextBtn = document.querySelector("[data-video-next]");
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var active = cards.findIndex(function (card) {
      return card.classList.contains("is-active");
    });
    if (active < 0) active = 0;

    var hoverIndex = -1;
    var drag = {
      active: false,
      pointerId: null,
      startX: 0,
      lastX: 0,
      lastT: 0,
      deltaX: 0,
      velocity: 0,
      moved: false,
      suppressClick: false,
      targetIndex: -1,
    };

    function metrics() {
      var width = stage.clientWidth || 1;
      var cardW = parseFloat(
        getComputedStyle(stage).getPropertyValue("--video-card-w")
      );
      if (!cardW || isNaN(cardW)) cardW = 240;
      /* Spacing ≈ card width so drag distance maps 1:1 to next card. */
      var spacing = clamp(cardW * 0.78, 140, 210);
      var maxVisible = width < 640 ? 1.85 : width < 960 ? 2.35 : 2.75;
      return {
        spacing: spacing,
        stepPx: spacing,
        maxVisible: maxVisible,
        rotate: reduceMotion.matches ? 0 : 8,
      };
    }

    function layout(dragOffset, instant) {
      var m = metrics();
      /* Finger right (positive deltaX) must move cards right —
         same sign as release math: steps = round(-deltaX / stepPx). */
      var dragSteps = -(dragOffset || 0) / m.stepPx;

      for (var i = 0; i < total; i++) {
        var card = cards[i];
        var offset = shortestOffset(i, active, total) - dragSteps;
        var abs = Math.abs(offset);
        var isCentre = Math.abs(offset) < 0.45;
        var isHover = !drag.active && hoverIndex === i && !isCentre;
        var scale = clamp(1 - abs * 0.16, 0.62, 1);
        if (isHover) scale = clamp(scale + 0.07, 0.62, 0.98);

        var x = offset * m.spacing;
        if (!drag.active) x = Math.round(x);

        var z = 60 - abs * 28;
        if (isHover) z += 56;

        var y = isHover ? -10 : 0;
        var rotateY = -offset * m.rotate;
        var opacity =
          abs > m.maxVisible ? 0 : clamp(1 - abs * 0.08, 0.72, 1);
        if (isCentre) opacity = 1;

        /* Resting centre card must use a flat 2D transform. A positive
           translateZ under perspective enlarges the card (~7% at z=90)
           and softens the product strip (thumb + prices + Buy Now). */
        var flatCentre = isCentre && !drag.active;

        var hidden = abs > m.maxVisible + 0.15;

        if (instant || drag.active) {
          card.style.transition = "none";
        } else {
          card.style.transition = "";
        }

        if (flatCentre) {
          card.style.transform =
            "translate(-50%, -50%) translate(" + x + "px, 0px)";
        } else {
          /* perspective() is per-card so the flat centre card is not
             drawn inside a shared 3D scene (which softens text). */
          card.style.transform =
            "translate(-50%, -50%) perspective(1400px) translate3d(" +
            x +
            "px, " +
            y +
            "px, " +
            z +
            "px) rotateY(" +
            rotateY.toFixed(2) +
            "deg) scale(" +
            scale.toFixed(3) +
            ")";
        }
        card.style.opacity = String(opacity);
        card.style.zIndex = String(
          Math.round((isHover ? 260 : 200) - abs * 20)
        );
        card.style.pointerEvents = hidden ? "none" : "auto";
        card.style.filter = "none";
        card.classList.toggle("is-active", isCentre && !drag.active);
        card.classList.toggle("is-hover", isHover);
        card.setAttribute("aria-hidden", hidden ? "true" : "false");
        card.tabIndex = isCentre ? 0 : -1;
      }
    }

    function goTo(index, instant) {
      active = wrapIndex(index, total);
      drag.deltaX = 0;
      drag.velocity = 0;
      layout(0, instant);
    }

    function step(dir) {
      goTo(active + dir);
    }

    function endDrag(event) {
      if (!drag.active) return;
      if (event && drag.pointerId != null && event.pointerId !== drag.pointerId) {
        return;
      }

      var m = metrics();
      var didMove = drag.moved;
      var targetIndex = drag.targetIndex;
      var deltaX = drag.deltaX;
      var velocity = drag.velocity;

      drag.active = false;
      drag.pointerId = null;
      stage.classList.remove("is-dragging");

      /* Pure click / tap on a side card → bring it to centre. */
      if (!didMove && targetIndex >= 0 && targetIndex !== active) {
        drag.suppressClick = true;
        window.setTimeout(function () {
          drag.suppressClick = false;
        }, 280);
        goTo(targetIndex);
        return;
      }

      /* Distance decides the step count; velocity only breaks ties. */
      var steps = Math.round(-deltaX / m.stepPx);
      if (steps === 0 && Math.abs(deltaX) > m.stepPx * 0.22) {
        steps = deltaX < 0 ? 1 : -1;
      } else if (steps === 0 && Math.abs(velocity) > 0.4) {
        steps = velocity < 0 ? 1 : -1;
      }
      steps = clamp(steps, -2, 2);

      if (didMove) {
        drag.suppressClick = true;
        window.setTimeout(function () {
          drag.suppressClick = false;
        }, 320);
      }

      goTo(active + steps);
    }

    layout(0, true);

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        step(-1);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        step(1);
      });
    }

    cards.forEach(function (card, index) {
      card.addEventListener("pointerenter", function (event) {
        if (event.pointerType === "touch") return;
        if (drag.active) return;
        hoverIndex = index;
        layout(0);
      });
      card.addEventListener("pointerleave", function (event) {
        if (event.pointerType === "touch") return;
        if (hoverIndex !== index) return;
        hoverIndex = -1;
        if (!drag.active) layout(0);
      });
    });

    stage.addEventListener("pointerdown", function (event) {
      if (event.button != null && event.button !== 0) return;

      var host = event.target.closest("[data-video-card]");
      var control = event.target.closest(
        ".video-card__wish, .video-card__play, [data-add-to-cart], a, input, label"
      );
      /* Active-card controls keep their own click; everything else can drag. */
      if (control && host && host.classList.contains("is-active")) return;

      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.lastX = event.clientX;
      drag.lastT = performance.now();
      drag.deltaX = 0;
      drag.velocity = 0;
      drag.moved = false;
      drag.targetIndex = host ? cards.indexOf(host) : -1;
      hoverIndex = -1;
      stage.classList.add("is-dragging");
      layout(0, true);

      try {
        stage.setPointerCapture(event.pointerId);
      } catch (err) {
        /* ignore */
      }
    });

    stage.addEventListener("pointermove", function (event) {
      if (!drag.active || event.pointerId !== drag.pointerId) return;

      var now = performance.now();
      var dt = now - drag.lastT;
      var x = event.clientX;
      /* Ignore tiny timestamps from synthetic/batched events. */
      if (dt > 8) {
        drag.velocity = clamp((x - drag.lastX) / dt, -1.2, 1.2);
        drag.lastX = x;
        drag.lastT = now;
      }
      drag.deltaX = x - drag.startX;

      if (Math.abs(drag.deltaX) > 5) drag.moved = true;
      layout(drag.deltaX, true);
    });

    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("lostpointercapture", function () {
      if (drag.active) endDrag();
    });

    track.addEventListener("click", function (event) {
      if (drag.suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      var card = event.target.closest("[data-video-card]");
      if (!card) return;
      var index = cards.indexOf(card);
      if (index < 0) return;

      /* Side card: any click brings it to centre. */
      if (index !== active) {
        event.preventDefault();
        hoverIndex = -1;
        goTo(index);
        return;
      }

      var wish = event.target.closest(".video-card__wish");
      if (wish) {
        var pressed = wish.getAttribute("aria-pressed") === "true";
        wish.setAttribute("aria-pressed", pressed ? "false" : "true");
        wish.setAttribute(
          "aria-label",
          pressed ? "Add to wishlist" : "Remove from wishlist"
        );
      }
    });

    stage.addEventListener(
      "wheel",
      function (event) {
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
        event.preventDefault();
        if (Math.abs(event.deltaX) < 10) return;
        step(event.deltaX > 0 ? 1 : -1);
      },
      { passive: false }
    );

    window.addEventListener("keydown", function (event) {
      if (!stage.matches(":hover") && document.activeElement !== stage) {
        var focusedCard = document.activeElement
          ? document.activeElement.closest("[data-video-card]")
          : null;
        if (!focusedCard || !track.contains(focusedCard)) return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    });

    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        layout(0, true);
      }, 120);
    });

    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener("change", function () {
        layout(0, true);
      });
    }
  });
})();
