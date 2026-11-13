/* real100agro — Process horizontal pin scroll.
 *
 * Mid section only from CodePen qBNvrRQ (Cameron Knight):
 * sticky full-viewport stage + scrubbed translateX on the
 * horizontal wrap. No Locomotive Scroll, no intro/outro
 * pages from the pen — native vertical scroll enters the
 * pin and exits into Our Story when the last panel clears.
 *
 * Same sticky+scrub pattern as the old journey-stack, so we
 * stay off a GSAP CDN while matching the pen's feel.
 */

(function () {
  "use strict";

  var section = document.querySelector("[data-process-pin]");
  if (!section) return;

  var wrap = section.querySelector("[data-process-wrap]");
  if (!wrap) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    section.classList.add("process-pin--static");
    return;
  }

  section.classList.add("process-pin--active");

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  var stage = section.querySelector(".process-pin__stage");

  function horizontalOverflow() {
    var viewW = (stage && stage.clientWidth) || window.innerWidth;
    return Math.max(0, wrap.scrollWidth - viewW);
  }

  function measure() {
    var overflow = horizontalOverflow();
    var vh = window.innerHeight || 1;
    /* Track height = viewport + sideways distance, so scrub
       maps 1px vertical to 1px horizontal like the pen's
       ScrollTrigger end: pinWrapWidth. */
    section.style.height = overflow > 0 ? vh + overflow + "px" : "100vh";
  }

  function update() {
    var vh = window.innerHeight || 1;
    var total = section.offsetHeight - vh;
    var rect = section.getBoundingClientRect();
    var progress = total > 0 ? clamp(-rect.top / total, 0, 1) : 0;
    var x = -horizontalOverflow() * progress;
    wrap.style.transform = "translate3d(" + x.toFixed(2) + "px, 0, 0)";
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      update();
    });
  }

  var resizeTimer = 0;
  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      measure();
      update();
    }, 80);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      measure();
      update();
    });
  }

  var images = wrap.querySelectorAll("img");
  var pending = images.length;
  function onImageSettled() {
    pending -= 1;
    if (pending <= 0) {
      measure();
      update();
    }
  }
  if (pending === 0) {
    measure();
    update();
  } else {
    Array.prototype.forEach.call(images, function (img) {
      if (img.complete) {
        onImageSettled();
      } else {
        img.addEventListener("load", onImageSettled, { once: true });
        img.addEventListener("error", onImageSettled, { once: true });
      }
    });
    measure();
    update();
  }
})();
