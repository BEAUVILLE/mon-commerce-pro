// guard.js — DIGIY POS PRO / MON COMMERCE
// Doctrine : PIN une seule fois -> session locale fraîche 8h -> navigation interne directe
// Rail ABOS : digiy_has_module_access_from_abos(phone, "POS") d'abord
// Secours transition : digiy_has_access avec alias POS / COMMERCE
// PRO = coffre sécurisé / PUBLIC = vitrine propre / RPC = pont contrôlé

(function () {
  "use strict";

  const MODULE = "POS";
  const MODULE_LOWER = "pos";
  const MODULE_ALIASES = ["POS", "POS_PRO", "COMMERCE", "CAISSE", "MON_COMMERCE"];
  const SESSION_KEY = "DIGIY_POS_PRO_SESSION_V1";
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

  const SAFE_HOME = "./pin.html";

  const PUBLIC_KEYS_TO_REMOVE = [
    "phone",
    "tel",
    "owner_phone",
    "owner",
    "owner_id",
    "slug",
    "room_slug",
    "pos_slug",
    "market_slug",
    "access",
    "pin",
    "code",
    "session"
  ];

  let bootPromise = null;
  let client = null;
  let currentSession = null;

  function now() {
    return Date.now();
  }

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

  function isSessionFresh(session) {
    if (!session) return false;
    if (!session.phone && !session.slug) return false;
    if (!session.validated_at) return false;

    return now() - Number(session.validated_at) < SESSION_TTL_MS;
  }

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function isSensitiveSlug(slug) {
    return /\d{7,}/.test(String(slug || ""));
  }

  function getStoredSession() {
    try {
      const raw =
        sessionStorage.getItem(SESSION_KEY) ||
        localStorage.getItem(SESSION_KEY);

      if (!raw) return null;

      const session = safeJsonParse(raw);
      return isSessionFresh(session) ? session : null;
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
      validated_at: session.validated_at || now(),
      expires_at: session.expires_at || (now() + SESSION_TTL_MS)
    };

    currentSession = clean;

    try {
      const raw = JSON.stringify(clean);

      localStorage.setItem(SESSION_KEY, raw);
      sessionStorage.setItem(SESSION_KEY, raw);

      if (clean.slug) {
        localStorage.setItem("digiy_pos_slug", clean.slug);
        sessionStorage.setItem("digiy_pos_slug", clean.slug);
      }

      if (clean.phone) {
        sessionStorage.setItem("digiy_pos_phone", clean.phone);

        // On évite de garder le téléphone en clair longtemps dans les clés locales séparées.
        try {
          localStorage.removeItem("digiy_pos_phone");
        } catch (_) {}
      }

      window.DIGIY_POS_HUB_PHONE = clean.phone || "";
      window.DIGIY_ACCESS = Object.assign({}, window.DIGIY_ACCESS || {}, clean);
    } catch (_) {}

    return clean;
  }

  function clearSession() {
    currentSession = null;

    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
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

      const slug = normalizeSlug(url.searchParams.get("slug") || "");
      if (slug && isSensitiveSlug(slug)) {
        url.searchParams.delete("slug");
        changed = true;
      }

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
      "https://wesqmwjjtsefyjnluosj.supabase.co";

    const anon =
      window.DIGIY_SUPABASE_ANON_KEY ||
      window.DIGIY_SUPABASE_ANON ||
      window.SUPABASE_ANON_KEY ||
      "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3";

    if (!window.supabase || !window.supabase.createClient) {
      console.warn("[DIGIY POS GUARD] Supabase CDN absent.");
      return null;
    }

    if (!url || !anon) {
      console.warn("[DIGIY POS GUARD] Config Supabase absente.");
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

    window.sb = client;
    return client;
  }

  function boolFromRpcData(data) {
    const raw = Array.isArray(data) ? data[0] : data;

    if (raw === true) return true;
    if (raw === 1) return true;

    if (typeof raw === "string") {
      const txt = raw.trim().toLowerCase();

      if (txt === "true" || txt === "t" || txt === "1" || txt === "yes" || txt === "ok") {
        return true;
      }

      if (txt.startsWith("(")) {
        const first = txt.replace(/^\(/, "").split(",")[0];
        const token = String(first || "").trim().replace(/^"|"$/g, "").toLowerCase();
        if (token === "t" || token === "true" || token === "1") return true;
      }

      return false;
    }

    if (raw && typeof raw === "object") {
      if (raw.ok === true) return true;
      if (raw.access === true) return true;
      if (raw.access_ok === true) return true;
      if (raw.has_access === true) return true;
      if (raw.allowed === true) return true;
      if (raw.active === true) return true;
      if (raw.is_active === true) return true;
      if (raw.subscribed === true) return true;
      if (raw.valid === true) return true;

      const vals = Object.values(raw);
      if (vals.some((v) => v === true || v === 1 || v === "t" || v === "true")) {
        return true;
      }
    }

    return false;
  }

  async function tryRpc(name, payloads) {
    const sb = getSupabaseClient();

    if (!sb) {
      return {
        ok: false,
        data: null,
        error: "Supabase non prêt"
      };
    }

    for (const payload of payloads) {
      try {
        const { data, error } = await sb.rpc(name, payload);

        if (error) continue;

        return {
          ok: true,
          data,
          payload
        };
      } catch (_) {}
    }

    return {
      ok: false,
      data: null,
      error: "RPC non disponible ou signature différente"
    };
  }

  async function tryRpcBoolean(name, payloads) {
    const sb = getSupabaseClient();

    if (!sb) return false;

    for (const payload of payloads) {
      try {
        const { data, error } = await sb.rpc(name, payload);
        if (error) continue;

        if (boolFromRpcData(data)) {
          return true;
        }
      } catch (_) {}
    }

    return false;
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
    if (!cleanPhone) return false;

    return tryRpcBoolean(
      "digiy_has_module_access_from_abos",
      buildAccessPayloads(cleanPhone)
    );
  }

  async function checkAccessLegacy(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return false;

    return tryRpcBoolean(
      "digiy_has_access",
      buildAccessPayloads(cleanPhone)
    );
  }

  async function checkAccess(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return false;

    // 1. Vérité principale : rail ABOS central.
    const abosOk = await checkAccessFromAbos(cleanPhone);
    if (abosOk) return true;

    // 2. Secours transition : ancien rail.
    const legacyOk = await checkAccessLegacy(cleanPhone);
    if (legacyOk) return true;

    return false;
  }

  async function resolvePhoneBySlug(slug) {
    const cleanSlug = normalizeSlug(slug);
    if (!cleanSlug) return null;

    const rpcRes = await tryRpc("digiy_pos_resolve_phone_by_slug", [
      { p_slug: cleanSlug },
      { slug: cleanSlug },
      { input_slug: cleanSlug }
    ]);

    if (rpcRes.ok && rpcRes.data) {
      if (typeof rpcRes.data === "string") return normalizePhone(rpcRes.data);
      if (rpcRes.data.phone) return normalizePhone(rpcRes.data.phone);
      if (rpcRes.data.owner_phone) return normalizePhone(rpcRes.data.owner_phone);
    }

    const sb = getSupabaseClient();
    if (!sb) return null;

    for (const moduleCode of MODULE_ALIASES) {
      try {
        const { data, error } = await sb
          .from("digiy_subscriptions_public")
          .select("phone,slug,module")
          .eq("slug", cleanSlug)
          .eq("module", moduleCode)
          .limit(1);

        if (!error && Array.isArray(data) && data[0] && data[0].phone) {
          return normalizePhone(data[0].phone);
        }
      } catch (_) {}
    }

    try {
      const { data, error } = await sb
        .from("digiy_subscriptions_public")
        .select("phone,slug,module")
        .eq("slug", cleanSlug)
        .limit(1);

      if (!error && Array.isArray(data) && data[0] && data[0].phone) {
        return normalizePhone(data[0].phone);
      }
    } catch (_) {}

    return null;
  }

  async function resolveSlugByPhone(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return null;

    const sb = getSupabaseClient();
    if (!sb) return null;

    for (const moduleCode of MODULE_ALIASES) {
      try {
        const { data, error } = await sb
          .from("digiy_subscriptions_public")
          .select("phone,slug,module")
          .eq("phone", cleanPhone)
          .eq("module", moduleCode)
          .limit(1);

        if (!error && Array.isArray(data) && data[0] && data[0].slug) {
          return normalizeSlug(data[0].slug);
        }
      } catch (_) {}
    }

    try {
      const { data, error } = await sb
        .from("digiy_subscriptions_public")
        .select("phone,slug,module")
        .eq("phone", cleanPhone)
        .limit(1);

      if (!error && Array.isArray(data) && data[0] && data[0].slug) {
        return normalizeSlug(data[0].slug);
      }
    } catch (_) {}

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
        slug: normalizeSlug(
          params.get("slug") ||
            params.get("pos_slug") ||
            params.get("room_slug") ||
            ""
        )
      };
    } catch (_) {
      return {
        phone: "",
        slug: ""
      };
    }
  }

  function readStorageEntry() {
    try {
      const slug = normalizeSlug(
        sessionStorage.getItem("digiy_pos_slug") ||
          localStorage.getItem("digiy_pos_slug") ||
          ""
      );

      const phone = normalizePhone(
        sessionStorage.getItem("digiy_pos_phone") ||
          window.DIGIY_POS_HUB_PHONE ||
          ""
      );

      return {
        phone,
        slug
      };
    } catch (_) {
      return {
        phone: "",
        slug: ""
      };
    }
  }

  async function absorbUrlSessionIfPossible() {
    const entry = readUrlEntry();

    if (!entry.phone && entry.slug) {
      entry.phone = await resolvePhoneBySlug(entry.slug);
    }

    if (entry.phone && !entry.slug) {
      entry.slug = await resolveSlugByPhone(entry.phone);
    }

    if (!entry.phone) return null;

    const allowed = await checkAccess(entry.phone);
    if (!allowed) return null;

    return saveSession({
      phone: entry.phone,
      slug: entry.slug || null,
      validated_at: now(),
      expires_at: now() + SESSION_TTL_MS
    });
  }

  function normalizeVerifyPayload(payload, fallbackPhone) {
    let current = payload;

    if (Array.isArray(current)) {
      current = current[0] || null;
    }

    if (typeof current === "string") {
      const txt = current.trim();

      if (txt.startsWith("(") && txt.endsWith(")")) {
        const inner = txt.slice(1, -1);
        const parts = inner.split(",");
        const first = String(parts[0] || "").trim().toLowerCase();
        const phone = String(parts[2] || "").replace(/[^\d]/g, "");

        if (first === "t" || first === "true" || first === "1") {
          return {
            ok: true,
            phone: normalizePhone(phone || fallbackPhone)
          };
        }
      }

      try {
        current = JSON.parse(txt);
      } catch (_) {
        return null;
      }
    }

    if (current === true) {
      return {
        ok: true,
        phone: normalizePhone(fallbackPhone)
      };
    }

    if (current && typeof current === "object") {
      if (
        current.ok === true ||
        current.success === true ||
        current.valid === true ||
        current.is_valid === true ||
        current.allowed === true ||
        current.access === true ||
        current.access_ok === true
      ) {
        return {
          ok: true,
          phone: normalizePhone(current.phone || current.p_phone || fallbackPhone),
          slug: normalizeSlug(current.slug || current.pos_slug || current.owner_slug || "")
        };
      }

      const vals = Object.values(current);
      if (vals.length >= 3) {
        const okLike =
          vals[0] === true ||
          vals[0] === "t" ||
          vals[0] === "true" ||
          vals[0] === 1;

        if (okLike) {
          return {
            ok: true,
            phone: normalizePhone(vals[2] || fallbackPhone),
            slug: ""
          };
        }
      }
    }

    return null;
  }

  async function verifyPin(phone, pin) {
    const cleanPhone = normalizePhone(phone);
    const cleanPin = String(pin || "").trim().replace(/\s+/g, "");

    if (!cleanPhone || !cleanPin) {
      return {
        ok: false,
        message: "Téléphone ou code manquant."
      };
    }

    const posRes = await tryRpc("digiy_pos_verify_pin", [
      { p_phone: cleanPhone, p_pin: cleanPin },
      { phone: cleanPhone, pin: cleanPin },
      { input_phone: cleanPhone, input_pin: cleanPin }
    ]);

    let parsed = posRes.ok ? normalizeVerifyPayload(posRes.data, cleanPhone) : null;

    if (!parsed?.ok) {
      const genericRes = await tryRpc("digiy_verify_pin", [
        { p_phone: cleanPhone, p_module: MODULE, p_pin: cleanPin },
        { p_phone: cleanPhone, p_module: MODULE_LOWER, p_pin: cleanPin }
      ]);

      parsed = genericRes.ok ? normalizeVerifyPayload(genericRes.data, cleanPhone) : null;
    }

    if (!parsed?.ok) {
      return {
        ok: false,
        message: "Code incorrect ou accès non actif."
      };
    }

    const finalPhone = normalizePhone(parsed.phone || cleanPhone);

    let slug = normalizeSlug(parsed.slug || "");

    if (!slug) {
      slug = await resolveSlugByPhone(finalPhone);
    }

    const accessOk = await checkAccess(finalPhone);
    if (!accessOk) {
      return {
        ok: false,
        message: "Abonnement POS / Mon commerce inactif."
      };
    }

    const session = saveSession({
      phone: finalPhone,
      slug,
      role: "owner",
      validated_at: now(),
      expires_at: now() + SESSION_TTL_MS
    });

    cleanSensitiveUrl();

    return {
      ok: true,
      session
    };
  }

  async function loginWithPin(slug, pin) {
    const cleanSlug = normalizeSlug(slug);
    const cleanPin = String(pin || "").trim().replace(/\s+/g, "");

    if (!cleanSlug) {
      return {
        ok: false,
        message: "Identifiant manquant."
      };
    }

    if (!cleanPin) {
      return {
        ok: false,
        message: "Code manquant."
      };
    }

    const phone = await resolvePhoneBySlug(cleanSlug);

    if (!phone) {
      return {
        ok: false,
        message: "Identifiant introuvable. Vérifie ton lien pro."
      };
    }

    return verifyPin(phone, cleanPin);
  }

  async function boot() {
    setPageState("loading");
    cleanSensitiveUrl();

    const stored = getStoredSession();

    if (stored) {
      currentSession = stored;
      cleanSensitiveUrl();
      setPageState("ready");

      return {
        ok: true,
        session: stored,
        source: "storage"
      };
    }

    const absorbed = await absorbUrlSessionIfPossible();

    if (absorbed) {
      cleanSensitiveUrl();
      setPageState("ready");

      return {
        ok: true,
        session: absorbed,
        source: "url"
      };
    }

    const fallback = readStorageEntry();

    if (fallback.phone) {
      const allowed = await checkAccess(fallback.phone);

      if (allowed) {
        const session = saveSession({
          phone: fallback.phone,
          slug: fallback.slug || null,
          validated_at: now(),
          expires_at: now() + SESSION_TTL_MS
        });

        cleanSensitiveUrl();
        setPageState("ready");

        return {
          ok: true,
          session,
          source: "local_identity"
        };
      }
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
    return String(path || "./").trim();
  }

  function logout(to = SAFE_HOME) {
    clearSession();
    window.location.href = to;
  }

  window.DIGIY_GUARD = {
    VERSION: "pos-guard-abos-central-v1-20260522",
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

    getSb() {
      return getSupabaseClient();
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    ready();
  });
})();
