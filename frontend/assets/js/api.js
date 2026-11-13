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
     Uses Identity Toolkit REST + Google reCAPTCHA (not the Firebase Auth
     JS RecaptchaVerifier, which was throwing auth/invalid-api-key on this
     domain even when the browser key itself was valid).
     Local/dev: ALLOW_DEMO_AUTH=1 on the API enables OTP 1234. */
  var DEFAULT_FIREBASE_API_KEY = "AIzaSyAvRobkSXCsNFOdogIFwKuN95nLOQIkXoI";

  function isLocalHost() {
    var host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "";
  }

  var demoLogin = null;
  var phoneSession = null; // { apiKey, sessionInfo, phoneE164 }
  var grecaptchaPromise = null;
  var grecaptchaWidgetId = null;

  function identityErrorMessage(payload, fallback) {
    var msg = (payload && payload.error && payload.error.message) || fallback || "Could not send the OTP.";
    msg = String(msg);
    if (/TOO_MANY_ATTEMPTS|QUOTA/i.test(msg)) return "Too many attempts. Please wait a few minutes and try again.";
    if (/INVALID_PHONE_NUMBER/i.test(msg)) return "That mobile number is not valid.";
    if (/INVALID_CODE|SESSION_EXPIRED/i.test(msg)) return "Incorrect or expired OTP. Request a new one.";
    if (/CAPTCHA|RECAPTCHA/i.test(msg)) return "Security check failed. Refresh the page and try again.";
    if (/API_KEY|API key/i.test(msg)) {
      return "Firebase API key blocked. In Google Cloud → Credentials, set API restrictions to include Identity Toolkit API (or Don't restrict key), then Save.";
    }
    if (/OPERATION_NOT_ALLOWED/i.test(msg)) {
      return "Phone sign-in is disabled in Firebase. Enable Phone under Authentication → Sign-in method, and allow India in SMS region policy.";
    }
    return msg;
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute("data-loaded") === "1") return res();
        existing.addEventListener("load", function () { res(); });
        existing.addEventListener("error", function () { rej(new Error("Could not load script")); });
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { s.setAttribute("data-loaded", "1"); res(); };
      s.onerror = function () { rej(new Error("Could not load script")); };
      document.head.appendChild(s);
    });
  }

  function ensureGrecaptcha() {
    if (window.grecaptcha && window.grecaptcha.render) {
      return Promise.resolve(window.grecaptcha);
    }
    if (grecaptchaPromise) return grecaptchaPromise;
    grecaptchaPromise = new Promise(function (resolve, reject) {
      window.__real100agroRecaptchaReady = function () {
        resolve(window.grecaptcha);
      };
      loadScript("https://www.google.com/recaptcha/api.js?onload=__real100agroRecaptchaReady&render=explicit")
        .catch(reject);
    });
    return grecaptchaPromise;
  }

  function getRecaptchaToken(siteKey) {
    return ensureGrecaptcha().then(function (grecaptcha) {
      return new Promise(function (resolve, reject) {
        var container = document.getElementById("firebase-recaptcha");
        if (!container) {
          container = document.createElement("div");
          container.id = "firebase-recaptcha";
          container.style.position = "fixed";
          container.style.left = "-9999px";
          container.style.bottom = "0";
          document.body.appendChild(container);
        }
        function run() {
          try {
            if (grecaptchaWidgetId == null) {
              grecaptchaWidgetId = grecaptcha.render(container, {
                sitekey: siteKey,
                size: "invisible",
                callback: function (token) { resolve(token); },
                "error-callback": function () { reject(new Error("Security check failed. Refresh and try again.")); },
                "expired-callback": function () { reject(new Error("Security check expired. Try again.")); },
              });
            } else {
              grecaptcha.reset(grecaptchaWidgetId);
            }
            var out = grecaptcha.execute(grecaptchaWidgetId);
            if (out && typeof out.then === "function") {
              out.then(resolve).catch(reject);
            }
          } catch (err) {
            reject(err);
          }
        }
        if (grecaptcha.ready) grecaptcha.ready(run);
        else run();
      });
    });
  }

  function useDemoOtp(phone10, cfg) {
    demoLogin = { phone: phone10, otp: String((cfg && cfg.demo_otp) || "1234") };
    phoneSession = null;
    return { demo: true, otp: demoLogin.otp };
  }

  function sendFirebaseOtp(phone10, apiKey) {
    demoLogin = null;
    var key = apiKey || DEFAULT_FIREBASE_API_KEY;
    return fetch("https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=" + encodeURIComponent(key), {
      method: "GET",
      credentials: "omit",
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) throw new Error(identityErrorMessage(data, "Could not start phone verification."));
        if (!data.recaptchaSiteKey) throw new Error("Firebase reCAPTCHA is not available for this API key.");
        return data.recaptchaSiteKey;
      });
    }).then(function (siteKey) {
      return getRecaptchaToken(siteKey);
    }).then(function (recaptchaToken) {
      return fetch("https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=" + encodeURIComponent(key), {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: "+91" + phone10,
          recaptchaToken: recaptchaToken,
        }),
      }).then(function (resp) {
        return resp.json().then(function (data) {
          if (!resp.ok) throw new Error(identityErrorMessage(data, "Could not send the OTP."));
          if (!data.sessionInfo) throw new Error("OTP session was not created. Try again.");
          phoneSession = { apiKey: key, sessionInfo: data.sessionInfo, phoneE164: "+91" + phone10 };
          return { demo: false };
        });
      });
    });
  }

  function sendOtp(phone10) {
    return request("/auth/config/").then(function (cfg) {
      var forceDemo = window.REAL100AGRO_USE_DEMO_AUTH === true;
      var forceFirebase = window.REAL100AGRO_FORCE_FIREBASE === true;
      var demoOk = !!(cfg && cfg.demo_auth);
      var apiKey = (cfg && cfg.firebase_web_api_key) || DEFAULT_FIREBASE_API_KEY;

      if (!forceFirebase && (forceDemo || (demoOk && isLocalHost()))) {
        return useDemoOtp(phone10, cfg);
      }
      if (!apiKey) {
        if (demoOk) return useDemoOtp(phone10, cfg);
        throw new Error("Phone login needs Firebase. For local testing set ALLOW_DEMO_AUTH=1 on the API.");
      }
      return sendFirebaseOtp(phone10, apiKey).catch(function (err) {
        if (demoOk && isLocalHost()) return useDemoOtp(phone10, cfg);
        throw err instanceof Error ? err : new Error(String(err && err.message || err));
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
    if (!phoneSession || !phoneSession.sessionInfo) {
      return Promise.reject(new Error("Request a new OTP first."));
    }
    return fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=" +
        encodeURIComponent(phoneSession.apiKey),
      {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionInfo: phoneSession.sessionInfo,
          code: String(code).trim(),
        }),
      }
    ).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) throw new Error(identityErrorMessage(data, "Incorrect OTP. Try again."));
        if (!data.idToken) throw new Error("Login token missing. Request a new OTP.");
        phoneSession = null;
        return data.idToken;
      });
    });
  }

  function signOutFirebase() {
    phoneSession = null;
    demoLogin = null;
    return Promise.resolve();
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
