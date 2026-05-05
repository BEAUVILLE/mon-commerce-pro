<!-- guard.js — DIGIY MARKET PRO -->
<script>
(function () {
  "use strict";

  const MODULE = "MARKET";
  const SESSION_KEY = "DIGIY_MARKET_PRO_SESSION_V1";
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

  const SAFE_HOME = "./pin.html";
  const PUBLIC_KEYS_TO_REMOVE = [
    "phone",
    "tel",
    "owner_phone",
    "owner",
    "slug",
    "room_slug",
    "market_slug",
    "access",
    "pin"
  ];

  let bootPromise = null;
  let client = null;
  let currentSession = null;

  function now() {
    return Date.now();
  }

  function normalizePhone(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/^00/, "+");
  }

  function isSessionFresh(session) {
    if (!session) return false;
    if (!session.phone) return false;
    if (!session.validated_at) return false;
    return now() - Number(session.validated_at) < SESSION_TTL_MS;
  }

  function getStoredSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      return isSessionFresh(session) ? session : null;
    } catch (_) {
      return null;
    }
  }

  function saveSession(session) {
    const clean = {
      module: MODULE,
      phone: normalizePhone(session.phone),
      slug: session.slug || null,
      role: session.role || "owner",
      validated_at: session.validated_at || now()
    };

    currentSession = clean;

    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(clean));
    } catch (_) {}

    return clean;
  }

  function clearSession() {
    currentSession = null;
    try {
      localStorage.removeItem(SESSION_KEY);
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
        const cleanUrl =
          url.pathname +
          (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") +
          url.hash;

        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (_) {}
  }

  function setPageState(state) {
    try {
      document.documentElement.dataset.digiyGuard = state;
      document.body.dataset.digiyGuard = state;
    } catch (_) {}
  }

  function getSupabaseClient() {
    if (client) return client;

    const url =
      window.DIGIY_SUPABASE_URL ||
      window.SUPABASE_URL ||
      "";

    const anon =
      window.DIGIY_SUPABASE_ANON_KEY ||
      window.SUPABASE_ANON_KEY ||
      "";

    if (!window.supabase || !window.supabase.createClient) {
      console.warn("[DIGIY GUARD] Supabase CDN absent.");
      return null;
    }

    if (!url || !anon) {
      console.warn("[DIGIY GUARD] Config Supabase absente.");
      return null;
    }

    client = window.supabase.createClient(url, anon, {
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
    const sb = getSupabaseClient();
    if (!sb) return { ok: false, error: "Supabase non prêt" };

    for (const payload of payloads) {
      try {
        const { data, error } = await sb.rpc(name, payload);
        if (!error) return { ok: true, data };
      } catch (_) {}
    }

    return { ok: false, error: "RPC non disponible ou signature différente" };
  }

  async function checkAccess(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return false;

    const res = await tryRpc("digiy_has_access", [
      { p_phone: cleanPhone, p_module: MODULE },
      { phone: cleanPhone, module: MODULE },
      { input_phone: cleanPhone, input_module: MODULE }
    ]);

    if (!res.ok) return false;

    if (res.data === true) return true;
    if (res.data && res.data.ok === true) return true;
    if (res.data && res.data.has_access === true) return true;
    if (res.data && res.data.active === true) return true;

    return false;
  }

  async function resolvePhoneBySlug(slug) {
    const cleanSlug = String(slug || "").trim();
    if (!cleanSlug) return null;

    const res = await tryRpc("digiy_market_resolve_phone_by_slug", [
      { p_slug: cleanSlug },
      { slug: cleanSlug },
      { input_slug: cleanSlug }
    ]);

    if (!res.ok || !res.data) return null;

    if (typeof res.data === "string") return normalizePhone(res.data);
    if (res.data.phone) return normalizePhone(res.data.phone);
    if (res.data.owner_phone) return normalizePhone(res.data.owner_phone);

    return null;
  }

  function readUrlEntry() {
    try {
      const params = new URLSearchParams(window.location.search);
      return {
        phone: normalizePhone(
          params.get("phone") ||
          params.get("tel") ||
          params.get("owner_phone") ||
          ""
        ),
        slug:
          params.get("slug") ||
          params.get("market_slug") ||
          params.get("room_slug") ||
          ""
      };
    } catch (_) {
      return { phone: "", slug: "" };
    }
  }

  async function absorbUrlSessionIfPossible() {
    const entry = readUrlEntry();

    if (!entry.phone && entry.slug) {
      entry.phone = await resolvePhoneBySlug(entry.slug);
    }

    if (!entry.phone) return null;

    const allowed = await checkAccess(entry.phone);
    if (!allowed) return null;

    return saveSession({
      phone: entry.phone,
      slug: entry.slug || null,
      validated_at: now()
    });
  }

  async function verifyPin(phone, pin) {
    const cleanPhone = normalizePhone(phone);
    const cleanPin = String(pin || "").trim();

    if (!cleanPhone || !cleanPin) {
      return {
        ok: false,
        message: "Téléphone ou code manquant."
      };
    }

    const res = await tryRpc("digiy_verify_pin", [
      { p_phone: cleanPhone, p_pin: cleanPin, p_module: MODULE },
      { phone: cleanPhone, pin: cleanPin, module: MODULE },
      { input_phone: cleanPhone, input_pin: cleanPin, input_module: MODULE },
      { p_phone: cleanPhone, p_code: cleanPin, p_module: MODULE }
    ]);

    if (!res.ok) {
      return {
        ok: false,
        message: "Impossible de vérifier l’accès pour le moment."
      };
    }

    const data = res.data || {};
    const success =
      data === true ||
      data.ok === true ||
      data.valid === true ||
      data.allowed === true ||
      data.access === true;

    if (!success) {
      return {
        ok: false,
        message: data.message || "Code incorrect ou accès non actif."
      };
    }

    const session = saveSession({
      phone: data.phone || cleanPhone,
      slug: data.slug || data.market_slug || null,
      role: data.role || "owner",
      validated_at: now()
    });

    cleanSensitiveUrl();

    return {
      ok: true,
      session
    };
  }

  async function boot() {
    setPageState("loading");

    cleanSensitiveUrl();

    const stored = getStoredSession();
    if (stored) {
      currentSession = stored;
      setPageState("ready");
      return {
        ok: true,
        session: stored,
        source: "storage"
      };
    }

    const absorbed = await absorbUrlSessionIfPossible();

    cleanSensitiveUrl();

    if (absorbed) {
      setPageState("ready");
      return {
        ok: true,
        session: absorbed,
        source: "url"
      };
    }

    setPageState("locked");

    return {
      ok: false,
      session: null,
      message: "Accès non ouvert."
    };
  }

  function ready() {
    if (!bootPromise) bootPromise = boot();
    return bootPromise;
  }

  async function requireSession(options = {}) {
    const result = await ready();

    if (result.ok && result.session) {
      return result.session;
    }

    if (options.redirect !== false) {
      window.location.href = options.to || SAFE_HOME;
      return null;
    }

    return null;
  }

  function getSession() {
    if (currentSession && isSessionFresh(currentSession)) {
      return currentSession;
    }

    const stored = getStoredSession();
    if (stored) {
      currentSession = stored;
      return stored;
    }

    return null;
  }

  function buildInternalUrl(path) {
    const cleanPath = String(path || "./").trim();
    return cleanPath;
  }

  function logout(to = SAFE_HOME) {
    clearSession();
    window.location.href = to;
  }

  window.DIGIY_GUARD = {
    module: MODULE,
    ready,
    requireSession,
    getSession,
    verifyPin,
    checkAccess,
    logout,
    buildInternalUrl,
    cleanSensitiveUrl
  };

  document.addEventListener("DOMContentLoaded", function () {
    ready();
  });
})();
</script>
