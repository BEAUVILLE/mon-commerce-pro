/**
 * DIGIY GUARD PRO — POS / slug-first / rail local
 * Objectif :
 * - ne pas boucler vers PIN si l'abonnement est actif
 * - vérifier via digiy_subscriptions_public (slug -> phone) + digiy_has_access(phone,module)
 * - mémoriser correctement le slug / phone POS pour hall, caisse, admin, dashboard
 * - revenir proprement depuis pin.html local
 */
(function () {
  "use strict";

  const SUPABASE_URL =
    String(window.DIGIY_SUPABASE_URL || "https://wesqmwjjtsefyjnluosj.supabase.co").trim();

  const SUPABASE_ANON_KEY =
    String(
      window.DIGIY_SUPABASE_ANON_KEY ||
      window.DIGIY_SUPABASE_ANON ||
      "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3"
    ).trim();

  const MODULE = "POS";
  const MODULE_ALIASES = new Set(["POS", "CAISSE"]);
  const SESSION_KEY = "DIGIY_GUARD_POS";
  const POS_LAST_SLUG_KEY = "digiy_pos_last_slug";
  const POS_LAST_PHONE_KEY = "digiy_pos_last_phone";
  const ACCESS_KEY = "DIGIY_ACCESS";
  const SESSION_MAX_AGE_MS = 12 * 3600 * 1000; // 12h

  let _sb = null;
  let _session = null;

  function digiyBasePath() {
    const parts = location.pathname.split("/").filter(Boolean);
    const isGh = /\.github\.io$/i.test(location.hostname);
    if (isGh && parts.length > 0) return "/" + parts[0] + "/";
    return "/";
  }

  function digiyLocal(path) {
    path = String(path || "").replace(/^\/+/, "");
    return digiyBasePath() + path;
  }

  function getPinHub() {
    return new URL(digiyLocal("pin.html"), location.origin).toString();
  }

  function getReturnUrl() {
    return location.origin + location.pathname + location.search;
  }

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function normalizeModuleCode(v) {
    const x = String(v || "").trim().toUpperCase();
    if (!x) return MODULE;
    if (MODULE_ALIASES.has(x)) return MODULE;
    return x;
  }

  function cleanDigits(v) {
    return String(v || "").replace(/[^\d]/g, "");
  }

  function getUrl() {
    return new URL(location.href);
  }

  function getUrlSlug() {
    return String(getUrl().searchParams.get("slug") || "").trim().toLowerCase();
  }

  function getUrlPhone() {
    return cleanDigits(getUrl().searchParams.get("phone") || "");
  }

  function getSavedLastSlug() {
    return String(
      localStorage.getItem(POS_LAST_SLUG_KEY) ||
      sessionStorage.getItem(POS_LAST_SLUG_KEY) ||
      ""
    ).trim().toLowerCase();
  }

  function getSavedLastPhone() {
    return cleanDigits(
      localStorage.getItem(POS_LAST_PHONE_KEY) ||
      sessionStorage.getItem(POS_LAST_PHONE_KEY) ||
      ""
    );
  }

  function getCandidateSlug() {
    return getUrlSlug() || getSavedLastSlug() || "";
  }

  function getSb() {
    if (_sb) return _sb;
    if (window.supabase && typeof window.supabase.createClient === "function") {
      _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });
    }
    return _sb;
  }

  function saveLastAccess(slug, phone) {
    const s = String(slug || "").trim().toLowerCase();
    const p = cleanDigits(phone || "");

    if (s) {
      localStorage.setItem(POS_LAST_SLUG_KEY, s);
      sessionStorage.setItem(POS_LAST_SLUG_KEY, s);
    }
    if (p) {
      localStorage.setItem(POS_LAST_PHONE_KEY, p);
      sessionStorage.setItem(POS_LAST_PHONE_KEY, p);
    }
  }

  function saveSession(data) {
    const sess = {
      slug: String(data.slug || "").trim().toLowerCase(),
      phone: cleanDigits(data.phone || ""),
      owner_id: data.owner_id || null,
      title: data.title || "",
      module: MODULE,
      ts: Date.now()
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
    localStorage.setItem(
      ACCESS_KEY,
      JSON.stringify({
        slug: sess.slug,
        phone: sess.phone,
        owner_id: sess.owner_id,
        module: MODULE,
        ts: sess.ts
      })
    );

    saveLastAccess(sess.slug, sess.phone);
    _session = sess;
    return sess;
  }

  function loadSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = safeJsonParse(raw);
    if (!s) return null;

    const expired = (Date.now() - Number(s.ts || 0)) > SESSION_MAX_AGE_MS;
    if (!s.slug || !s.phone || expired) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    s.slug = String(s.slug || "").trim().toLowerCase();
    s.phone = cleanDigits(s.phone || "");
    if (!s.slug || !s.phone) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    return s;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ACCESS_KEY);
    _session = null;
  }

  function cleanUrlAfterPin(slug, phone) {
    const url = getUrl();
    url.searchParams.delete("from");
    url.searchParams.delete("module");
    url.searchParams.delete("target");
    if (slug) url.searchParams.set("slug", slug);
    if (phone) url.searchParams.set("phone", phone);
    history.replaceState({}, "", url.toString());
  }

  function goPin(slug, phone, target) {
    const u = new URL(getPinHub());
    u.searchParams.set("module", MODULE);
    u.searchParams.set("return", getReturnUrl());

    const t =
      String(target || "").trim().toLowerCase() ||
      (
        /admin\.html$/i.test(location.pathname) ? "admin" :
        /index\.html$/i.test(location.pathname) ? "hall" :
        "caisse"
      );

    u.searchParams.set("target", t);

    if (slug) u.searchParams.set("slug", String(slug).trim().toLowerCase());
    if (phone) u.searchParams.set("phone", cleanDigits(phone));
    location.replace(u.toString());
  }

  async function fetchSubscriptionPublicBySlug(sb, slug) {
    const { data, error } = await sb
      .from("digiy_subscriptions_public")
      .select("slug,phone,module")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async function verifyAccessByPhone(sb, phone) {
    try {
      const { data, error } = await sb.rpc("digiy_has_access", {
        p_phone: phone,
        p_module: MODULE
      });
      if (error) throw error;

      if (typeof data === "boolean") return data;
      if (data && typeof data.ok === "boolean") return data.ok;
      if (data && typeof data.has_access === "boolean") return data.has_access;
      if (data && typeof data.allowed === "boolean") return data.allowed;
      return !!data;
    } catch (_) {
      const { data, error } = await sb.rpc("digiy_has_access", {
        phone,
        module: MODULE
      });
      if (error) throw error;

      if (typeof data === "boolean") return data;
      if (data && typeof data.ok === "boolean") return data.ok;
      if (data && typeof data.has_access === "boolean") return data.has_access;
      if (data && typeof data.allowed === "boolean") return data.allowed;
      return !!data;
    }
  }

  async function fetchOwnerContext(sb, slug) {
    try {
      const { data, error } = await sb
        .from("digiy_subscriptions")
        .select("owner_id,title,slug,module")
        .eq("slug", slug)
        .limit(1)
        .maybeSingle();

      if (error) return { owner_id: null, title: "" };
      return {
        owner_id: data?.owner_id || null,
        title: data?.title || ""
      };
    } catch (_) {
      return { owner_id: null, title: "" };
    }
  }

  async function verifyWithSupabase(slug) {
    const sb = getSb();
    if (!sb) return { ok: false, reason: "sb_missing" };

    const s = String(slug || "").trim().toLowerCase();
    if (!s) return { ok: false, reason: "slug_missing" };

    let subRow = null;
    try {
      subRow = await fetchSubscriptionPublicBySlug(sb, s);
    } catch (_) {
      return { ok: false, reason: "slug_lookup_failed" };
    }

    if (!subRow?.phone) {
      return { ok: false, reason: "slug_not_found" };
    }

    const rowModule = normalizeModuleCode(subRow.module);
    if (subRow.module && rowModule !== MODULE) {
      return { ok: false, reason: "module_mismatch" };
    }

    const phone = cleanDigits(subRow.phone);
    if (!phone) {
      return { ok: false, reason: "phone_missing" };
    }

    let accessOk = false;
    try {
      accessOk = await verifyAccessByPhone(sb, phone);
    } catch (_) {
      return { ok: false, reason: "access_check_failed" };
    }

    if (!accessOk) {
      return { ok: false, reason: "no_access" };
    }

    const owner = await fetchOwnerContext(sb, s);

    return {
      ok: true,
      slug: s,
      phone,
      owner_id: owner.owner_id || null,
      title: owner.title || ""
    };
  }

  async function boot() {
    const url = getUrl();
    const from = String(url.searchParams.get("from") || "").trim().toLowerCase();
    const fromPin = from === "pin" || from === "pin_royal";

    const urlSlug = getUrlSlug();
    const urlPhone = getUrlPhone();
    const urlModule = normalizeModuleCode(url.searchParams.get("module") || MODULE);

    // 1) retour PIN
    if (fromPin && urlModule === MODULE) {
      const candidateSlug = urlSlug || getSavedLastSlug();
      if (!candidateSlug) {
        goPin("", urlPhone);
        return { ok: false, reason: "from_pin_no_slug" };
      }

      const verified = await verifyWithSupabase(candidateSlug);
      if (verified.ok) {
        saveSession(verified);
        cleanUrlAfterPin(verified.slug, verified.phone);
        return {
          ok: true,
          reason: "from_pin_ok",
          owner_id: verified.owner_id || null
        };
      }

      goPin(candidateSlug, urlPhone || getSavedLastPhone());
      return { ok: false, reason: verified.reason || "from_pin_fail" };
    }

    // 2) session locale
    const cached = loadSession();
    if (cached) {
      const candidateSlug = urlSlug || getSavedLastSlug();
      if (candidateSlug && candidateSlug !== cached.slug) {
        clearSession();
      } else {
        _session = cached;
        saveLastAccess(cached.slug, cached.phone);
        if (!urlSlug) {
          const clean = getUrl();
          clean.searchParams.set("slug", cached.slug);
          if (cached.phone) clean.searchParams.set("phone", cached.phone);
          history.replaceState({}, "", clean.toString());
        }
        return { ok: true, reason: "cached", owner_id: cached.owner_id || null };
      }
    }

    // 3) slug direct ou mémorisé
    const candidateSlug = getCandidateSlug();
    if (candidateSlug) {
      const verified = await verifyWithSupabase(candidateSlug);
      if (verified.ok) {
        saveSession(verified);

        const clean = getUrl();
        if (!getUrlSlug()) clean.searchParams.set("slug", verified.slug);
        if (!getUrlPhone() && verified.phone) clean.searchParams.set("phone", verified.phone);
        history.replaceState({}, "", clean.toString());

        return { ok: true, reason: "slug_ok", owner_id: verified.owner_id || null };
      }

      goPin(candidateSlug, urlPhone || getSavedLastPhone());
      return { ok: false, reason: verified.reason || "slug_fail" };
    }

    // 4) rien
    goPin("", urlPhone || getSavedLastPhone());
    return { ok: false, reason: "no_slug" };
  }

  function logout(redirectTo) {
    clearSession();

    if (redirectTo) {
      location.replace(redirectTo);
      return;
    }

    goPin("", getSavedLastPhone());
  }

  window.DIGIY_GUARD = {
    boot,
    logout,
    getSb,
    getSession: () => _session
  };
})();
