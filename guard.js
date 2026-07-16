// guard.js — DIGIY POS PRO / MON COMMERCE
// Garde stricte : seule une session créée après validation réelle du PIN est acceptée.

(function () {
  "use strict";

  const MODULE = "POS";
  const MODULE_LOWER = "pos";
  const MODULE_ALIASES = ["POS", "POS_PRO", "COMMERCE", "CAISSE", "MON_COMMERCE"];
  const SESSION_KEY = "DIGIY_POS_PRO_SESSION_V1";
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  const CLOCK_SKEW_MS = 60 * 1000;
  const SAFE_HOME = "./pin.html";

  const PUBLIC_KEYS_TO_REMOVE = [
    "phone", "tel", "owner_phone", "owner", "owner_id",
    "slug", "room_slug", "pos_slug", "market_slug",
    "access", "auth", "ok", "unlocked", "pin_ok", "digiy_pin_ok",
    "expires", "until", "exp", "expiresAt",
    "pin", "code", "session", "session_token", "token"
  ];

  let bootPromise = null;
  let client = null;
  let currentSession = null;

  const now = () => Date.now();

  function normalizePhone(value) {
    const digits = String(value || "").replace(/[^\d]/g, "");
    if (!digits) return "";
    if (digits.startsWith("221") && digits.length === 12) return digits;
    if (digits.length === 9) return "221" + digits;
    return digits;
  }

  function normalizeSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "");
  }

  function safeJsonParse(raw) {
    try { return JSON.parse(raw); }
    catch (_) { return null; }
  }

  function isSessionFresh(session) {
    if (!session || typeof session !== "object") return false;

    const moduleCode = String(session.module || "").trim().toUpperCase();
    const phone = normalizePhone(session.phone || "");
    const validatedAt = Number(session.validated_at || 0);
    const expiresAt = Number(session.expires_at || 0);
    const current = now();
    const accessOk = session.access === true || session.access_ok === true;

    if (!MODULE_ALIASES.includes(moduleCode)) return false;
    if (!phone || phone.length < 9) return false;
    if (!accessOk || !validatedAt || !expiresAt) return false;
    if (validatedAt > current + CLOCK_SKEW_MS) return false;
    if (current - validatedAt >= SESSION_TTL_MS) return false;
    if (expiresAt <= current) return false;
    if (expiresAt > validatedAt + SESSION_TTL_MS + CLOCK_SKEW_MS) return false;

    return true;
  }

  function getStoredSession() {
    try {
      const candidates = [
        safeJsonParse(sessionStorage.getItem(SESSION_KEY) || ""),
        safeJsonParse(localStorage.getItem(SESSION_KEY) || "")
      ];
      return candidates.find(isSessionFresh) || null;
    } catch (_) {
      return null;
    }
  }

  function saveSession(session) {
    const clean = {
      module: MODULE,
      public_name: "Mon commerce",
      phone: normalizePhone(session.phone),
      slug: normalizeSlug(session.slug || ""),
      role: session.role || "owner",
      access: true,
      access_ok: true,
      validated_at: Number(session.validated_at || now()),
      expires_at: Number(session.expires_at || (now() + SESSION_TTL_MS))
    };

    if (!isSessionFresh(clean)) return null;

    currentSession = clean;
    try {
      const raw = JSON.stringify(clean);
      localStorage.setItem(SESSION_KEY, raw);
      sessionStorage.setItem(SESSION_KEY, raw);

      if (clean.slug) {
        localStorage.setItem("digiy_pos_slug", clean.slug);
        sessionStorage.setItem("digiy_pos_slug", clean.slug);
      }

      sessionStorage.setItem("digiy_pos_phone", clean.phone);
      localStorage.removeItem("digiy_pos_phone");
      window.DIGIY_POS_HUB_PHONE = clean.phone;
      window.DIGIY_ACCESS = Object.assign({}, window.DIGIY_ACCESS || {}, clean);
    } catch (_) {}

    return clean;
  }

  function clearSession() {
    currentSession = null;
    try {
      [localStorage, sessionStorage].forEach((store) => {
        store.removeItem(SESSION_KEY);
        [
          "digiy_pin_session_v1", "digiy_pin_until", "digiy_pos_pin_until",
          "digiy_access_until", "digiy_pro_access_until", "digiy_pay_access_until",
          "digiy_session_until", "digiy_access_expires_at", "digiy_expires_at",
          "digiy_pin_expires_at", "DIGIY_PIN_UNTIL", "DIGIY_ACCESS_UNTIL",
          "digiy_pin_ok", "digiy_pos_pin_ok", "digiy_access_ok",
          "digiy_pro_access_ok", "digiy_pay_access_ok", "digiy_cockpit_access_ok",
          "digiy_session_ok", "digiy_access_session", "digiy_pos_session",
          "DIGIY_ACCESS_GRANTED", "DIGIY_PIN_OK", "SESSION_KEY"
        ].forEach((key) => store.removeItem(key));
      });
      sessionStorage.removeItem("digiy_pos_phone");
      delete window.DIGIY_POS_HUB_PHONE;
    } catch (_) {}
  }

  function cleanSensitiveUrl() {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      PUBLIC_KEYS_TO_REMOVE.forEach((key) => {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });
      if (changed) {
        const cleanUrl = url.pathname +
          (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") +
          url.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (_) {}
  }

  function setPageState(state) {
    try {
      document.documentElement.dataset.digiyGuard = state;
      if (document.body) document.body.dataset.digiyGuard = state;
    } catch (_) {}
  }

  function getSupabaseClient() {
    if (client) return client;

    const url = window.DIGIY_SUPABASE_URL || window.SUPABASE_URL ||
      "https://wesqmwjjtsefyjnluosj.supabase.co";
    const anon = window.DIGIY_SUPABASE_ANON_KEY || window.DIGIY_SUPABASE_ANON ||
      window.SUPABASE_ANON_KEY || "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3";

    if (!window.supabase || !window.supabase.createClient || !url || !anon) return null;

    client = window.supabase.createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { "x-digiy-module": MODULE } }
    });
    window.sb = client;
    return client;
  }

  function boolFromRpcData(data) {
    const raw = Array.isArray(data) ? data[0] : data;
    if (raw === true || raw === 1) return true;
    if (typeof raw === "string") {
      const txt = raw.trim().toLowerCase();
      if (["true", "t", "1", "yes", "ok"].includes(txt)) return true;
      if (txt.startsWith("(")) {
        const token = String(txt.replace(/^\(/, "").split(",")[0] || "").trim().replace(/^"|"$/g, "");
        return ["t", "true", "1"].includes(token);
      }
      return false;
    }
    if (raw && typeof raw === "object") {
      if (["ok", "access", "access_ok", "has_access", "allowed", "active", "is_active", "subscribed", "valid"].some((k) => raw[k] === true)) return true;
      return Object.values(raw).some((v) => v === true || v === 1 || v === "t" || v === "true");
    }
    return false;
  }

  async function tryRpc(name, payloads) {
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, data: null };
    for (const payload of payloads) {
      try {
        const { data, error } = await sb.rpc(name, payload);
        if (!error) return { ok: true, data, payload };
      } catch (_) {}
    }
    return { ok: false, data: null };
  }

  async function tryRpcBoolean(name, payloads) {
    const result = await tryRpc(name, payloads);
    return result.ok && boolFromRpcData(result.data);
  }

  function buildAccessPayloads(phone) {
    const cleanPhone = normalizePhone(phone);
    const payloads = [];
    MODULE_ALIASES.forEach((moduleCode) => {
      payloads.push({ p_phone: cleanPhone, p_module: moduleCode });
      payloads.push({ phone: cleanPhone, module: moduleCode });
      payloads.push({ input_phone: cleanPhone, input_module: moduleCode });
    });
    payloads.push({ p_phone: cleanPhone, p_module: MODULE_LOWER });
    payloads.push({ phone: cleanPhone, module: MODULE_LOWER });
    return payloads;
  }

  async function checkAccessFromAbos(phone) {
    const cleanPhone = normalizePhone(phone);
    return cleanPhone ? tryRpcBoolean("digiy_has_module_access_from_abos", buildAccessPayloads(cleanPhone)) : false;
  }

  async function checkAccessLegacy(phone) {
    const cleanPhone = normalizePhone(phone);
    return cleanPhone ? tryRpcBoolean("digiy_has_access", buildAccessPayloads(cleanPhone)) : false;
  }

  async function checkAccess(phone) {
    return (await checkAccessFromAbos(phone)) || (await checkAccessLegacy(phone));
  }

  async function resolvePhoneBySlug(slug) {
    const cleanSlug = normalizeSlug(slug);
    if (!cleanSlug) return null;

    const rpcRes = await tryRpc("digiy_pos_resolve_phone_by_slug", [
      { p_slug: cleanSlug }, { slug: cleanSlug }, { input_slug: cleanSlug }
    ]);
    if (rpcRes.ok && rpcRes.data) {
      if (typeof rpcRes.data === "string") return normalizePhone(rpcRes.data);
      if (rpcRes.data.phone) return normalizePhone(rpcRes.data.phone);
      if (rpcRes.data.owner_phone) return normalizePhone(rpcRes.data.owner_phone);
    }

    const sb = getSupabaseClient();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from("digiy_subscriptions_public")
        .select("phone,slug,module").eq("slug", cleanSlug).limit(1);
      if (!error && Array.isArray(data) && data[0]?.phone) return normalizePhone(data[0].phone);
    } catch (_) {}
    return null;
  }

  async function resolveSlugByPhone(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return null;
    const sb = getSupabaseClient();
    if (!sb) return null;
    try {
      const { data, error } = await sb.from("digiy_subscriptions_public")
        .select("phone,slug,module").eq("phone", cleanPhone).limit(1);
      if (!error && Array.isArray(data) && data[0]?.slug) return normalizeSlug(data[0].slug);
    } catch (_) {}
    return null;
  }

  function normalizeVerifyPayload(payload, fallbackPhone) {
    let current = Array.isArray(payload) ? payload[0] : payload;

    if (typeof current === "string") {
      const txt = current.trim();
      if (txt.startsWith("(") && txt.endsWith(")")) {
        const parts = txt.slice(1, -1).split(",");
        if (["t", "true", "1"].includes(String(parts[0] || "").trim().toLowerCase())) {
          return { ok: true, phone: normalizePhone(parts[2] || fallbackPhone), slug: normalizeSlug(parts[1] || "") };
        }
      }
      try { current = JSON.parse(txt); }
      catch (_) { return null; }
    }

    if (current === true) return { ok: true, phone: normalizePhone(fallbackPhone), slug: "" };
    if (current && typeof current === "object") {
      const ok = current.ok === true || current.success === true || current.valid === true ||
        current.is_valid === true || current.allowed === true || current.access === true || current.access_ok === true;
      if (ok) {
        return {
          ok: true,
          phone: normalizePhone(current.phone || current.p_phone || fallbackPhone),
          slug: normalizeSlug(current.slug || current.pos_slug || current.owner_slug || "")
        };
      }
    }
    return null;
  }

  async function verifyPin(phone, pin) {
    const cleanPhone = normalizePhone(phone);
    const cleanPin = String(pin || "").trim().replace(/\s+/g, "");
    if (!cleanPhone || !cleanPin) return { ok: false, message: "Téléphone ou code manquant." };

    const posRes = await tryRpc("digiy_pos_verify_pin", [
      { p_phone: cleanPhone, p_pin: cleanPin },
      { phone: cleanPhone, pin: cleanPin },
      { input_phone: cleanPhone, input_pin: cleanPin }
    ]);
    let parsed = posRes.ok ? normalizeVerifyPayload(posRes.data, cleanPhone) : null;

    if (!parsed?.ok) {
      const payloads = [];
      MODULE_ALIASES.forEach((moduleCode) => {
        payloads.push({ p_phone: cleanPhone, p_module: moduleCode, p_pin: cleanPin });
        payloads.push({ phone: cleanPhone, module: moduleCode, pin: cleanPin });
      });
      const genericRes = await tryRpc("digiy_verify_pin", payloads);
      parsed = genericRes.ok ? normalizeVerifyPayload(genericRes.data, cleanPhone) : null;
    }

    if (!parsed?.ok) return { ok: false, message: "Code incorrect ou accès non actif." };

    const finalPhone = normalizePhone(parsed.phone || cleanPhone);
    if (!(await checkAccess(finalPhone))) return { ok: false, message: "Abonnement POS / Mon commerce inactif." };

    const slug = normalizeSlug(parsed.slug || "") || await resolveSlugByPhone(finalPhone) || "";
    const session = saveSession({
      phone: finalPhone, slug, role: "owner",
      validated_at: now(), expires_at: now() + SESSION_TTL_MS
    });
    cleanSensitiveUrl();
    return session ? { ok: true, session } : { ok: false, message: "Session invalide." };
  }

  async function loginWithPin(slug, pin) {
    const cleanSlug = normalizeSlug(slug);
    const cleanPin = String(pin || "").trim().replace(/\s+/g, "");
    if (!cleanSlug) return { ok: false, message: "Identifiant manquant." };
    if (!cleanPin) return { ok: false, message: "Code manquant." };
    const phone = await resolvePhoneBySlug(cleanSlug);
    if (!phone) return { ok: false, message: "Identifiant introuvable." };
    return verifyPin(phone, cleanPin);
  }

  async function boot() {
    setPageState("loading");
    cleanSensitiveUrl();

    const stored = getStoredSession();
    if (stored) {
      currentSession = stored;
      window.DIGIY_POS_HUB_PHONE = stored.phone || "";
      window.DIGIY_ACCESS = Object.assign({}, window.DIGIY_ACCESS || {}, stored);
      setPageState("ready");
      return { ok: true, session: stored, source: "verified_pin_session" };
    }

    clearSession();
    setPageState("locked");
    return { ok: false, session: null, message: "Session PIN absente ou expirée." };
  }

  function ready() {
    if (!bootPromise) bootPromise = boot();
    return bootPromise;
  }

  async function requireSession(options = {}) {
    const result = await ready();
    if (result.ok && result.session) return result.session;
    if (options.redirect !== false) window.location.replace(options.to || SAFE_HOME);
    return null;
  }

  function getSession() {
    if (currentSession && isSessionFresh(currentSession)) return currentSession;
    const stored = getStoredSession();
    if (stored) currentSession = stored;
    return stored;
  }

  function buildInternalUrl(path) {
    return String(path || "./").trim();
  }

  function logout(to = SAFE_HOME) {
    clearSession();
    window.location.replace(to);
  }

  window.DIGIY_GUARD = {
    VERSION: "pos-guard-strict-pin-session-v2-20260716",
    module: MODULE,
    publicName: "Mon commerce",
    ready,
    requireSession,
    getSession,
    verifyPin,
    loginWithPin,
    checkAccess,
    checkAccessFromAbos,
    checkAccessLegacy,
    resolvePhoneBySlug,
    resolveSlugByPhone,
    logout,
    buildInternalUrl,
    cleanSensitiveUrl,
    getSb: getSupabaseClient
  };

  document.addEventListener("DOMContentLoaded", ready);
})();