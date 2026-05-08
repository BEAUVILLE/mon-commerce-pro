// guard.js — DIGIY POS PRO / MON COMMERCE
// Version blindée : POS strict, anti LOC / EXPLORE, session 8h, PIN une seule fois.
// Ne touche PAS aux articles, ventes, notes, marchandises.

(() => {
  "use strict";

  const CFG = {
    SUPABASE_URL:
      window.DIGIY_SUPABASE_URL ||
      "https://wesqmwjjtsefyjnluosj.supabase.co",

    SUPABASE_ANON_KEY:
      window.DIGIY_SUPABASE_ANON ||
      window.DIGIY_SUPABASE_ANON_KEY ||
      "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3",

    MODULE_CODE: "POS",
    MODULE_CODE_LOWER: "pos",

    ALLOWED_MODULES: [
      "POS",
      "pos",
      "POS_PRO",
      "COMMERCE",
      "CAISSE",
      "MON_COMMERCE"
    ],

    ALLOWED_SLUG_PREFIXES: [
      "pos-",
      "commerce-",
      "caisse-"
    ],

    FORBIDDEN_SLUG_PREFIXES: [
      "loc-",
      "explore-",
      "driver-",
      "market-",
      "build-",
      "jobs-",
      "resa-",
      "pay-"
    ],

    SESSION_MAX_AGE_MS: 8 * 60 * 60 * 1000,

    PIN_PATH: window.DIGIY_LOGIN_URL || "./pin.html",
    PAY_URL: window.DIGIY_PAY_URL || "https://commencer-a-payer.digiylyfe.com/",

    ALLOW_PREVIEW_WITHOUT_IDENTITY: false,

    STORAGE: {
      SESSION_KEYS: [
        "DIGIY_POS_PIN_SESSION",
        "DIGIY_PIN_SESSION",
        "DIGIY_ACCESS",
        "DIGIY_SESSION_POS",
        "digiy_pos_session"
      ],
      SLUG_KEY: "digiy_pos_slug",
      PHONE_KEY: "digiy_pos_phone",
      LAST_SLUG_KEY: "digiy_pos_last_slug",
      LAST_PHONE_KEY: "digiy_pos_last_phone"
    },

    RPC: {
      VERIFY_PIN: "digiy_pos_verify_pin",
      HAS_ACCESS: "digiy_has_access"
    },

    TABLES: {
      SUBSCRIPTIONS_PUBLIC: "digiy_subscriptions_public"
    },

    URL: {
      KEEP_PHONE_IN_URL: false
    }
  };

  const MODULE = CFG.MODULE_CODE;

  const initialQs = new URLSearchParams(location.search);
  const slugQ = initialQs.get("slug") || "";
  const phoneQ =
    initialQs.get("phone") ||
    initialQs.get("tel") ||
    initialQs.get("owner_phone") ||
    "";

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function normSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function normPhone(value) {
    const raw = String(value || "").trim();
    const cleaned = raw.replace(/[^\d+]/g, "");
    const digits = cleaned.replace(/[^\d]/g, "");
    if (!digits) return "";
    return cleaned.startsWith("+") ? `+${digits}` : digits;
  }

  function normPin(value) {
    return String(value || "").trim().replace(/\s+/g, "");
  }

  function upper(value) {
    return String(value || "").trim().toUpperCase();
  }

  function nowMs() {
    return Date.now();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isRecent(ts) {
    const n = Number(ts || 0);
    if (!n) return false;
    return nowMs() - n <= CFG.SESSION_MAX_AGE_MS;
  }

  function isAllowedModule(moduleName) {
    const raw = String(moduleName || "").trim();
    if (!raw) return false;

    return CFG.ALLOWED_MODULES.some((m) => {
      return String(m).trim().toUpperCase() === raw.toUpperCase();
    });
  }

  function isForbiddenSlug(slug) {
    const s = normSlug(slug);
    if (!s) return false;
    return CFG.FORBIDDEN_SLUG_PREFIXES.some((p) => s.startsWith(p));
  }

  function isAllowedSlug(slug) {
    const s = normSlug(slug);
    if (!s) return false;
    if (isForbiddenSlug(s)) return false;
    return CFG.ALLOWED_SLUG_PREFIXES.some((p) => s.startsWith(p));
  }

  function hidePage() {
    try {
      document.documentElement.style.visibility = "hidden";
    } catch (_) {}
  }

  function showPage() {
    try {
      document.documentElement.style.visibility = "";
    } catch (_) {}
  }

  function jsonHeaders() {
    return {
      apikey: CFG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  function getHeaders() {
    return {
      apikey: CFG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      Accept: "application/json"
    };
  }

  async function rpc(name, body) {
    const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify(body || {})
    });

    const data = await res.json().catch(() => null);

    return {
      ok: res.ok,
      status: res.status,
      data
    };
  }

  async function tableGet(table, paramsObj) {
    const params = new URLSearchParams(paramsObj || {});

    const res = await fetch(
      `${CFG.SUPABASE_URL}/rest/v1/${table}?${params.toString()}`,
      {
        method: "GET",
        headers: getHeaders()
      }
    );

    const data = await res.json().catch(() => null);

    return {
      ok: res.ok,
      status: res.status,
      data
    };
  }

  function buildSafeUrl(base, params) {
    const baseStr = (base == null ? "" : String(base)).trim();
    if (!baseStr) return location.href;

    let u;

    try {
      if (/^https?:\/\//i.test(baseStr)) {
        u = new URL(baseStr);
      } else {
        const origin = location.protocol + "//" + location.host;
        const full = baseStr.startsWith("/")
          ? origin + baseStr
          : origin + "/" + baseStr;

        u = new URL(full);
      }
    } catch (e) {
      console.warn("[DIGIY GUARD POS] buildSafeUrl KO:", baseStr, e.message);
      return baseStr;
    }

    try {
      Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== null && v !== undefined && String(v) !== "") {
          u.searchParams.set(k, String(v));
        }
      });
    } catch (_) {}

    return u.toString();
  }

  function cleanSensitiveUrl(options = {}) {
    const removeSlug = options.removeSlug === true;

    try {
      const url = new URL(location.href);
      let changed = false;

      const keys = [
        "phone",
        "tel",
        "owner_phone",
        "owner",
        "owner_id",
        "access",
        "pin",
        "code",
        "session"
      ];

      if (removeSlug) {
        keys.push("slug", "room_slug", "pos_slug", "market_slug");
      }

      keys.forEach((key) => {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });

      if (changed) {
        const clean =
          url.pathname +
          (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") +
          url.hash;

        history.replaceState({}, document.title, clean);
      }
    } catch (_) {}
  }

  function clearSessionsOnly() {
    for (const key of CFG.STORAGE.SESSION_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}

      try {
        sessionStorage.removeItem(key);
      } catch (_) {}
    }
  }

  function clearIdentityOnly() {
    try {
      localStorage.removeItem(CFG.STORAGE.SLUG_KEY);
      localStorage.removeItem(CFG.STORAGE.PHONE_KEY);
      localStorage.removeItem(CFG.STORAGE.LAST_SLUG_KEY);
      localStorage.removeItem(CFG.STORAGE.LAST_PHONE_KEY);
      sessionStorage.removeItem(CFG.STORAGE.SLUG_KEY);
      sessionStorage.removeItem(CFG.STORAGE.PHONE_KEY);
      sessionStorage.removeItem(CFG.STORAGE.LAST_SLUG_KEY);
      sessionStorage.removeItem(CFG.STORAGE.LAST_PHONE_KEY);
    } catch (_) {}
  }

  function clearAllAccessState() {
    clearSessionsOnly();
    clearIdentityOnly();
  }

  function purgeBadPosIdentity() {
    let dirty = false;

    try {
      const keys = [
        CFG.STORAGE.SLUG_KEY,
        CFG.STORAGE.LAST_SLUG_KEY
      ];

      for (const key of keys) {
        const local = normSlug(localStorage.getItem(key) || "");
        const sess = normSlug(sessionStorage.getItem(key) || "");

        if (local && !isAllowedSlug(local)) {
          localStorage.removeItem(key);
          dirty = true;
        }

        if (sess && !isAllowedSlug(sess)) {
          sessionStorage.removeItem(key);
          dirty = true;
        }
      }
    } catch (_) {}

    for (const key of CFG.STORAGE.SESSION_KEYS) {
      try {
        const local = safeJsonParse(localStorage.getItem(key));
        if (local && typeof local === "object") {
          const moduleName = local.module || local.module_code || "";
          const slug = normSlug(local.slug || "");

          if (
            (moduleName && !isAllowedModule(moduleName)) ||
            (slug && !isAllowedSlug(slug))
          ) {
            localStorage.removeItem(key);
            dirty = true;
          }
        }
      } catch (_) {}

      try {
        const sess = safeJsonParse(sessionStorage.getItem(key));
        if (sess && typeof sess === "object") {
          const moduleName = sess.module || sess.module_code || "";
          const slug = normSlug(sess.slug || "");

          if (
            (moduleName && !isAllowedModule(moduleName)) ||
            (slug && !isAllowedSlug(slug))
          ) {
            sessionStorage.removeItem(key);
            dirty = true;
          }
        }
      } catch (_) {}
    }

    return dirty;
  }

  function saveSlugOnly(slug) {
    const clean = normSlug(slug);
    if (!clean) return;
    if (!isAllowedSlug(clean)) return;

    try {
      localStorage.setItem(CFG.STORAGE.SLUG_KEY, clean);
      localStorage.setItem(CFG.STORAGE.LAST_SLUG_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.SLUG_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.LAST_SLUG_KEY, clean);
    } catch (_) {}
  }

  function savePhoneOnly(phone) {
    const clean = normPhone(phone);
    if (!clean) return;

    try {
      localStorage.setItem(CFG.STORAGE.PHONE_KEY, clean);
      localStorage.setItem(CFG.STORAGE.LAST_PHONE_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.PHONE_KEY, clean);
      sessionStorage.setItem(CFG.STORAGE.LAST_PHONE_KEY, clean);
    } catch (_) {}
  }

  function readSavedSlug() {
    let raw = "";

    try {
      raw =
        initialQs.get("slug") ||
        sessionStorage.getItem(CFG.STORAGE.SLUG_KEY) ||
        sessionStorage.getItem(CFG.STORAGE.LAST_SLUG_KEY) ||
        localStorage.getItem(CFG.STORAGE.SLUG_KEY) ||
        localStorage.getItem(CFG.STORAGE.LAST_SLUG_KEY) ||
        "";
    } catch (_) {
      raw = initialQs.get("slug") || "";
    }

    const slug = normSlug(raw);

    if (!slug) return "";

    if (!isAllowedSlug(slug)) {
      purgeBadPosIdentity();
      return "";
    }

    return slug;
  }

  function readSavedPhone() {
    try {
      return normPhone(
        initialQs.get("phone") ||
          initialQs.get("tel") ||
          initialQs.get("owner_phone") ||
          sessionStorage.getItem(CFG.STORAGE.LAST_PHONE_KEY) ||
          sessionStorage.getItem(CFG.STORAGE.PHONE_KEY) ||
          localStorage.getItem(CFG.STORAGE.LAST_PHONE_KEY) ||
          localStorage.getItem(CFG.STORAGE.PHONE_KEY) ||
          ""
      );
    } catch (_) {
      return normPhone(
        initialQs.get("phone") ||
          initialQs.get("tel") ||
          initialQs.get("owner_phone") ||
          ""
      );
    }
  }

  function readStoredSession() {
    purgeBadPosIdentity();

    for (const key of CFG.STORAGE.SESSION_KEYS) {
      let parsed = null;

      try {
        parsed = safeJsonParse(localStorage.getItem(key));
        if (!parsed) parsed = safeJsonParse(sessionStorage.getItem(key));
      } catch (_) {}

      if (!parsed || typeof parsed !== "object") continue;

      const moduleName = parsed.module || parsed.module_code || "";
      const slug = normSlug(parsed.slug || "");
      const phone = normPhone(parsed.phone || "");
      const owner_id = parsed.owner_id || null;

      if (moduleName && !isAllowedModule(moduleName)) continue;
      if (slug && !isAllowedSlug(slug)) continue;
      if (!slug && !phone) continue;

      const access =
        !!parsed.access ||
        !!parsed.access_ok ||
        !!parsed.ok ||
        !!parsed.has_access;

      const verifiedAt =
        Number(parsed.verified_at || parsed.validated_at_ms || parsed.ts || 0) ||
        0;

      const validatedAtIso = parsed.validated_at || null;

      let ageOk = false;

      if (verifiedAt && isRecent(verifiedAt)) {
        ageOk = true;
      }

      if (!ageOk && validatedAtIso) {
        const dt = new Date(validatedAtIso).getTime();
        if (dt && isRecent(dt)) ageOk = true;
      }

      if (!ageOk) continue;
      if (!access) continue;

      return {
        key,
        slug,
        phone,
        owner_id,
        module: MODULE,
        access: true,
        verified_at:
          verifiedAt ||
          (validatedAtIso ? new Date(validatedAtIso).getTime() : 0),
        validated_at:
          validatedAtIso ||
          (verifiedAt ? new Date(verifiedAt).toISOString() : null)
      };
    }

    return null;
  }

  function saveSession(payload = {}) {
    const verifiedAtMs = Number(payload.verified_at || nowMs()) || nowMs();

    const validatedAtIso =
      payload.validated_at ||
      (verifiedAtMs ? new Date(verifiedAtMs).toISOString() : nowIso());

    const slug = normSlug(payload.slug || state.slug || "");
    const phone = normPhone(payload.phone || state.phone || "");

    if (slug && !isAllowedSlug(slug)) {
      clearSessionsOnly();
      return null;
    }

    const session = {
      slug,
      phone,
      owner_id: payload.owner_id || state.owner_id || null,
      module: MODULE,
      access: !!payload.access,
      access_ok: !!payload.access,
      verified_at: verifiedAtMs,
      validated_at: validatedAtIso,
      ts: nowMs()
    };

    for (const key of CFG.STORAGE.SESSION_KEYS) {
      try {
        localStorage.setItem(key, JSON.stringify(session));
      } catch (_) {}

      try {
        sessionStorage.setItem(key, JSON.stringify(session));
      } catch (_) {}
    }

    saveSlugOnly(session.slug);
    savePhoneOnly(session.phone);

    try {
      window.DIGIY_ACCESS = Object.assign({}, window.DIGIY_ACCESS || {}, session);
    } catch (_) {}

    return session;
  }

  function buildPinUrl(input = {}) {
    const slug = normSlug(input.slug || state.slug || "");

    return buildSafeUrl(CFG.PIN_PATH, {
      ...(isAllowedSlug(slug) ? { slug } : {}),
      return: location.href
    });
  }

  function goPin(input = {}) {
    location.replace(buildPinUrl(input));
  }

  function buildPayUrl(input = {}) {
    const slug = normSlug(input.slug || state.slug || "");

    return buildSafeUrl(CFG.PAY_URL, {
      module: MODULE,
      ...(isAllowedSlug(slug) ? { slug } : {}),
      return: location.href
    });
  }

  function goPay(input = {}) {
    location.replace(buildPayUrl(input));
  }

  function ensureUrlIdentity(slug, phone, options = {}) {
    const removeSensitive = options.removeSensitive === true;

    try {
      const s = normSlug(slug);
      const p = normPhone(phone);

      const url = new URL(location.href);
      const currentSlug = normSlug(url.searchParams.get("slug") || "");
      const currentPhone = normPhone(
        url.searchParams.get("phone") ||
          url.searchParams.get("tel") ||
          url.searchParams.get("owner_phone") ||
          ""
      );

      let changed = false;

      if (!removeSensitive && s && isAllowedSlug(s) && currentSlug !== s) {
        url.searchParams.set("slug", s);
        changed = true;
      }

      if (
        !removeSensitive &&
        CFG.URL.KEEP_PHONE_IN_URL &&
        p &&
        currentPhone !== p
      ) {
        url.searchParams.set("phone", p);
        changed = true;
      }

      if (removeSensitive) {
        [
          "phone",
          "tel",
          "owner_phone",
          "owner",
          "owner_id",
          "slug",
          "room_slug",
          "pos_slug",
          "access",
          "pin",
          "code",
          "session"
        ].forEach((key) => {
          if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            changed = true;
          }
        });
      }

      if (changed) {
        const clean =
          url.pathname +
          (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") +
          url.hash;

        history.replaceState({}, document.title, clean);
      }
    } catch (_) {}
  }

  async function resolveSubBySlug(slug) {
    const s = normSlug(slug);
    if (!s) return null;
    if (!isAllowedSlug(s)) return null;

    const tries = [];

    CFG.ALLOWED_MODULES.forEach((moduleName) => {
      tries.push({
        select: "phone,slug,module",
        slug: `eq.${s}`,
        module: `eq.${moduleName}`,
        limit: "1"
      });
    });

    for (const params of tries) {
      const res = await tableGet(CFG.TABLES.SUBSCRIPTIONS_PUBLIC, params);

      if (!res.ok || !Array.isArray(res.data) || !res.data[0]) continue;

      const row = res.data[0];
      const rowSlug = normSlug(row.slug);
      const rowModule = row.module || MODULE;

      if (!isAllowedModule(rowModule)) continue;
      if (rowSlug && !isAllowedSlug(rowSlug)) continue;

      return {
        slug: rowSlug || s,
        phone: normPhone(row.phone),
        module: upper(rowModule)
      };
    }

    return null;
  }

  async function resolveSubByPhone(phone) {
    const p = normPhone(phone);
    if (!p) return null;

    const tries = [];

    CFG.ALLOWED_MODULES.forEach((moduleName) => {
      tries.push({
        select: "phone,slug,module",
        phone: `eq.${p}`,
        module: `eq.${moduleName}`,
        limit: "1"
      });
    });

    for (const params of tries) {
      const res = await tableGet(CFG.TABLES.SUBSCRIPTIONS_PUBLIC, params);

      if (!res.ok || !Array.isArray(res.data) || !res.data[0]) continue;

      const row = res.data[0];
      const rowSlug = normSlug(row.slug);
      const rowModule = row.module || MODULE;

      if (!isAllowedModule(rowModule)) continue;
      if (!rowSlug || !isAllowedSlug(rowSlug)) continue;

      return {
        slug: rowSlug,
        phone: normPhone(row.phone),
        module: upper(rowModule)
      };
    }

    return null;
  }

  async function checkAccess(phone) {
    const p = normPhone(phone);
    if (!p) return false;

    const tries = [];

    CFG.ALLOWED_MODULES.forEach((moduleName) => {
      tries.push({ p_phone: p, p_module: moduleName });
      tries.push({ phone: p, module: moduleName });
    });

    for (const body of tries) {
      const res = await rpc(CFG.RPC.HAS_ACCESS, body);

      if (!res.ok) continue;

      if (res.data === true) return true;
      if (res.data?.ok === true) return true;
      if (res.data?.access === true) return true;
      if (res.data?.has_access === true) return true;
      if (res.data?.allowed === true) return true;
      if (res.data?.valid === true) return true;
    }

    return false;
  }

  function parseVerifyPinPayload(data, fallbackPhone = "", fallbackSlug = "") {
    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return null;

    if (typeof raw === "object" && !Array.isArray(raw)) {
      if (
        raw.ok === true ||
        raw.valid === true ||
        raw.allowed === true ||
        raw.access === true
      ) {
        const moduleName = upper(raw.module || raw.p_module || MODULE);
        const slug = normSlug(raw.slug || raw.pos_slug || fallbackSlug || "");

        if (moduleName && !isAllowedModule(moduleName)) return null;
        if (slug && !isAllowedSlug(slug)) return null;

        return {
          ok: true,
          module: moduleName || MODULE,
          phone: normPhone(raw.phone || raw.p_phone || fallbackPhone || ""),
          slug,
          owner_id: raw.owner_id || null
        };
      }

      const vals = Object.values(raw);

      if (vals.length >= 3) {
        const okLike =
          vals[0] === true ||
          vals[0] === "t" ||
          vals[0] === "true" ||
          vals[0] === 1;

        if (okLike) {
          const moduleName = upper(vals[1] || MODULE);
          const slug = normSlug(vals[3] || fallbackSlug || "");

          if (moduleName && !isAllowedModule(moduleName)) return null;
          if (slug && !isAllowedSlug(slug)) return null;

          return {
            ok: true,
            module: moduleName || MODULE,
            phone: normPhone(vals[2] || fallbackPhone || ""),
            slug,
            owner_id: vals[4] || null
          };
        }
      }
    }

    if (typeof raw === "string") {
      const txt = raw.trim();

      if (txt.startsWith("(") && txt.endsWith(")")) {
        const tupleHead = txt.match(/^\(([^,]+),([^,]+),([^,]+),?(.*)\)$/);

        if (tupleHead) {
          const okToken = String(tupleHead[1] || "")
            .trim()
            .replace(/^"|"$/g, "");

          const modToken = String(tupleHead[2] || "")
            .trim()
            .replace(/^"|"$/g, "");

          const phoneToken = String(tupleHead[3] || "")
            .trim()
            .replace(/^"|"$/g, "");

          const okLike =
            okToken === "t" || okToken === "true" || okToken === "1";

          const moduleName = upper(modToken || MODULE);
          const slug = normSlug(fallbackSlug || "");

          if (okLike) {
            if (moduleName && !isAllowedModule(moduleName)) return null;
            if (slug && !isAllowedSlug(slug)) return null;

            return {
              ok: true,
              module: moduleName || MODULE,
              phone: normPhone(phoneToken || fallbackPhone || ""),
              slug,
              owner_id: null
            };
          }
        }
      }
    }

    return null;
  }

  async function attemptPinLoginRPCs(slug, pin, phone) {
    const s = normSlug(slug);
    const p = normPin(pin);
    const ph = normPhone(phone);

    if (!s || !p || !ph) return null;
    if (!isAllowedSlug(s)) return null;

    const tries = [
      { p_phone: ph, p_pin: p },
      { phone: ph, pin: p },
      { input_phone: ph, input_pin: p }
    ];

    for (const body of tries) {
      const res = await rpc(CFG.RPC.VERIFY_PIN, body);

      if (!res.ok) continue;

      const parsed = parseVerifyPinPayload(res.data, ph, s);

      if (!parsed?.ok) continue;

      return {
        ok: true,
        slug: normSlug(parsed.slug || s),
        phone: normPhone(parsed.phone || ph),
        owner_id: parsed.owner_id || null
      };
    }

    return null;
  }

  purgeBadPosIdentity();

  const stored = readStoredSession();
  const savedSlug = readSavedSlug();
  const savedPhone = readSavedPhone();

  const initialSlug = normSlug(slugQ || stored?.slug || savedSlug || "");
  const initialPhone = normPhone(phoneQ || stored?.phone || savedPhone || "");

  const state = {
    module: MODULE,
    slug: isAllowedSlug(initialSlug) ? initialSlug : "",
    phone: initialPhone,
    owner_id: stored?.owner_id || null,
    access: false,
    access_ok: false,
    preview: true,
    ready_flag: false,
    error: null,
    source: stored
      ? "session"
      : slugQ || phoneQ
      ? "query"
      : savedSlug || savedPhone
      ? "storage"
      : "none",
    verified_at: stored?.verified_at || null,
    validated_at: stored?.validated_at || null,
    pin_url: "",
    pay_url: ""
  };

  let pendingPromise = null;

  async function loginWithPin(slug, pin) {
    const s = normSlug(slug);
    const p = normPin(pin);

    if (!s) {
      return {
        ok: false,
        error: "Identifiant manquant."
      };
    }

    if (!isAllowedSlug(s)) {
      purgeBadPosIdentity();

      return {
        ok: false,
        error: "Cet identifiant n’ouvre pas MON COMMERCE. Utilise ton téléphone ou contacte le support."
      };
    }

    if (!p) {
      return {
        ok: false,
        error: "PIN manquant."
      };
    }

    let phone = normPhone(state.phone || readSavedPhone() || "");

    if (!phone) {
      const sub = await resolveSubBySlug(s);
      phone = normPhone(sub?.phone || "");
    }

    if (!phone) {
      return {
        ok: false,
        error: "Identifiant introuvable. Vérifie ton lien pro ou contacte le support."
      };
    }

    const auth = await attemptPinLoginRPCs(s, p, phone);

    if (!auth?.ok) {
      return {
        ok: false,
        error: "PIN invalide."
      };
    }

    const finalSlug = normSlug(auth.slug || s);

    if (!isAllowedSlug(finalSlug)) {
      purgeBadPosIdentity();

      return {
        ok: false,
        error: "Mauvaise porte détectée. Reviens par MON COMMERCE."
      };
    }

    const finalPhone = normPhone(auth.phone || phone);
    const finalOwnerId = auth.owner_id || null;

    const accessOk = await checkAccess(finalPhone);

    if (!accessOk) {
      return {
        ok: false,
        error: "Abonnement inactif."
      };
    }

    const saved = saveSession({
      slug: finalSlug,
      phone: finalPhone,
      owner_id: finalOwnerId,
      access: true,
      verified_at: nowMs(),
      validated_at: nowIso()
    });

    if (!saved) {
      return {
        ok: false,
        error: "Session non enregistrée. Identifiant invalide."
      };
    }

    state.slug = saved.slug;
    state.phone = saved.phone;
    state.owner_id = saved.owner_id;
    state.access = true;
    state.access_ok = true;
    state.preview = false;
    state.ready_flag = true;
    state.error = null;
    state.verified_at = saved.verified_at;
    state.validated_at = saved.validated_at;
    state.pin_url = buildPinUrl(saved);
    state.pay_url = buildPayUrl(saved);

    ensureUrlIdentity(saved.slug, saved.phone, { removeSensitive: true });
    showPage();

    return {
      ok: true,
      slug: saved.slug,
      phone: saved.phone,
      owner_id: saved.owner_id || null
    };
  }

  function logout() {
    clearAllAccessState();

    state.slug = "";
    state.phone = "";
    state.owner_id = null;
    state.access = false;
    state.access_ok = false;
    state.preview = true;
    state.ready_flag = false;
    state.error = null;
    state.verified_at = null;
    state.validated_at = null;

    showPage();
    goPin({});
  }

  async function check() {
    purgeBadPosIdentity();

    const storedSession = readStoredSession();
    const persistedSlug = readSavedSlug();
    const persistedPhone = readSavedPhone();

    let slug = normSlug(
      storedSession?.slug ||
      state.slug ||
      persistedSlug ||
      ""
    );

    let phone = normPhone(
      phoneQ ||
      storedSession?.phone ||
      state.phone ||
      persistedPhone ||
      ""
    );

    let owner_id = storedSession?.owner_id || state.owner_id || null;

    let verifiedAt =
      Number(storedSession?.verified_at || state.verified_at || 0) || 0;

    let validatedAt = storedSession?.validated_at || state.validated_at || null;

    if (slug && !isAllowedSlug(slug)) {
      slug = "";
      clearSessionsOnly();
      purgeBadPosIdentity();
    }

    state.slug = slug;
    state.phone = phone;
    state.owner_id = owner_id;
    state.verified_at = verifiedAt;
    state.validated_at = validatedAt;
    state.pin_url = buildPinUrl({ slug, phone });
    state.pay_url = buildPayUrl({ slug, phone });
    state.error = null;

    if (slug) saveSlugOnly(slug);
    if (phone) savePhoneOnly(phone);

    cleanSensitiveUrl({ removeSlug: false });

    if (slug && !phone) {
      const sub = await resolveSubBySlug(slug);

      if (sub?.phone) {
        phone = normPhone(sub.phone);
        state.phone = phone;
        savePhoneOnly(phone);
      }
    }

    if (phone && !slug) {
      const sub = await resolveSubByPhone(phone);

      if (sub?.slug && isAllowedSlug(sub.slug)) {
        slug = normSlug(sub.slug);
        state.slug = slug;
        saveSlugOnly(slug);
      }
    }

    state.pin_url = buildPinUrl({ slug, phone });
    state.pay_url = buildPayUrl({ slug, phone });

    if (!slug && !phone) {
      if (CFG.ALLOW_PREVIEW_WITHOUT_IDENTITY) {
        state.access = false;
        state.access_ok = false;
        state.preview = true;
        state.ready_flag = true;
        state.error = "Accès non identifié.";
        showPage();

        return { ...state };
      }

      clearSessionsOnly();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Accès non identifié.";

      showPage();
      goPin({});

      return { ...state };
    }

    if (!slug) {
      clearSessionsOnly();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Identifiant absent.";

      showPage();
      goPin({ phone });

      return { ...state };
    }

    if (!isAllowedSlug(slug)) {
      clearSessionsOnly();
      purgeBadPosIdentity();

      state.slug = "";
      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Mauvais rail détecté.";

      showPage();
      goPin({ phone });

      return { ...state };
    }

    const freshSession = !!verifiedAt && isRecent(verifiedAt);

    if (!freshSession) {
      clearSessionsOnly();

      if (slug) saveSlugOnly(slug);
      if (phone) savePhoneOnly(phone);

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Session expirée.";

      showPage();
      goPin({ slug, phone });

      return { ...state };
    }

    state.access = true;
    state.access_ok = true;
    state.preview = false;
    state.ready_flag = true;
    state.error = null;

    const saved = saveSession({
      slug,
      phone,
      owner_id,
      access: true,
      verified_at: verifiedAt || nowMs(),
      validated_at: validatedAt || nowIso()
    });

    if (!saved) {
      clearSessionsOnly();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = true;
      state.error = "Session invalide.";

      showPage();
      goPin({ phone });

      return { ...state };
    }

    state.slug = saved.slug;
    state.phone = saved.phone;
    state.owner_id = saved.owner_id;
    state.verified_at = saved.verified_at;
    state.validated_at = saved.validated_at;
    state.pin_url = buildPinUrl(saved);
    state.pay_url = buildPayUrl(saved);

    ensureUrlIdentity(saved.slug, saved.phone, { removeSensitive: true });
    showPage();

    return { ...state };
  }

  function ready() {
    hidePage();

    if (state.ready_flag) {
      showPage();
      return Promise.resolve({ ...state });
    }

    if (!pendingPromise) {
      pendingPromise = check().finally(() => {
        pendingPromise = null;
      });
    }

    return pendingPromise;
  }

  window.DIGIY_GUARD = {
    state,
    ready,

    async refresh() {
      state.ready_flag = false;
      state.error = null;
      pendingPromise = null;
      return ready();
    },

    getSession() {
      return { ...state };
    },

    getSlug() {
      return normSlug(state.slug || "");
    },

    getPhone() {
      return normPhone(state.phone || "");
    },

    getOwnerId() {
      return state.owner_id || null;
    },

    getModule() {
      return MODULE;
    },

    isAuthenticated() {
      return !!state.access_ok;
    },

    isAllowedSlug(slug) {
      return isAllowedSlug(slug);
    },

    saveSession(payload = {}) {
      const saved = saveSession(payload);

      if (!saved) {
        clearSessionsOnly();
        return null;
      }

      state.slug = saved.slug;
      state.phone = saved.phone;
      state.owner_id = saved.owner_id || null;
      state.access = !!saved.access;
      state.access_ok = !!saved.access;
      state.preview = !saved.access;
      state.verified_at = saved.verified_at;
      state.validated_at = saved.validated_at;
      state.ready_flag = true;
      state.error = null;
      state.pin_url = buildPinUrl(saved);
      state.pay_url = buildPayUrl(saved);

      ensureUrlIdentity(saved.slug, saved.phone, { removeSensitive: true });

      return saved;
    },

    clearSession() {
      clearSessionsOnly();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
    },

    clearAll() {
      clearAllAccessState();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
      state.slug = "";
      state.phone = "";
      state.owner_id = null;
      state.verified_at = null;
      state.validated_at = null;
    },

    repairAccess() {
      clearAllAccessState();

      state.access = false;
      state.access_ok = false;
      state.preview = true;
      state.ready_flag = false;
      state.error = null;
      state.slug = "";
      state.phone = "";
      state.owner_id = null;
      state.verified_at = null;
      state.validated_at = null;

      showPage();

      return {
        ok: true,
        message: "Accès MON COMMERCE réinitialisé."
      };
    },

    loginWithPin,
    logout,

    buildPinUrl(input = {}) {
      return buildPinUrl({ ...state, ...input });
    },

    goPin(input = {}) {
      goPin({ ...state, ...input });
    },

    buildPayUrl(input = {}) {
      return buildPayUrl({ ...state, ...input });
    },

    goPay(input = {}) {
      goPay({ ...state, ...input });
    },

    cleanSensitiveUrl,

    async resolveSubBySlug(slug) {
      return resolveSubBySlug(slug);
    },

    async resolveSubByPhone(phone) {
      return resolveSubByPhone(phone);
    },

    async checkAccess(phone) {
      return checkAccess(phone || state.phone || "");
    }
  };

  ready();
})();
