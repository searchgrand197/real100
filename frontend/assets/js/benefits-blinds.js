/* real100agro — Benefits photo blinds.
   Expanding strips: hover / tap / keyboard. Soft autoplay while
   the section is in view. No scroll pin. */

(function () {
  "use strict";

  var root = document.querySelector("[data-benefits]");
  if (!root) return;

  var blinds = Array.prototype.slice.call(
    root.querySelectorAll("[data-benefits-blind]")
  );
  if (!blinds.length) return;

  var fill = root.querySelector("[data-benefits-fill]");
  var stepEl = root.querySelector("[data-benefits-step]");
  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover =
    window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var active = 0;
  var locked = false;
  var autoTimer = null;
  var AUTO_MS = 5200;
  var inView = false;

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function setActive(index, fromUser) {
    if (index < 0 || index >= blinds.length) return;
    if (index === active && blinds[index].classList.contains("is-active")) {
      if (fromUser) pauseAuto();
      return;
    }

    active = index;
    blinds.forEach(function (blind, i) {
      var on = i === active;
      blind.classList.toggle("is-active", on);
      blind.setAttribute("aria-current", on ? "true" : "false");
    });

    if (fill) {
      fill.style.width = ((active + 1) / blinds.length) * 100 + "%";
    }
    if (stepEl) stepEl.textContent = pad(active + 1);

    if (fromUser) {
      pauseAuto();
      if (inView && !reduceMotion) scheduleAuto();
    }
  }

  function next() {
    setActive((active + 1) % blinds.length, false);
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

  blinds.forEach(function (blind, i) {
    blind.setAttribute("aria-current", i === 0 ? "true" : "false");

    blind.addEventListener("click", function () {
      setActive(i, true);
    });

    blind.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActive(i, true);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        var n = (i + 1) % blinds.length;
        setActive(n, true);
        blinds[n].focus();
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        var p = (i - 1 + blinds.length) % blinds.length;
        setActive(p, true);
        blinds[p].focus();
      }
    });

    if (canHover) {
      blind.addEventListener("mouseenter", function () {
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

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          inView = entry.isIntersecting && entry.intersectionRatio > 0.35;
          if (inView && !reduceMotion && !locked) scheduleAuto();
          else pauseAuto();
        });
      },
      { threshold: [0, 0.35, 0.6] }
    );
    observer.observe(root);
  } else if (!reduceMotion) {
    inView = true;
    scheduleAuto();
  }

  setActive(0, false);
})();
