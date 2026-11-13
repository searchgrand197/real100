/* real100agro — cinematic hero prototype.
 * Idle float + pointer parallax on droplets/jar, scroll scale on stage.
 * No GSAP dependency; respects prefers-reduced-motion.
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-hero-cinematic]");
  if (!root) return;

  var stage = root.querySelector("[data-hero-stage]");
  var jar = root.querySelector("[data-hero-jar]");
  var jarImg = root.querySelector("[data-hero-jar-image]");
  var drops = Array.prototype.slice.call(
    root.querySelectorAll("[data-hero-droplets] .hero-drop")
  );
  if (!stage || !jar) return;

  // Random hero product photo on each visit
  var HERO_PRODUCTS = [
    { src: "assets/images/products/a2-desi-cow-1l.png", alt: "Real100 A2 Desi Cow Bilona Ghee" },
    { src: "assets/images/products/a2-gir-cow-1l.png", alt: "Real100 A2 Gir Cow Bilona Ghee" },
    { src: "assets/images/products/pahadi-cow-1l.png", alt: "Real100 Pahadi Cow Bilona Ghee" },
    { src: "assets/images/products/buffalo-ghee-1l.png", alt: "Real100 Buffalo Bilona Ghee" },
    { src: "assets/images/products/a2-desi-cow-5l.png", alt: "Real100 A2 Desi Cow Bilona Ghee 5 Litre" },
  ];
  if (jarImg && HERO_PRODUCTS.length) {
    var pick = HERO_PRODUCTS[Math.floor(Math.random() * HERO_PRODUCTS.length)];
    jarImg.src = pick.src;
    jarImg.alt = pick.alt;
  }

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var pointerOk = window.matchMedia("(pointer: fine)").matches;

  var pointerX = 0;
  var pointerY = 0;
  var targetX = 0;
  var targetY = 0;
  var scrollScale = 1;
  var rafId = 0;
  var start = performance.now();

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function updateScrollScale() {
    var rect = root.getBoundingClientRect();
    var progress = clamp(-rect.top / Math.max(rect.height, 1), 0, 1);
    scrollScale = 1 - progress * 0.12;
  }

  function onPointerMove(event) {
    var rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  }

  function onScroll() {
    updateScrollScale();
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (reduceMotion.matches) return;

    var t = (now - start) / 1000;
    pointerX += (targetX - pointerX) * 0.06;
    pointerY += (targetY - pointerY) * 0.06;

    stage.style.transform =
      "scale(" + scrollScale.toFixed(4) + ")";

    var jarBob = Math.sin(t * 0.7) * 6;
    var jarParallaxX = pointerX * 8;
    var jarParallaxY = pointerY * 6;
    jar.style.transform =
      "translate3d(" +
      jarParallaxX.toFixed(2) +
      "px, " +
      (jarBob + jarParallaxY).toFixed(2) +
      "px, 0)";

    for (var i = 0; i < drops.length; i++) {
      var drop = drops[i];
      var depth = parseFloat(drop.getAttribute("data-depth") || "0.3");
      var phase = i * 0.7;
      var floatY = Math.sin(t * (0.55 + depth * 0.4) + phase) * (6 + depth * 10);
      var floatX = Math.cos(t * (0.35 + depth * 0.25) + phase) * (4 + depth * 6);
      var rot = Math.sin(t * 0.4 + phase) * (3 + depth * 4);
      var px = pointerX * depth * 28;
      var py = pointerY * depth * 22;
      drop.style.transform =
        "translate3d(" +
        (floatX + px).toFixed(2) +
        "px, " +
        (floatY + py).toFixed(2) +
        "px, 0) rotate(" +
        rot.toFixed(2) +
        "deg)";
    }
  }

  function startLoop() {
    if (rafId) return;
    updateScrollScale();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
    stage.style.transform = "";
    jar.style.transform = "";
    for (var i = 0; i < drops.length; i++) {
      drops[i].style.transform = "";
    }
  }

  function bind() {
    window.addEventListener("scroll", onScroll, { passive: true });
    if (pointerOk) {
      stage.addEventListener("pointermove", onPointerMove, { passive: true });
      stage.addEventListener(
        "pointerleave",
        function () {
          targetX = 0;
          targetY = 0;
        },
        { passive: true }
      );
    }
    if (!reduceMotion.matches) startLoop();
  }

  reduceMotion.addEventListener("change", function () {
    if (reduceMotion.matches) stopLoop();
    else startLoop();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
