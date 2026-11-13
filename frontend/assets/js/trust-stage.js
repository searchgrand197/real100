/* real100agro — Trust farm window.
   Expanding promises + syncing media caption + soft parallax.
   Soft autoplay while in view. No scroll pin. */

(function () {
  "use strict";

  var root = document.querySelector("[data-trust]");
  if (!root) return;

  var promises = Array.prototype.slice.call(
    root.querySelectorAll("[data-trust-promise]")
  );
  if (!promises.length) return;

  var captionEl = root.querySelector("[data-trust-caption]");
  var fill = root.querySelector("[data-trust-fill]");
  var stepEl = root.querySelector("[data-trust-step]");
  var media = root.querySelector("[data-trust-media]");
  var img = root.querySelector("[data-trust-img]");
  var frame = media ? media.querySelector(".trust-media__frame") : null;

  var captions = [
    "Open pasture. Named cows. Honest milk.",
    "Wood, curd, and patient hands — true bilona.",
    "Every batch tested. Every jar traceable."
  ];

  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover =
    window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var active = 0;
  var locked = false;
  var autoTimer = null;
  var AUTO_MS = 4800;
  var inView = false;
  var captionTimer = null;

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function setCaption(index) {
    if (!captionEl) return;
    var next = captions[index] || captions[0];
    if (captionEl.textContent === next) return;

    if (reduceMotion) {
      captionEl.textContent = next;
      return;
    }

    captionEl.classList.add("is-swap");
    if (captionTimer) window.clearTimeout(captionTimer);
    captionTimer = window.setTimeout(function () {
      captionEl.textContent = next;
      captionEl.classList.remove("is-swap");
    }, 220);
  }

  function setActive(index, fromUser) {
    if (index < 0 || index >= promises.length) return;
    if (index === active && promises[index].classList.contains("is-active")) {
      if (fromUser) pauseAuto();
      return;
    }

    active = index;
    promises.forEach(function (item, i) {
      var on = i === active;
      item.classList.toggle("is-active", on);
      item.setAttribute("aria-current", on ? "true" : "false");
    });

    setCaption(active);

    if (fill) {
      fill.style.width = ((active + 1) / promises.length) * 100 + "%";
    }
    if (stepEl) stepEl.textContent = pad(active + 1);

    if (fromUser) {
      pauseAuto();
      if (inView && !reduceMotion) scheduleAuto();
    }
  }

  function next() {
    setActive((active + 1) % promises.length, false);
  }

  function scheduleAuto() {
    if (reduceMotion || locked) return;
    clearAuto();
    autoTimer = window.setTimeout(function () {
      if (!inView || locked) return;
      next();
      scheduleAuto();
    }, AUTO_MS);
  }

  function clearAuto() {
    if (autoTimer) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  function pauseAuto() {
    clearAuto();
  }

  promises.forEach(function (item, i) {
    item.addEventListener("click", function () {
      setActive(i, true);
    });

    item.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        var n = (i + 1) % promises.length;
        setActive(n, true);
        promises[n].focus();
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        var p = (i - 1 + promises.length) % promises.length;
        setActive(p, true);
        promises[p].focus();
      }
    });

    if (canHover) {
      item.addEventListener("mouseenter", function () {
        if (locked) return;
        setActive(i, true);
      });
    }
  });

  root.addEventListener("mouseleave", function () {
    if (!reduceMotion && inView) scheduleAuto();
  });

  root.addEventListener("focusin", function () {
    locked = true;
    pauseAuto();
  });

  root.addEventListener("focusout", function (event) {
    if (root.contains(event.relatedTarget)) return;
    locked = false;
    if (inView && !reduceMotion) scheduleAuto();
  });

  /* Soft pointer parallax on the farm photo. */
  if (frame && img && canHover && !reduceMotion) {
    frame.addEventListener("pointermove", function (event) {
      var rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var nx = (event.clientX - rect.left) / rect.width - 0.5;
      var ny = (event.clientY - rect.top) / rect.height - 0.5;
      img.style.setProperty("--trust-x", (-nx * 14).toFixed(1) + "px");
      img.style.setProperty("--trust-y", (-ny * 10).toFixed(1) + "px");
    });

    frame.addEventListener("pointerleave", function () {
      img.style.setProperty("--trust-x", "0px");
      img.style.setProperty("--trust-y", "0px");
    });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          inView = entry.isIntersecting && entry.intersectionRatio > 0.3;
          if (entry.isIntersecting) root.classList.add("is-inview");
          if (inView && !reduceMotion && !locked) scheduleAuto();
          else pauseAuto();
        });
      },
      { threshold: [0, 0.3, 0.55] }
    );
    observer.observe(root);
  } else {
    root.classList.add("is-inview");
    if (!reduceMotion) {
      inView = true;
      scheduleAuto();
    }
  }

  setActive(0, false);
})();
