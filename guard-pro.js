// guard.js — DIGIY POS / MON COMMERCE
// Doctrine : lire le contexte, le mémoriser, nettoyer l’URL, ouvrir une session locale 8h.
// Pas de watcher DOM. Pas de téléphone visible. Pas de slug d’un autre module.

(function () {
  "use strict";

  const MODULE = "POS";
  const PUBLIC_NAME = "Mon commerce";
  const SAFE_HOME = "./pin.html";
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

  const MODULE_ALIASES = [
    "POS",
    "pos",
    "POS_PRO",
    "COMMERCE",
    "CAISSE",
    "MON_COMMERCE"
  ];

  const SESSION_KEYS = [
    "DIGIY_POS_PRO_SESSION_V1",
    "DIGIY_POS_PIN_SESSION",
    "DIGIY_POS_SESSION",
    "DIGIY_PIN_SESSION",
    "DIGIY_ACCESS",
    "DIGIY_SESSION_POS",
    "digiy_pos_session"
  ];

  const SLUG_KEYS = [
    "digiy_pos_slug",
    "digiy_pos_last_slug"
  ];

  const PHONE_KEYS = [
    "digiy_pos_phone",
    "digiy_pos_last_phone"
  ];

  const ALLOWED_SLUG_PREFIXES = [
    "pos-",
    "commerce-",
    "mon-commerce-",
    "caisse-"
  ];

  const FORBIDDEN_SLUG_PREFIXES = [
    "loc-",
    "explore-",
    "driver-",
    "market-",
    "build-",
    "jobs-",
    "resa-",
    "pay-"
  ];

  const SENSITIVE_URL_KEYS = [
    "phone",
    "tel",
    "wa",
    "whatsapp",
    "owner_phone",
    "subscription_phone",
    "checkout_phone",
    "p_phone",
    "pin",
    "pin4",
    "code",
    "token",
    "session",
    "session_token",
    "module",
    "access",
    "owner",
    "owner_id"
  ];

  let client = null;
  let bootPromise = null;

  const state = {
    module: MODULE,
    publicName: PUBLIC_NAME,
    access_ok: false,
    access: false,
    ok: false,
    slug: "",
    phone: "",
    reason: "init",
    source: "",
    validated_at: "",
    ts: 0
  };

  function now() {
    return Date.now();
  }

  function normalizePhone(value) {
    return String(value || "").replace(/[^\d]/g, "").slice(0, 15);
  }

  function normalizeSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function isAllowedModule(value) {
    const raw = String(value || "").trim().toUpperCase();
    if (!raw) return true;
    return MODULE_ALIASES.some((m) => String(m).toUpperCase() === raw);
  }

  function isForbiddenSlug(value) {
    const slug = normalizeSlug(value);
    if (!slug) return false;
    return FORBIDDEN_SLUG_PREFIXES.some((prefix) => slug.startsWith(prefix));
  }

  function isPosSlug(value) {
    const slug = normalizeSlug(value);
    if (!slug) return false;
    if (isForbiddenSlug(slug)) return false;
    return ALLOWED_SLUG_PREFIXES.some((prefix) => slug.startsWith(prefix));
  }

  function parseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function parseDateMs(value) {
    if (!value) return 0;

    if (typeof value === "number" && Number.isFinite(value)) {
      return value < 100000000000 ? value * 1000 : value;
    }

    const s = String(value).trim();
    if (!s) return 0;

    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return n < 100000000000 ? n * 1000 : n;
    }

    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }

  function isFresh(session) {
    if (!session || typeof session !== "object") return false;
    if (!session.phone && !session.slug) return false;

    const t =
      parseDateMs(session.ts) ||
      parseDateMs(session.verified_at) ||
      parseDateMs(session.validated_at) ||
      parseDateMs(session.validated_at_ms);

    if (!t) return false;

    return now() - t <= SESSION_TTL_MS;
  }

  function storageGet(key) {
    try {
      const s = sessionStorage.getItem(key);
      if (s) return s;
    } catch (_) {}

    try {
      const l = localStorage.getItem(key);
      if (l) return l;
    } catch (_) {}

    return "";
  }

  function storageSet(key, value, localToo) {
    const v = String(value || "").trim();
    if (!v) return;

    try {
      sessionStorage.setItem(key, v);
    } catch (_) {}

    if (localToo !== false) {
      try {
        localStorage.setItem(key, v);
      } catch (_) {}
    }
  }

  function storageRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}

    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function normalizeSession(raw, source) {
    const obj = raw && typeof raw === "object" ? raw : {};
    const moduleName = obj.module || obj.module_code || MODULE;
    const slug = normalizeSlug(obj.slug || obj.pos_slug || "");
    const phone = normalizePhone(obj.phone || obj.p_phone || obj.owner_phone || "");

    if (moduleName && !isAllowedModule(moduleName)) return null;
    if (slug && !isPosSlug(slug)) return null;

    const access = !!(
      obj.access === true ||
      obj.access_ok === true ||
      obj.ok === true ||
      obj.valid === true ||
      obj.verified === true ||
      obj.has_access === true ||
      obj.allowed === true
    );

    const t =
      parseDateMs(obj.ts) ||
      parseDateMs(obj.verified_at) ||
      parseDateMs(obj.validated_at) ||
      now();

    return {
      module: MODULE,
      public_name: PUBLIC_NAME,
      phone,
      slug,
      role: obj.role || "owner",
      access,
      access_ok: access,
      ok: access,
      verified: access,
      validated_at: obj.validated_at || new Date(t).toISOString(),
      verified_at: t,
      ts: t,
      source: source || obj.source || "unknown"
    };
  }

  function purgeWrongModuleData() {
    SLUG_KEYS.forEach((key) => {
      const value = normalizeSlug(storageGet(key));
      if (value && !isPosSlug(value)) storageRemove(key);
    });

    SESSION_KEYS.forEach((key) => {
      const raw = storageGet(key);
      const data = parseJson(raw);
      if (!data || typeof data !== "object") return;

      const moduleName = data.module || data.module_code || "";
      const slug = normalizeSlug(data.slug || data.pos_slug || "");

      if ((moduleName && !isAllowedModule(moduleName)) || (slug && !isPosSlug(slug))) {
        storageRemove(key);
      }
    });
  }

  function getStoredSession() {
    purgeWrongModuleData();

    for (const key of SESSION_KEYS) {
      const raw = storageGet(key);
      if (!raw) continue;

      const parsed = parseJson(raw);
      const session = normalizeSession(parsed, "storage");

      if (session && session.access && isFresh(session)) {
        return session;
      }
    }

    return null;
  }

  function readStoredIdentity() {
    purgeWrongModuleData();

    let slug = "";
    let phone = "";

    for (const key of SLUG_KEYS) {
      const v = normalizeSlug(storageGet(key));
      if (v && isPosSlug(v)) {
        slug = v;
        break;
      }
    }

    for (const key of PHONE_KEYS) {
      const v = normalizePhone(storageGet(key));
      if (v) {
        phone = v;
        break;
      }
    }

    return { slug, phone };
  }

  function setState(next) {
    Object.assign(state, next || {});

    state.access_ok = !!state.access_ok || !!state.access || !!state.ok;
    state.access = !!state.access_ok;
    state.ok = !!state.access_ok;

    try {
      document.documentElement.dataset.digiyGuard = state.access_ok ? "ready" : "locked";
      if (document.body) {
        document.body.dataset.digiyGuard = state.access_ok ? "ready" : "locked";
      }
    } catch (_) {}

    return state;
  }

  function saveSession(input, source) {
    const clean = normalizeSession(
      {
        ...input,
        module: MODULE,
        access: true,
        access_ok: true,
        ok: true,
        verified: true,
        ts: input?.ts || now(),
        validated_at: input?.validated_at || new Date().toISOString()
      },
      source || "save"
    );

    if (!clean) {
      throw new Error("Session MON COMMERCE refusée");
    }

    const raw = JSON.stringify(clean);

    SESSION_KEYS.forEach((key) => {
      storageSet(key, raw, true);
    });

    if (clean.slug) {
      SLUG_KEYS.forEach((key) => storageSet(key, clean.slug, true));
    }

    if (clean.phone) {
      PHONE_KEYS.forEach((key) => storageSet(key, clean.phone, false));
    }

    setState({
      ...clean,
      reason: "session_ok",
      source: source || clean.source || "save"
    });

    return clean;
  }

  function clearSession() {
    SESSION_KEYS.forEach(storageRemove);
    setState({
      access_ok: false,
      access: false,
      ok: false,
      reason: "logged_out",
      source: "logout"
    });
  }

  function readUrlContext() {
    try {
      const u = new URL(location.href);

      const slug = normalizeSlug(
        u.searchParams.get("slug") ||
          u.searchParams.get("pos_slug") ||
          u.searchParams.get("commerce") ||
          ""
      );

      const phone = normalizePhone(
        u.searchParams.get("phone") ||
          u.searchParams.get("tel") ||
          u.searchParams.get("owner_phone") ||
          u.searchParams.get("subscription_phone") ||
          u.searchParams.get("checkout_phone") ||
          u.searchParams.get("p_phone") ||
          ""
      );

      return {
        slug: slug && isPosSlug(slug) ? slug : "",
        phone
      };
    } catch (_) {
      return { slug: "", phone: "" };
    }
  }

  function cleanSensitiveUrl() {
    try {
      const u = new URL(location.href);
      let changed = false;

      SENSITIVE_URL_KEYS.forEach((key) => {
        if (u.searchParams.has(key)) {
          u.searchParams.delete(key);
          changed = true;
        }
      });

      ["slug", "pos_slug", "commerce"].forEach((key) => {
        const value = normalizeSlug(u.searchParams.get(key) || "");
        if (u.searchParams.has(key) && (!value || isPosSlug(value) || isForbiddenSlug(value))) {
          u.searchParams.delete(key);
          changed = true;
        }
      });

      if (changed) {
        history.replaceState({}, document.title, u.pathname + u.search + u.hash);
      }
    } catch (_) {}
  }

  function rememberIdentity(identity) {
    const slug = normalizeSlug(identity?.slug || "");
    const phone = normalizePhone(identity?.phone || "");

    if (slug && isPosSlug(slug)) {
      SLUG_KEYS.forEach((key) => storageSet(key, slug, true));
    }

    if (phone) {
      PHONE_KEYS.forEach((key) => storageSet(key, phone, false));
    }

    setState({
      slug: slug || state.slug || "",
      phone: phone || state.phone || "",
      source: identity?.source || state.source || "identity",
      reason: state.reason || "identity_saved"
    });
  }

  function getSb() {
    if (client) return client;

    const url =
      window.DIGIY_SUPABASE_URL ||
      window.SUPABASE_URL ||
      "https://wesqmwjjtsefyjnluosj.supabase.co";

    const key =
      window.DIGIY_SUPABASE_ANON_KEY ||
      window.DIGIY_SUPABASE_ANON ||
      window.SUPABASE_ANON_KEY ||
      "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3";

    if (!window.supabase || !window.supabase.createClient || !url || !key) {
      return null;
    }

    client = window.supabase.createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          "x-digiy-module": MODULE
        }
      }
    });

    return client;
  }

  async function tryRpc(name, payloads) {
    const sb = getSb();
    if (!sb) return { ok: false, error: "supabase_not_ready" };

    for (const payload of payloads || []) {
      try {
        const { data, error } = await sb.rpc(name, payload);
        if (!error) return { ok: true, data };
      } catch (_) {}
    }

    return { ok: false, error: "rpc_failed" };
  }

  function truthyResult(data) {
    if (data === true) return true;
    if (!data || typeof data !== "object") return false;

    return !!(
      data.ok === true ||
      data.valid === true ||
      data.allowed === true ||
      data.access === true ||
      data.access_ok === true ||
      data.has_access === true ||
      data.active === true
    );
  }

  async function checkAccess(phone) {
    const p = normalizePhone(phone);
    if (!p) return false;

    const payloads = [];
    MODULE_ALIASES.forEach((moduleCode) => {
      payloads.push({ p_phone: p, p_module: moduleCode });
      payloads.push({ phone: p, module: moduleCode });
      payloads.push({ input_phone: p, input_module: moduleCode });
    });

    const res = await tryRpc("digiy_has_access", payloads);
    return res.ok && truthyResult(res.data);
  }

  async function resolvePhoneBySlug(slug) {
    const s = normalizeSlug(slug);
    if (!s || !isPosSlug(s)) return "";

    const rpcRes = await tryRpc("digiy_pos_resolve_phone_by_slug", [
      { p_slug: s },
      { slug: s },
      { input_slug: s }
    ]);

    if (rpcRes.ok && rpcRes.data) {
      if (typeof rpcRes.data === "string") return normalizePhone(rpcRes.data);
      if (rpcRes.data.phone) return normalizePhone(rpcRes.data.phone);
      if (rpcRes.data.owner_phone) return normalizePhone(rpcRes.data.owner_phone);
    }

    const sb = getSb();
    if (!sb) return "";

    for (const moduleCode of MODULE_ALIASES) {
      try {
        const { data, error } = await sb
          .from("digiy_subscriptions_public")
          .select("phone,slug,module")
          .eq("slug", s)
          .eq("module", moduleCode)
          .limit(1)
          .maybeSingle();

        if (!error && data && isAllowedModule(data.module) && isPosSlug(data.slug)) {
          return normalizePhone(data.phone || "");
        }
      } catch (_) {}
    }

    return "";
  }

  async function resolveSlugByPhone(phone) {
    const p = normalizePhone(phone);
    if (!p) return "";

    const sb = getSb();
    if (!sb) return "";

    for (const moduleCode of MODULE_ALIASES) {
      try {
        const { data, error } = await sb
          .from("digiy_subscriptions_public")
          .select("phone,slug,module")
          .eq("phone", p)
          .eq("module", moduleCode)
          .limit(1)
          .maybeSingle();

        if (!error && data && isAllowedModule(data.module)) {
          const slug = normalizeSlug(data.slug || "");
          return slug && isPosSlug(slug) ? slug : "";
        }
      } catch (_) {}
    }

    return "";
  }

  function parseVerifyResult(raw, fallback) {
    const data = Array.isArray(raw) ? raw[0] : raw;

    if (data === true) {
      return {
        ok: true,
        phone: fallback.phone || "",
        slug: fallback.slug || ""
      };
    }

    if (!data || typeof data !== "object") return null;

    if (!truthyResult(data)) return null;

    const moduleName = data.module || data.p_module || MODULE;
    const slug = normalizeSlug(data.slug || data.pos_slug || fallback.slug || "");
    const phone = normalizePhone(data.phone || data.p_phone || fallback.phone || "");

    if (moduleName && !isAllowedModule(moduleName)) return null;
    if (slug && !isPosSlug(slug)) return null;

    return { ok: true, phone, slug };
  }

  async function verifyPin(phone, pin, slug) {
    const p = normalizePhone(phone);
    const s = normalizeSlug(slug || "");
    const code = String(pin || "").trim().replace(/\s+/g, "");

    if (!p || !code) {
      return { ok: false, message: "Téléphone ou code manquant." };
    }

    let res = await tryRpc("digiy_pos_verify_pin", [
      { p_phone: p, p_pin: code },
      { phone: p, pin: code },
      { input_phone: p, input_pin: code }
    ]);

    let parsed = res.ok ? parseVerifyResult(res.data, { phone: p, slug: s }) : null;

    if (!parsed) {
      res = await tryRpc("digiy_verify_pin", [
        { p_phone: p, p_module: MODULE, p_pin: code },
        { phone: p, module: MODULE, pin: code },
        { input_phone: p, input_module: MODULE, input_pin: code }
      ]);

      parsed = res.ok ? parseVerifyResult(res.data, { phone: p, slug: s }) : null;
    }

    if (!parsed || !parsed.ok) {
      return { ok: false, message: "Code refusé ou accès non actif." };
    }

    let finalSlug = parsed.slug || s;
    const finalPhone = parsed.phone || p;

    if (!finalSlug) finalSlug = await resolveSlugByPhone(finalPhone);
    if (finalSlug && !isPosSlug(finalSlug)) {
      return { ok: false, message: "Identifiant non compatible MON COMMERCE." };
    }

    const session = saveSession(
      {
        phone: finalPhone,
        slug: finalSlug,
        role: "owner"
      },
      "pin"
    );

    cleanSensitiveUrl();

    return { ok: true, session };
  }

  async function loginWithPin(slug, pin) {
    const s = normalizeSlug(slug);
    if (!s || !isPosSlug(s)) {
      return { ok: false, message: "Identifiant MON COMMERCE invalide." };
    }

    const phone = await resolvePhoneBySlug(s);
    if (!phone) return { ok: false, message: "Compte introuvable." };

    return verifyPin(phone, pin, s);
  }

  async function boot(options) {
    const opts = options || {};
    setState({ reason: "loading", source: "boot" });

    const fromUrl = readUrlContext();

    if (fromUrl.slug || fromUrl.phone) {
      rememberIdentity({ ...fromUrl, source: "url" });
    }

    cleanSensitiveUrl();

    const stored = getStoredSession();

    if (stored && stored.access && isFresh(stored)) {
      setState({
        ...stored,
        access_ok: true,
        access: true,
        ok: true,
        reason: "session_ready",
        source: stored.source || "storage"
      });

      return { ok: true, session: { ...state }, source: "storage" };
    }

    const identity = {
      ...readStoredIdentity(),
      ...fromUrl
    };

    if (identity.slug && !identity.phone) {
      identity.phone = await resolvePhoneBySlug(identity.slug);
    }

    if (identity.phone && !identity.slug) {
      identity.slug = await resolveSlugByPhone(identity.phone);
    }

    rememberIdentity({
      ...identity,
      source: identity.phone || identity.slug ? "identity" : "none"
    });

    if (opts.require_access === true && identity.phone) {
      const allowed = await checkAccess(identity.phone);

      if (allowed) {
        const session = saveSession(
          {
            phone: identity.phone,
            slug: identity.slug || "",
            role: "owner"
          },
          "access_check"
        );

        return { ok: true, session, source: "access_check" };
      }
    }

    setState({
      access_ok: false,
      access: false,
      ok: false,
      reason: identity.phone || identity.slug ? "identity_known_pin_needed" : "pin_needed",
      source: identity.phone || identity.slug ? "identity" : "none"
    });

    if (opts.redirect === true) {
      location.href = opts.to || SAFE_HOME;
    }

    return {
      ok: false,
      session: null,
      source: state.source,
      reason: state.reason
    };
  }

  function ready(options) {
    const opts = options || {};

    if (!bootPromise || opts.force === true) {
      bootPromise = boot(opts);
    }

    return bootPromise;
  }

  async function requireSession(options) {
    const opts = options || {};
    const result = await ready(opts);

    if (result.ok && result.session) return result.session;

    if (opts.redirect !== false) {
      location.href = opts.to || SAFE_HOME;
    }

    return null;
  }

  function getSession() {
    const stored = getStoredSession();

    if (stored) {
      setState({
        ...stored,
        access_ok: true,
        access: true,
        ok: true,
        reason: "session_ready",
        source: stored.source || "storage"
      });

      return { ...state };
    }

    return { ...state };
  }

  function buildInternalUrl(path) {
    try {
      const u = new URL(path || "./", location.href);
      SENSITIVE_URL_KEYS.forEach((key) => u.searchParams.delete(key));
      ["slug", "pos_slug", "commerce"].forEach((key) => u.searchParams.delete(key));
      return u.pathname + u.search + u.hash;
    } catch (_) {
      return String(path || "./");
    }
  }

  function logout(to) {
    clearSession();
    location.href = to || SAFE_HOME;
  }

  window.DIGIY_GUARD = {
    module: MODULE,
    publicName: PUBLIC_NAME,
    state,

    ready,
    boot: ready,
    requireSession,
    getSession,
    getSb,

    verifyPin,
    loginWithPin,
    checkAccess,
    resolvePhoneBySlug,
    resolveSlugByPhone,

    rememberIdentity,
    cleanSensitiveUrl,
    buildInternalUrl,
    logout
  };

  document.addEventListener("DOMContentLoaded", function () {
    ready({ redirect: false, preserve_validation: true, allow_soft_session: true });
  });
})();
