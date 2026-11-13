/* real100agro — API client for the Django backend.
   Loaded before store.js on every page.
   API base: window.REAL100AGRO_API_BASE, else localhost:8000 in local
   dev, else same-origin /api on real100agro.com / real100agro.in.
   Auth token is the only thing kept in localStorage (DRF token);
   cart, orders, addresses and products all live on the server. */

(function () {
  "use strict";

  var TOKEN_KEY = "real100agro_token";
  var CART_KEY = "real100agro_cart";

  function cartKey() {
    try {
      var key = window.localStorage.getItem(CART_KEY) || "";
      if (!key) {
        key = (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID()
          : "cart-" + Date.now() + "-" + Math.random().toString(16).slice(2);
        window.localStorage.setItem(CART_KEY, key);
      }
      return key;
    } catch (e) {
      return "";
    }
  }

  function apiBase() {
    if (window.REAL100AGRO_API_BASE) return String(window.REAL100AGRO_API_BASE).replace(/\/$/, "");
    var host = window.location.hostname;
    // Same host as the page so the cart session cookie is same-site.
    // localhost talking to 127.0.0.1 drops that cookie.
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://" + host + ":8000/api";
    }
    if (host === "") return "http://127.0.0.1:8000/api";
    // Production: same-origin /api (works for http and https on this host).
    return "/api";
  }

  var BASE = apiBase();

  function getToken() {
    try { return window.localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }

  function setToken(token) {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  function request(path, options) {
    options = options || {};
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Token " + token;
    var guestCart = cartKey();
    if (guestCart) headers["X-Cart-Key"] = guestCart;
    return window.fetch(BASE + path, {
      method: options.method || "GET",
      headers: headers,
      credentials: "include",
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (resp) {
      if (resp.status === 204) return null;
      return resp.json().catch(function () { return {}; }).then(function (data) {
        if (!resp.ok) {
          var err = new Error((data && (data.detail || data.non_field_errors)) || ("Request failed: " + resp.status));
          err.status = resp.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    }).catch(function (err) {
      if (err instanceof TypeError) {
        var offline = new Error("Backend is unreachable at " + BASE + ". Start it with: python manage.py runserver");
        offline.status = 0;
        throw offline;
      }
      throw err;
    });
  }

  /* ---------- Firebase Phone Auth (OTP) ----------
     Production: Firebase SMS via the configured web app.
     Local/dev: when the API has ALLOW_DEMO_AUTH=1, use demo OTP
     (Firebase blocks Phone Auth on "localhost"; 127.0.0.1 needs
     Authorized domains + SMS region policy in the Firebase console). */
  var DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAvRobkSXCsNFOdogIFwKuN95nLOQIkXoI",
    authDomain: "kushnath-19401.firebaseapp.com",
    projectId: "kushnath-19401",
    storageBucket: "kushnath-19401.firebasestorage.app",
    messagingSenderId: "704991416939",
    appId: "1:704991416939:web:ccf9033058042dadf4d72e",
  };

  function firebaseConfig() {
    if (window.REAL100AGRO_FIREBASE_CONFIG === false) return null;
    return window.REAL100AGRO_FIREBASE_CONFIG || DEFAULT_FIREBASE_CONFIG;
  }

  function isLocalHost() {
    var host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "";
  }

  var firebasePromise = null;

  function loadFirebase() {
    var config = firebaseConfig();
    if (!config) {
      return Promise.reject(new Error("Firebase is not configured."));
    }
    if (firebasePromise) return firebasePromise;
    firebasePromise = new Promise(function (resolve, reject) {
      function loadScript(src) {
        return new Promise(function (res, rej) {
          var s = document.createElement("script");
          s.src = src; s.async = true; s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js")
        .then(function () { return loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"); })
        .then(function () {
          if (!window.firebase.apps.length) window.firebase.initializeApp(config);
          resolve(window.firebase.auth());
        })
        .catch(function () { reject(new Error("Could not load Firebase. Check your connection.")); });
    });
    return firebasePromise;
  }

  var confirmationResult = null;
  var recaptchaVerifier = null;
  var demoLogin = null;

  function firebaseAuthMessage(err) {
    var code = err && err.code;
    if (code === "auth/too-many-requests") return "Too many attempts. Please wait a few minutes and try again.";
    if (code === "auth/invalid-phone-number") return "That mobile number is not valid.";
    if (code === "auth/invalid-verification-code") return "Incorrect OTP. Please try again.";
    if (code === "auth/code-expired") return "That OTP has expired. Request a new one.";
    if (code === "auth/captcha-check-failed") return "The security check failed. Request a new OTP.";
    if (code === "auth/unauthorized-domain") {
      return "This site domain is not allowed in Firebase. Add it under Authentication → Settings → Authorized domains (e.g. real100agro.com, www.real100agro.com, 127.0.0.1).";
    }
    if (code === "auth/operation-not-allowed") {
      return "Phone sign-in is disabled in Firebase. Enable Phone under Authentication → Sign-in method.";
    }
    if (code === "auth/invalid-app-credential" || code === "auth/argument-error") {
      return "Phone verification failed for this domain. On local use http://127.0.0.1:8001 (not localhost) and enable demo OTP, or add the domain in Firebase Authorized domains.";
    }
    return (err && err.message) || "Could not send the OTP. Please try again.";
  }

  function clearRecaptcha() {
    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch (e) { /* ignore */ }
      recaptchaVerifier = null;
    }
    var container = document.getElementById("firebase-recaptcha");
    if (container) container.innerHTML = "";
  }

  function setupRecaptcha(auth) {
    clearRecaptcha();
    var container = document.getElementById("firebase-recaptcha");
    if (!container) {
      container = document.createElement("div");
      container.id = "firebase-recaptcha";
      container.style.display = "none";
      document.body.appendChild(container);
    }
    recaptchaVerifier = new window.firebase.auth.RecaptchaVerifier(container, {
      size: "invisible",
      callback: function () {},
      "expired-callback": function () { clearRecaptcha(); },
    }, auth);
    return recaptchaVerifier.render().then(function () { return recaptchaVerifier; });
  }

  function useDemoOtp(phone10, cfg) {
    demoLogin = { phone: phone10, otp: String((cfg && cfg.demo_otp) || "1234") };
    confirmationResult = null;
    return { demo: true, otp: demoLogin.otp };
  }

  function sendFirebaseOtp(phone10) {
    demoLogin = null;
    return loadFirebase().then(function (auth) {
      var prep = auth.currentUser ? auth.signOut() : Promise.resolve();
      return prep.then(function () { return setupRecaptcha(auth); })
        .then(function (verifier) {
          return auth.signInWithPhoneNumber("+91" + phone10, verifier);
        })
        .then(function (result) {
          confirmationResult = result;
          return { demo: false };
        })
        .catch(function (err) {
          clearRecaptcha();
          throw err;
        });
    });
  }

  function sendOtp(phone10) {
    // Always ask the API whether demo auth is on — Firebase config alone
    // used to force SMS and skip the working local demo path.
    return request("/auth/config/").then(function (cfg) {
      var forceDemo = window.REAL100AGRO_USE_DEMO_AUTH === true;
      var forceFirebase = window.REAL100AGRO_FORCE_FIREBASE === true;
      var demoOk = !!(cfg && cfg.demo_auth);

      if (!forceFirebase && (forceDemo || (demoOk && isLocalHost()))) {
        return useDemoOtp(phone10, cfg);
      }
      if (!firebaseConfig()) {
        if (demoOk) return useDemoOtp(phone10, cfg);
        throw new Error("Phone login needs Firebase. For local testing set ALLOW_DEMO_AUTH=1 on the API.");
      }
      return sendFirebaseOtp(phone10).catch(function (err) {
        // Local fallback when Firebase Phone Auth is blocked (localhost policy).
        if (demoOk && isLocalHost()) {
          return useDemoOtp(phone10, cfg);
        }
        throw new Error(firebaseAuthMessage(err));
      });
    });
  }

  function verifyOtp(code) {
    if (demoLogin) {
      if (String(code).trim() !== demoLogin.otp) {
        return Promise.reject(new Error("Incorrect OTP. The local testing code is " + demoLogin.otp + "."));
      }
      var token = "demo:+91" + demoLogin.phone;
      demoLogin = null;
      return Promise.resolve(token);
    }
    if (!confirmationResult) return Promise.reject(new Error("Request a new OTP first."));
    return confirmationResult.confirm(String(code).trim()).then(function (result) {
      return result.user.getIdToken();
    }).catch(function (err) {
      throw new Error(firebaseAuthMessage(err));
    });
  }

  function signOutFirebase() {
    if (!window.firebase || !window.firebase.apps || !window.firebase.apps.length) return Promise.resolve();
    return window.firebase.auth().signOut().catch(function () {});
  }

  /* ---------- Razorpay Checkout ---------- */
  function openRazorpay(razorpayOrder, order, onSuccess, onFailure) {
    if (!window.REAL100AGRO_RAZORPAY_KEY_ID) {
      onFailure(new Error("Razorpay is not configured yet — pay by COD or add the Razorpay key."));
      return;
    }
    function open() {
      var rz = new window.Razorpay({
        key: window.REAL100AGRO_RAZORPAY_KEY_ID,
        amount: razorpayOrder.amount,
        currency: "INR",
        name: "real100agro",
        description: "Order " + order.order_number,
        order_id: razorpayOrder.id,
        prefill: { contact: "+91" + (order.phone || "") },
        handler: function () { onSuccess(); },
        modal: { ondismiss: function () { onFailure(new Error("Payment was not completed.")); } },
      });
      rz.open();
    }
    if (window.Razorpay) { open(); return; }
    var s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = open;
    s.onerror = function () { onFailure(new Error("Could not load Razorpay checkout.")); };
    document.head.appendChild(s);
  }

  var api = (window.real100agro = window.real100agro || {});
  api.api = {
    base: BASE,
    request: request,
    getToken: getToken,
    setToken: setToken,
    sendOtp: sendOtp,
    verifyOtp: verifyOtp,
    signOutFirebase: signOutFirebase,
    openRazorpay: openRazorpay,
  };
})();
