// guard.js — DIGIY POS PRO / MON COMMERCE
// Doctrine : PIN une seule fois -> session locale fraîche 8h -> navigation interne directe
// PRO = coffre sécurisé / PUBLIC = vitrine propre / RPC = pont contrôlé

(function () {
  "use strict";

  const MODULE = "POS";
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
    const raw = String(value || "").trim();
    const cleaned = raw.replace(/[^\d+]/g, "");
    const digits = cleaned.replace(/[^\d]/g, "");

    if (!digits) return "";
    return cleaned.startsWith("+") ? `+${digits}` : digits;
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

  function isSessionFresh(session) {
    if (!session) return false;
    if (!session.phone && !session.slug) return false;
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
      public_name: "Mon commerce",
      phone: normalizePhone(session.phone),
      slug: normalizeSlug(session.slug || ""),
      role: session.role || "owner",
      validated_at: session.validated_at || now()
    };

    currentSession = clean;

    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(clean));
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(clean));

      if (clean.slug) {
        localStorage.setItem("digiy_pos_slug", clean.slug);
        sessionStorage.setItem("digiy_pos_slug", clean.slug);
      }

      if (clean.phone) {
        localStorage.setItem("digiy_pos_phone", clean.phone);
        sessionStorage.setItem("digiy_pos_phone", clean.phone);
      }
    } catch (_) {}

    return clean;
  }

  function clearSession() {
    currentSession = null;

    try {
      localStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_KEY);
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

    return client;
  }

  async function tryRpc(name, payloads) {
    const sb = getSupabaseClient();

    if (!sb) {
      return {
        ok: false,
        error: "Supabase non prêt"
      };
    }

    for (const payload of payloads) {
      try {
        const { data, error } = await sb.rpc(name, payload);

        if (!error) {
          return {
            ok: true,
            data
          };
        }
      } catch (_) {}
    }

    return {
      ok: false,
      error: "RPC non disponible ou signature différente"
    };
  }

  async function checkAccess(phone) {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return false;

    const payloads = [];

    MODULE_ALIASES.forEach((moduleCode) => {
      payloads.push({ p_phone: cleanPhone, p_module: moduleCode });
      payloads.push({ phone: cleanPhone, module: moduleCode });
      payloads.push({ input_phone: cleanPhone, input_module: moduleCode });
    });

    const res = await tryRpc("digiy_has_access", payloads);

    if (!res.ok) return false;

    if (res.data === true) return true;
    if (res.data && res.data.ok === true) return true;
    if (res.data && res.data.has_access === true) return true;
    if (res.data && res.data.active === true) return true;
    if (res.data && res.data.access === true) return true;
    if (res.data && res.data.allowed === true) return true;
    if (res.data && res.data.valid === true) return true;

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
          localStorage.getItem("digiy_pos_phone") ||
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
      validated_at: now()
    });
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

    const res = await tryRpc("digiy_pos_verify_pin", [
      { p_phone: cleanPhone, p_pin: cleanPin },
      { phone: cleanPhone, pin: cleanPin },
      { input_phone: cleanPhone, input_pin: cleanPin }
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

    let slug = data.slug || data.pos_slug || null;

    if (!slug) {
      slug = await resolveSlugByPhone(data.phone || cleanPhone);
    }

    const session = saveSession({
      phone: data.phone || cleanPhone,
      slug,
      role: data.role || "owner",
      validated_at: now()
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
          validated_at: now()
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
    module: MODULE,
    publicName: "Mon commerce",

    ready,
    requireSession,
    getSession,

    verifyPin,
    loginWithPin,
    checkAccess,

    resolvePhoneBySlug,
    resolveSlugByPhone,

    logout,
    buildInternalUrl,
    cleanSensitiveUrl
  };

  document.addEventListener("DOMContentLoaded", function () {
    ready();
  });
})();
