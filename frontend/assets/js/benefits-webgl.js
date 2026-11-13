/* real100agro — Benefits WebGL tile gallery.
 *
 * Adapted from a fullscreen CodePen gallery into a section-scoped
 * component. Differences from the original, on purpose:
 * - No fullscreen takeover, no wheel hijacking, no document-wide
 *   click/key listeners: page scrolling stays normal.
 * - No GSAP intro and no deprecated Geometry/Face3: the tile
 *   geometry is BufferGeometry, and the first picture starts
 *   assembled (progress 0), so the section never opens mid-explosion.
 * - Three.js loads lazily, only when Benefits is near the viewport,
 *   and rendering pauses while it is off screen.
 * - Reduced motion, no WebGL, or a failed load all fall back to a
 *   static picture plus the real HTML benefits list underneath.
 *
 * PLACEHOLDER PICTURES: replace the four URLs below with your own
 * pictures later (for example 'assets/images/benefits-1.jpg').
 * Keep CAPTIONS in the same order as IMAGES.
 */

(function () {
  "use strict";

  var wrapper = document.querySelector("[data-benefits-webgl]");
  if (!wrapper) return;

  var stage = wrapper.querySelector(".benefits-webgl__stage");
  var canvas = document.getElementById("benefits-canvas");
  var captionEl = wrapper.querySelector("[data-benefits-caption]");
  var prevBtn = wrapper.querySelector("[data-benefits-prev]");
  var nextBtn = wrapper.querySelector("[data-benefits-next]");

  var IMAGES = [
    "https://assets.codepen.io/33787/img1.jpg",
    "https://assets.codepen.io/33787/img2.jpg",
    "https://assets.codepen.io/33787/img3.jpg",
    "https://assets.codepen.io/33787/img4.jpg"
  ];

  var CAPTIONS = [
    "Traditionally bilona-churned",
    "From desi cows, grass-fed",
    "Slow-cooked, golden and aromatic",
    "One jar, many benefits"
  ];

  function showFallback() {
    wrapper.classList.add("is-fallback");
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showFallback();
    return;
  }
  if (!canvas) {
    showFallback();
    return;
  }
  // Do NOT probe the real canvas for WebGL support:
  // that creates a WebGL1 context on it, and Three.js (which wants
  // WebGL2) then cannot create a second, different context on the
  // same canvas — the exact error in the console screenshot
  // ("Canvas has an existing context of a different type").
  // Probe a throwaway canvas instead; it never touches the real one.
  var probeCanvas = document.createElement("canvas");
  if (
    !probeCanvas.getContext("webgl2") &&
    !probeCanvas.getContext("webgl")
  ) {
    showFallback();
    return;
  }

  var started = false;
  var observer = new IntersectionObserver(
    function (entries) {
      if (entries[0].isIntersecting && !started) {
        started = true;
        observer.disconnect();
        startGallery();
      }
    },
    { rootMargin: "200px" }
  );
  observer.observe(stage);

  function startGallery() {
    import("https://unpkg.com/three@0.160.0/build/three.module.js")
      .then(function (THREE) {
        init(THREE);
      })
      .catch(showFallback);
  }

  function limit(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function lerp(a, b, x) {
    return a + x * (b - a);
  }

  function init(THREE) {
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true
      });
    } catch (e) {
      showFallback();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    var camera = new THREE.PerspectiveCamera(50);
    camera.position.z = 150;

    var screen = { width: 0, height: 0, wWidth: 0, wHeight: 0, ratio: 0 };
    var textures = [];
    var plane1, plane2, planes;
    var progress = 0;
    var targetProgress = 0;
    var visible = true;
    var mouse = new THREE.Vector2();
    var mouseTarget = new THREE.Vector2();

    function updateSize() {
      var w = stage.clientWidth;
      var h = stage.clientHeight;
      if (!w || !h) return;
      screen.width = w;
      screen.height = h;
      screen.ratio = w / h;
      renderer.setSize(w, h, false);
      camera.aspect = screen.ratio;
      camera.updateProjectionMatrix();
      var vFOV = (camera.fov * Math.PI) / 180;
      var wh = 2 * Math.tan(vFOV / 2) * Math.abs(camera.position.z);
      screen.wWidth = wh * camera.aspect;
      screen.wHeight = wh;
      if (plane1) plane1.resize();
      if (plane2) plane2.resize();
    }

    function setCaption(index) {
      if (captionEl) captionEl.textContent = CAPTIONS[index] || "";
    }

    function setPlanesProgress(p) {
      plane1.uProgress.value = p;
      plane2.uProgress.value = -1 + p;
      plane1.material.opacity = 1 - p;
      plane2.material.opacity = p;
      plane1.o3d.position.z = p;
      plane2.o3d.position.z = p - 1;
    }

    function updateProgress() {
      var next = lerp(progress, targetProgress, 0.1);
      var pdiff = next - progress;
      if (pdiff === 0) return;
      var p0 = progress % 1;
      var p1 = next % 1;
      if ((pdiff > 0 && p1 < p0) || (pdiff < 0 && p0 < p1)) {
        var i = Math.floor(next);
        plane1.setTexture(textures[i]);
        plane2.setTexture(textures[i + 1]);
        setCaption(i);
      }
      progress = next;
      setPlanesProgress(progress % 1);
    }

    function navNext() {
      if (Number.isInteger(targetProgress)) targetProgress += 1;
      else targetProgress = Math.ceil(targetProgress);
      targetProgress = limit(targetProgress, 0, IMAGES.length - 1);
      setCaption(targetProgress);
    }

    function navPrevious() {
      if (Number.isInteger(targetProgress)) targetProgress -= 1;
      else targetProgress = Math.floor(targetProgress);
      targetProgress = limit(targetProgress, 0, IMAGES.length - 1);
      setCaption(targetProgress);
    }

    function animate() {
      requestAnimationFrame(animate);
      if (!visible) return;
      updateProgress();
      planes.rotation.x = lerp(planes.rotation.x, -mouseTarget.y * 0.2, 0.1);
      planes.rotation.y = lerp(planes.rotation.y, mouseTarget.x * 0.2, 0.1);
      renderer.render(scene, camera);
    }

    var scene;
    var loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    function loadTexture(src) {
      return new Promise(function (resolve, reject) {
        loader.load(
          src,
          function (texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            resolve(texture);
          },
          undefined,
          reject
        );
      });
    }

    Promise.all(IMAGES.map(loadTexture))
      .then(function (loaded) {
        loaded.forEach(function (t, i) {
          textures[i] = t;
        });
        scene = new THREE.Scene();

        plane1 = new AnimatedPlane(THREE, {
          screen: screen,
          size: 28,
          anim: 1,
          texture: textures[0]
        });
        plane2 = new AnimatedPlane(THREE, {
          screen: screen,
          size: 28,
          anim: 2,
          texture: textures[1]
        });
        setPlanesProgress(0);

        planes = new THREE.Object3D();
        planes.add(plane1.o3d);
        planes.add(plane2.o3d);
        scene.add(planes);

        updateSize();
        setCaption(0);

        if (prevBtn) prevBtn.addEventListener("click", navPrevious);
        if (nextBtn) nextBtn.addEventListener("click", navNext);

        stage.addEventListener("mousemove", function (e) {
          var r = stage.getBoundingClientRect();
          mouseTarget.x = ((e.clientX - r.left) / r.width) * 2 - 1;
          mouseTarget.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        });
        stage.addEventListener("mouseleave", function () {
          mouseTarget.set(0, 0);
        });
        stage.addEventListener("keydown", function (e) {
          if (e.key === "ArrowLeft") navPrevious();
          else if (e.key === "ArrowRight") navNext();
        });

        var touchX = null;
        stage.addEventListener(
          "touchstart",
          function (e) {
            touchX = e.changedTouches[0].clientX;
          },
          { passive: true }
        );
        stage.addEventListener(
          "touchend",
          function (e) {
            if (touchX === null) return;
            var dx = e.changedTouches[0].clientX - touchX;
            if (dx < -40) navNext();
            else if (dx > 40) navPrevious();
            touchX = null;
          },
          { passive: true }
        );

        var resizeTimer;
        new ResizeObserver(function () {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(updateSize, 200);
        }).observe(stage);

        new IntersectionObserver(function (entries) {
          visible = entries[0].isIntersecting;
        }).observe(stage);

        requestAnimationFrame(animate);
      })
      .catch(showFallback);
  }

  /* Tile plane: one image split into an instanced grid of squares.
   * BufferGeometry only — the original Geometry/Face3 API is gone
   * from modern Three.js. */
  function AnimatedPlane(THREE, params) {
    this.THREE = THREE;
    for (var key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        this[key] = params[key];
      }
    }
    this.o3d = new THREE.Object3D();
    this.uProgress = { value: 0 };
    this.uvScale = new THREE.Vector2();
    this.initMaterial(THREE);
    this.initPlane(THREE);
  }

  AnimatedPlane.prototype.initMaterial = function (THREE) {
    var self = this;
    this.material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      map: this.texture,
      onBeforeCompile: function (shader) {
        shader.uniforms.progress = self.uProgress;
        shader.uniforms.uvScale = { value: self.uvScale };
        shader.vertexShader =
          "uniform float progress;\n" +
          "uniform vec2 uvScale;\n" +
          "attribute vec3 offset;\n" +
          "attribute vec3 rotation;\n" +
          "attribute vec2 uvOffset;\n" +
          "mat3 rotationMatrixXYZ(vec3 r) {\n" +
          "  float cx = cos(r.x); float sx = sin(r.x);\n" +
          "  float cy = cos(r.y); float sy = sin(r.y);\n" +
          "  float cz = cos(r.z); float sz = sin(r.z);\n" +
          "  return mat3(\n" +
          "     cy * cz, cx * sz + sx * sy * cz, sx * sz - cx * sy * cz,\n" +
          "    -cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz,\n" +
          "          sy,               -sx * cy,                cx * cy);\n" +
          "}\n" +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\n vUv = vUv * uvScale + uvOffset;"
        );
        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          "mat3 rotMat = rotationMatrixXYZ(progress * rotation);\n" +
            "transformed = rotMat * transformed;\n" +
            "vec4 mvPosition = vec4(transformed, 1.0);\n" +
            "#ifdef USE_INSTANCING\n" +
            "  mvPosition = instanceMatrix * mvPosition;\n" +
            "#endif\n" +
            "mvPosition.xyz += progress * offset;\n" +
            "mvPosition = modelViewMatrix * mvPosition;\n" +
            "gl_Position = projectionMatrix * mvPosition;"
        );
      }
    });
  };

  AnimatedPlane.prototype.initPlane = function (THREE) {
    var width = this.screen.width;
    var wWidth = this.screen.wWidth;
    var wHeight = this.screen.wHeight;
    if (!width || !wWidth) return;
    this.wSize = (this.size * wWidth) / width;
    this.nx = Math.ceil(wWidth / this.wSize) + 1;
    this.ny = Math.ceil(wHeight / this.wSize) + 1;
    this.icount = this.nx * this.ny;

    this.initGeometry(THREE);
    this.initUV();
    this.initAnimAttributes(THREE);

    if (this.imesh) this.o3d.remove(this.imesh);
    this.imesh = new THREE.InstancedMesh(
      this.bGeometry,
      this.material,
      this.icount
    );
    this.o3d.add(this.imesh);

    var dummy = new THREE.Object3D();
    var index = 0;
    var x = -(wWidth - (wWidth - this.nx * this.wSize)) / 2 + this.dx;
    for (var i = 0; i < this.nx; i++) {
      var y = -(wHeight - (wHeight - this.ny * this.wSize)) / 2 + this.dy;
      for (var j = 0; j < this.ny; j++) {
        dummy.position.set(x, y, 0);
        dummy.updateMatrix();
        this.imesh.setMatrixAt(index++, dummy.matrix);
        y += this.wSize;
      }
      x += this.wSize;
    }
  };

  AnimatedPlane.prototype.initGeometry = function (THREE) {
    this.dx = this.wSize / 2;
    this.dy = this.wSize / 2;
    var s = this.wSize;
    var dx = this.dx;
    var dy = this.dy;
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-dx, -dy, 0, s - dx, -dy, 0, -dx, s - dy, 0, s - dx, s - dy, 0],
        3
      )
    );
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2)
    );
    geometry.setIndex([0, 2, 1, 2, 3, 1]);
    this.bGeometry = geometry;
  };

  AnimatedPlane.prototype.initAnimAttributes = function (THREE) {
    var rnd = THREE.MathUtils.randFloat;
    var rndFS = THREE.MathUtils.randFloatSpread;
    var v3 = new THREE.Vector3();
    var offsets = new Float32Array(this.icount * 3);
    for (var i = 0; i < offsets.length; i += 3) {
      if (this.anim === 1) v3.set(rndFS(10), rnd(50, 100), rnd(20, 50));
      else v3.set(rndFS(20), rndFS(20), rnd(20, 200));
      v3.toArray(offsets, i);
    }
    this.bGeometry.setAttribute(
      "offset",
      new THREE.InstancedBufferAttribute(offsets, 3)
    );
    var rotations = new Float32Array(this.icount * 3);
    var angle = Math.PI * 4;
    for (var k = 0; k < rotations.length; k += 3) {
      rotations[k] = rndFS(angle);
      rotations[k + 1] = rndFS(angle);
      rotations[k + 2] = rndFS(angle);
    }
    this.bGeometry.setAttribute(
      "rotation",
      new THREE.InstancedBufferAttribute(rotations, 3)
    );
  };

  AnimatedPlane.prototype.initUV = function () {
    var ratio = this.nx / this.ny;
    var tRatio =
      this.texture.image.width / this.texture.image.height;
    if (ratio > tRatio)
      this.uvScale.set(1 / this.nx, tRatio / ratio / this.ny);
    else this.uvScale.set(ratio / tRatio / this.nx, 1 / this.ny);
    var nW = this.uvScale.x * this.nx;
    var nH = this.uvScale.y * this.ny;
    var uvOffsets = new Float32Array(this.icount * 2);
    for (var i = 0; i < this.nx; i++) {
      for (var j = 0; j < this.ny; j++) {
        uvOffsets[(i * this.ny + j) * 2] =
          this.uvScale.x * i + (1 - nW) / 2;
        uvOffsets[(i * this.ny + j) * 2 + 1] =
          this.uvScale.y * j + (1 - nH) / 2;
      }
    }
    this.bGeometry.setAttribute(
      "uvOffset",
      new THREE.InstancedBufferAttribute(uvOffsets, 2)
    );
  };

  AnimatedPlane.prototype.setTexture = function (texture) {
    this.texture = texture;
    this.material.map = texture;
    this.initUV();
  };

  AnimatedPlane.prototype.resize = function () {
    this.initPlane(this.THREE);
  };
})();
