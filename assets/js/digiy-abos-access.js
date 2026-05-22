/* ============================================================
   DIGIYLYFE · POS / MON COMMERCE · ABOS ACCESS BRIDGE
   À poser dans : assets/js/digiy-abos-access.js

   Nom technique : POS
   Nom visible terrain : MON COMMERCE

   Rôle :
   - Préparer MON COMMERCE au rail commun ABOS / PAY / ADMIN.
   - Lire l’accès module via :
     public.digiy_has_module_access_from_abos(phone, module)

   Important :
   - POS est encore à cadrer dans le rail.
   - Ne pas bloquer MON COMMERCE avec protect() tant que le plan n’est pas actif.
   ============================================================ */

(function () {
  "use strict";

  const DEFAULT_SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const DEFAULT_SUPABASE_KEY = "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3";

  const STORAGE_PREFIX = "DIGIY_ABOS_ACCESS";
  const DEFAULT_TTL_MS = 10 * 60 * 1000;

  function cleanPhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function upperModule(value) {
    return String(value || "").trim().toUpperCase();
  }

  function readQuery(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (_) {
      return null;
    }
  }

  function readStorage(keys) {
    for (const key of keys) {
      try {
        const v = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (v) return v;
      } catch (_) {}
    }
    return "";
  }

  function guessPhone() {
    return cleanPhone(
      readQuery("phone") ||
        readQuery("tel") ||
        readQuery("p") ||
        readStorage([
          "DIGIY_PHONE",
          "DIGIY_LAST_PHONE",
          "DIGIY_SESSION_PHONE",
          "DIGIY_POS_PHONE",
          "DIGIY_POS_SESSION_PHONE",
          "DIGIY_POS_LAST_PHONE",
          "DIGIY_COMMERCE_PHONE",
          "DIGIY_COMMERCE_LAST_PHONE",
          "DIGIY_MARKET_PHONE",
          "DIGIY_PAY_PHONE"
        ])
    );
  }

  function guessModule(options) {
    const opts = options || {};
    const raw =
      opts.module ||
      readQuery("abos_module") ||
      readQuery("module") ||
      window.DIGIY_ABOS_MODULE ||
      window.DIGIY_MODULE ||
      "POS";

    const module = upperModule(raw);

    if (module === "COMMERCE") return "POS";
    if (module === "MON_COMMERCE") return "POS";
    return module;
  }

  function cacheKey(phone, module) {
    return `${STORAGE_PREFIX}:${upperModule(module)}:${cleanPhone(phone)}`;
  }

  function getCached(phone, module, ttlMs) {
    try {
      const raw = localStorage.getItem(cacheKey(phone, module));
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.saved_at) return null;
      if (Date.now() - parsed.saved_at > ttlMs) return null;

      return parsed;
    } catch (_) {
      return null;
    }
  }

  function setCached(phone, module, payload) {
    try {
      localStorage.setItem(
        cacheKey(phone, module),
        JSON.stringify({
          ...payload,
          saved_at: Date.now()
        })
      );
    } catch (_) {}
  }

  function savePhone(phone, module) {
    const p = cleanPhone(phone);
    const m = upperModule(module);
    if (!p) return;

    try {
      localStorage.setItem("DIGIY_LAST_PHONE", p);
      localStorage.setItem(`DIGIY_${m}_PHONE`, p);

      if (m === "POS") {
        localStorage.setItem("DIGIY_POS_PHONE", p);
        localStorage.setItem("DIGIY_POS_LAST_PHONE", p);
        localStorage.setItem("DIGIY_COMMERCE_PHONE", p);
        localStorage.setItem("DIGIY_COMMERCE_LAST_PHONE", p);
      }
    } catch (_) {}
  }

  function ensureSupabase(url, key) {
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("SUPABASE_JS_NOT_LOADED");
    }

    return window.supabase.createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }

  async function checkAccess(options) {
    const opts = options || {};
    const module = guessModule(opts);
    const phone = cleanPhone(opts.phone || guessPhone());
    const ttlMs = Number(opts.ttlMs || DEFAULT_TTL_MS);

    if (!module) {
      return {
        ok: false,
        has_access: false,
        error: "MODULE_REQUIRED"
      };
    }

    if (!phone) {
      return {
        ok: false,
        has_access: false,
        error: "PHONE_REQUIRED",
        module
      };
    }

    savePhone(phone, module);

    if (opts.useCache !== false) {
      const cached = getCached(phone, module, ttlMs);
      if (cached) return { ...cached, from_cache: true };
    }

    const url =
      opts.supabaseUrl ||
      window.DIGIY_SUPABASE_URL ||
      DEFAULT_SUPABASE_URL;

    const key =
      opts.supabaseKey ||
      window.DIGIY_SUPABASE_KEY ||
      window.DIGIY_SUPABASE_ANON_KEY ||
      window.DIGIY_SUPABASE_ANON ||
      DEFAULT_SUPABASE_KEY;

    const sb = ensureSupabase(url, key);

    const { data, error } = await sb.rpc("digiy_has_module_access_from_abos", {
      p_phone: phone,
      p_module: module
    });

    if (error) {
      return {
        ok: false,
        has_access: false,
        error: error.message || "SUPABASE_RPC_ERROR",
        phone,
        module
      };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const hasAccess = !!(row && row.has_access === true);

    const payload = {
      ok: true,
      has_access: hasAccess,
      phone,
      module,
      plan: row ? row.plan : null,
      fiche_title: row ? row.fiche_title : null,
      expires_at: row ? row.expires_at : null,
      module_rights: row ? row.module_rights : []
    };

    setCached(phone, module, payload);
    return payload;
  }

  function buildDeniedUrl(options) {
    const opts = options || {};
    const module = guessModule(opts);
    const phone = cleanPhone(opts.phone || guessPhone());
    const base =
      opts.payUrl ||
      opts.deniedUrl ||
      window.DIGIY_LOGIN_URL ||
      "./pin.html";

    try {
      const url = new URL(base, window.location.href);
      if (phone) url.searchParams.set("phone", phone);
      if (module) url.searchParams.set("module", module);
      url.searchParams.set("reason", opts.reason || "abos_required");
      return url.toString();
    } catch (_) {
      return base;
    }
  }

  async function protect(options) {
    const opts = options || {};
    const result = await checkAccess(opts);

    if (result.ok && result.has_access) {
      if (typeof opts.onAllowed === "function") opts.onAllowed(result);
      return result;
    }

    if (typeof opts.onDenied === "function") {
      opts.onDenied(result);
      return result;
    }

    if (opts.redirect !== false) {
      window.location.href = buildDeniedUrl({
        ...opts,
        reason: result.error || "abos_required"
      });
    }

    return result;
  }

  function renderAccessBadge(target, result) {
    const el = typeof target === "string" ? document.querySelector(target) : target;
    if (!el || !result) return;

    if (result.has_access) {
      el.innerHTML = `
        <strong>✅ Accès MON COMMERCE actif</strong><br>
        ${result.fiche_title || "MON COMMERCE · DIGIY"}<br>
        <small>Expire : ${result.expires_at || "date suivie par DIGIY"}</small>
      `;
    } else {
      el.innerHTML = `
        <strong>🔒 MON COMMERCE à cadrer</strong><br>
        <small>Le pont ABOS est prêt. PAY garde la preuve, ADMIN validera quand le plan commerce sera actif.</small>
      `;
    }
  }

  window.DIGIY_ABOS_ACCESS = {
    checkAccess,
    protect,
    renderAccessBadge,
    guessPhone,
    cleanPhone,
    upperModule
  };
})();
