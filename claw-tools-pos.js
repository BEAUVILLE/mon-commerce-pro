// claw-tools-pos.js — DIGIY MON COMMERCE / POS bridge clean
// Rôle : pont technique silencieux pour les anciennes pages.
// Doctrine : ne jamais remettre phone/slug sensible dans les URLs visibles.
// API : window.DIGIY_CLAW_POS et window.CLAW_POS

(function(){
  "use strict";

  const MODULE = "POS";

  const PATHS = {
    home: "./index.html",
    pin: "./pin.html",
    caisse: "./caisse.html",
    admin: "./admin.html",
    articles: "./admin.html#articleList",
    profile: "./profile.html",
    qr: "./qr.html",
    dashboard: "./index.html"
  };

  const RPCS = {
    HAS_ACCESS: "digiy_has_access",
    GET_STORE_CONTEXT: "digiy_pos_get_store_context_by_slug",
    GET_SUBSCRIPTION: "digiy_get_subscription_status",
    GET_DASHBOARD_STATS: "digiy_get_dashboard_stats",
    GET_BOOST_STATUS: "digiy_get_boost_status",
    BUILD_PAY_URL: "digiy_build_pay_url"
  };

  const STORAGE = {
    SESSIONS: [
      "DIGIY_POS_PRO_SESSION_V1",
      "DIGIY_POS_PIN_SESSION",
      "DIGIY_POS_SESSION",
      "DIGIY_PIN_SESSION",
      "DIGIY_ACCESS",
      "DIGIY_SESSION_POS",
      "digiy_pos_session"
    ],
    SLUGS: ["digiy_pos_slug","digiy_pos_last_slug"],
    PHONES: ["digiy_pos_phone","digiy_pos_last_phone"]
  };

  const MODULE_ALIASES = ["POS","pos","POS_PRO","COMMERCE","CAISSE","MON_COMMERCE"];
  const ALLOWED_SLUG_PREFIXES = ["pos-","commerce-","mon-commerce-","caisse-"];
  const FORBIDDEN_SLUG_PREFIXES = ["loc-","explore-","driver-","market-","build-","jobs-","resa-","pay-"];

  const SUPABASE_URL =
    window.DIGIY_SUPABASE_URL ||
    "https://wesqmwjjtsefyjnluosj.supabase.co";

  const SUPABASE_ANON_KEY =
    window.DIGIY_SUPABASE_ANON ||
    window.DIGIY_SUPABASE_ANON_KEY ||
    "sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3";

  const ABOS_URL = "https://commencer-a-payer.digiylyfe.com/";

  let sbCache = null;

  function normSlug(v){
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g,"-")
      .replace(/[^a-z0-9-]/g,"")
      .replace(/-+/g,"-")
      .replace(/^-|-$/g,"");
  }

  function normPhone(v){
    return String(v || "").replace(/[^\d]/g,"").slice(0,15);
  }

  function isAllowedModule(v){
    const raw = String(v || "").trim().toUpperCase();
    if(!raw) return true;
    return MODULE_ALIASES.some(m => String(m).toUpperCase() === raw);
  }

  function isForbiddenSlug(v){
    const s = normSlug(v);
    return !!s && FORBIDDEN_SLUG_PREFIXES.some(prefix => s.startsWith(prefix));
  }

  function isPosSlug(v){
    const s = normSlug(v);
    if(!s || isForbiddenSlug(s)) return false;
    return ALLOWED_SLUG_PREFIXES.some(prefix => s.startsWith(prefix));
  }

  function parseJson(raw){
    try{return JSON.parse(raw)}catch(_){return null}
  }

  function storageGet(key){
    try{
      return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
    }catch(_){
      return "";
    }
  }

  function storageSet(key,value,localToo){
    const v = String(value || "").trim();
    if(!v) return;

    try{sessionStorage.setItem(key,v)}catch(_){}
    if(localToo !== false){
      try{localStorage.setItem(key,v)}catch(_){}
    }
  }

  function asError(message,extra){
    return {
      ok:false,
      error:String(message || "Erreur."),
      ...(extra || {})
    };
  }

  function cleanInternalPath(path){
    try{
      const u = new URL(path || "./index.html", location.href);

      [
        "phone","tel","wa","whatsapp","owner_phone","subscription_phone",
        "checkout_phone","p_phone","pin","pin4","code","token","session",
        "session_token","module","access","owner","owner_id","slug",
        "pos_slug","commerce"
      ].forEach(k => u.searchParams.delete(k));

      return u.pathname + u.search + u.hash;
    }catch(_){
      return String(path || "./index.html");
    }
  }

  function cleanVisibleUrl(){
    try{
      const u = new URL(location.href);
      let changed = false;

      const slug = normSlug(
        u.searchParams.get("slug") ||
        u.searchParams.get("pos_slug") ||
        u.searchParams.get("commerce") ||
        ""
      );

      const phone = normPhone(
        u.searchParams.get("phone") ||
        u.searchParams.get("tel") ||
        u.searchParams.get("owner_phone") ||
        u.searchParams.get("p_phone") ||
        ""
      );

      if(slug && isPosSlug(slug)){
        STORAGE.SLUGS.forEach(k => storageSet(k,slug,true));
      }

      if(phone){
        STORAGE.PHONES.forEach(k => storageSet(k,phone,false));
      }

      [
        "phone","tel","wa","whatsapp","owner_phone","subscription_phone",
        "checkout_phone","p_phone","pin","pin4","code","token","session",
        "session_token","module","access","owner","owner_id","slug",
        "pos_slug","commerce"
      ].forEach(k => {
        if(u.searchParams.has(k)){
          u.searchParams.delete(k);
          changed = true;
        }
      });

      if(changed){
        history.replaceState({},document.title,u.pathname + u.search + u.hash);
      }
    }catch(_){}
  }

  function getSupabaseClient(){
    if(sbCache) return sbCache;

    if(window.DIGIY_GUARD && typeof window.DIGIY_GUARD.getSb === "function"){
      try{
        const gsb = window.DIGIY_GUARD.getSb();
        if(gsb){
          sbCache = gsb;
          return sbCache;
        }
      }catch(_){}
    }

    if(window.sb && typeof window.sb.from === "function"){
      sbCache = window.sb;
      return sbCache;
    }

    if(!window.supabase || typeof window.supabase.createClient !== "function"){
      return null;
    }

    sbCache = window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
      auth:{
        persistSession:false,
        autoRefreshToken:false,
        detectSessionInUrl:false
      }
    });

    return sbCache;
  }

  function readStoredSession(){
    for(const key of STORAGE.SESSIONS){
      const raw = storageGet(key);
      if(!raw) continue;

      const s = parseJson(raw);
      if(!s || typeof s !== "object") continue;

      const moduleName = s.module || s.module_code || MODULE;
      const slug = normSlug(s.slug || s.pos_slug || "");
      const phone = normPhone(s.phone || s.p_phone || s.owner_phone || "");

      if(moduleName && !isAllowedModule(moduleName)) continue;
      if(slug && !isPosSlug(slug)) continue;

      return {
        module:MODULE,
        slug,
        phone,
        access_ok:!!(s.access_ok || s.access || s.ok || s.verified || s.valid),
        access:!!(s.access_ok || s.access || s.ok || s.verified || s.valid),
        preview:false,
        source:"storage"
      };
    }

    return null;
  }

  function readStoredIdentity(){
    let slug = "";
    let phone = "";

    for(const key of STORAGE.SLUGS){
      const s = normSlug(storageGet(key));
      if(s && isPosSlug(s)){
        slug = s;
        break;
      }
    }

    for(const key of STORAGE.PHONES){
      const p = normPhone(storageGet(key));
      if(p){
        phone = p;
        break;
      }
    }

    return {slug,phone};
  }

  async function getContext(){
    cleanVisibleUrl();

    const guard = window.DIGIY_GUARD;

    if(guard){
      try{
        let state = null;

        if(typeof guard.getSession === "function"){
          state = guard.getSession();
        }

        if((!state || !state.slug && !state.phone) && typeof guard.ready === "function"){
          const res = await guard.ready({
            redirect:false,
            preserve_validation:true,
            allow_soft_session:true
          });

          state = res?.session || guard.getSession?.() || guard.state || res || {};
        }

        state = state || guard.state || {};

        const slug = normSlug(state.slug || "");
        const phone = normPhone(state.phone || "");

        if(slug && isPosSlug(slug)) STORAGE.SLUGS.forEach(k => storageSet(k,slug,true));
        if(phone) STORAGE.PHONES.forEach(k => storageSet(k,phone,false));

        return {
          ok:true,
          module:MODULE,
          slug: slug && isPosSlug(slug) ? slug : "",
          phone,
          access_ok:!!(state.access_ok || state.access || state.ok),
          access:!!(state.access_ok || state.access || state.ok),
          preview:!!state.preview,
          source:state.source || "guard"
        };
      }catch(_){}
    }

    const stored = readStoredSession();
    if(stored) return {ok:true,...stored};

    const id = readStoredIdentity();

    return {
      ok:true,
      module:MODULE,
      slug:id.slug,
      phone:id.phone,
      access_ok:false,
      access:false,
      preview:true,
      source:id.slug || id.phone ? "identity" : "none"
    };
  }

  async function requireContext(){
    const ctx = await getContext();

    if(!ctx.ok) return ctx;
    if(!ctx.slug && !ctx.phone){
      return asError("Compte non reconnu.",{context:ctx,code:"identity_required"});
    }

    return ctx;
  }

  async function requireAccess(){
    const ctx = await requireContext();

    if(!ctx.ok) return ctx;

    if(!ctx.access_ok || ctx.preview){
      return asError("Accès non ouvert.",{context:ctx,code:"access_required"});
    }

    return ctx;
  }

  async function rpcFirstSuccess(name,payloads){
    const sb = getSupabaseClient();
    if(!sb) throw new Error("supabase_not_ready");

    let lastError = null;

    for(const payload of payloads || []){
      try{
        const {data,error} = await sb.rpc(name,payload);
        if(!error) return data;
        lastError = error;
      }catch(err){
        lastError = err;
      }
    }

    throw lastError || new Error("RPC " + name + " échouée");
  }

  async function getStoreContext(){
    const ctx = await requireContext();
    if(!ctx.ok) return ctx;
    if(!ctx.slug) return asError("Identifiant boutique manquant.",{context:ctx});

    try{
      const data = await rpcFirstSuccess(RPCS.GET_STORE_CONTEXT,[
        {p_slug:ctx.slug},
        {slug:ctx.slug},
        {input_slug:ctx.slug}
      ]);

      return {ok:true,tool:"get_store_context",context:ctx,data};
    }catch(err){
      return asError("Contexte boutique indisponible.",{
        detail:err?.message || String(err),
        context:ctx
      });
    }
  }

  async function getSubscription(){
    const ctx = await requireAccess();
    if(!ctx.ok) return ctx;
    if(!ctx.phone) return asError("Compte non reconnu.",{context:ctx});

    try{
      const data = await rpcFirstSuccess(RPCS.GET_SUBSCRIPTION,[
        {p_phone:ctx.phone,p_module:MODULE},
        {phone:ctx.phone,module:MODULE}
      ]);

      return {ok:true,tool:"get_subscription",context:ctx,data};
    }catch(err){
      return asError("Abonnement indisponible.",{
        detail:err?.message || String(err),
        context:ctx
      });
    }
  }

  async function getDashboardStats(){
    const ctx = await requireAccess();
    if(!ctx.ok) return ctx;
    if(!ctx.phone) return asError("Compte non reconnu.",{context:ctx});

    try{
      const data = await rpcFirstSuccess(RPCS.GET_DASHBOARD_STATS,[
        {p_phone:ctx.phone,p_module:MODULE},
        {phone:ctx.phone,module:MODULE}
      ]);

      return {ok:true,tool:"get_dashboard_stats",context:ctx,data};
    }catch(err){
      return asError("Stats indisponibles.",{
        detail:err?.message || String(err),
        context:ctx
      });
    }
  }

  async function getBoostStatus(){
    const ctx = await requireAccess();
    if(!ctx.ok) return ctx;
    if(!ctx.phone) return asError("Compte non reconnu.",{context:ctx});

    try{
      const data = await rpcFirstSuccess(RPCS.GET_BOOST_STATUS,[
        {p_phone:ctx.phone},
        {phone:ctx.phone}
      ]);

      return {ok:true,tool:"get_boost_status",context:ctx,data};
    }catch(err){
      return asError("Boost indisponible.",{
        detail:err?.message || String(err),
        context:ctx
      });
    }
  }

  async function buildPayUrl(payload){
    const ctx = await requireContext();
    if(!ctx.ok) return ctx;

    const url = new URL(ABOS_URL);
    url.searchParams.set("module",MODULE);
    if(ctx.slug) url.searchParams.set("commerce",ctx.slug);

    const plan = payload && payload.plan ? String(payload.plan) : "";
    if(plan) url.searchParams.set("plan",plan);

    return {
      ok:true,
      tool:"build_pay_url",
      context:ctx,
      url:url.toString()
    };
  }

  async function openHome(){
    return {ok:true,url:cleanInternalPath(PATHS.home)};
  }

  async function openCaisse(){
    return {ok:true,url:cleanInternalPath(PATHS.caisse)};
  }

  async function openAdmin(){
    return {ok:true,url:cleanInternalPath(PATHS.admin)};
  }

  async function openArticles(){
    return {ok:true,url:cleanInternalPath(PATHS.articles)};
  }

  async function openProfile(){
    return {ok:true,url:cleanInternalPath(PATHS.profile)};
  }

  async function openQr(){
    return {ok:true,url:cleanInternalPath(PATHS.qr)};
  }

  async function openPin(){
    return {ok:true,url:cleanInternalPath(PATHS.pin)};
  }

  async function openDashboard(){
    return {ok:true,url:cleanInternalPath(PATHS.home)};
  }

  async function snapshot(){
    const ctx = await getContext();

    return {
      guard_loaded:!!window.DIGIY_GUARD,
      authenticated:!!ctx.access_ok,
      module:MODULE,
      slug:ctx.slug || "(aucun)",
      phone:ctx.phone ? "Compte reconnu" : "(aucun)",
      preview:!!ctx.preview,
      source:ctx.source || "none",
      tools:listTools().map(t => t.name)
    };
  }

  async function goTo(page){
    const key = String(page || "").trim().toLowerCase();

    const map = {
      home:"open_home",
      accueil:"open_home",
      comptoir:"open_home",
      caisse:"open_caisse",
      encaisser:"open_caisse",
      admin:"open_admin",
      articles:"open_articles",
      profile:"open_profile",
      fiche:"open_profile",
      qr:"open_qr",
      pin:"open_pin",
      acces:"open_pin",
      access:"open_pin",
      dashboard:"open_dashboard"
    };

    const action = map[key];
    if(!action) return asError("Navigation inconnue : " + page);

    const res = await runAction(action);
    if(res && res.url) location.href = res.url;
    return res;
  }

  const tools = {
    get_context:{
      description:"Retourne le contexte MON COMMERCE.",
      run:getContext
    },
    get_store_context:{
      description:"Charge le contexte boutique.",
      run:getStoreContext
    },
    get_subscription:{
      description:"Charge le statut abonnement.",
      run:getSubscription
    },
    get_dashboard_stats:{
      description:"Charge les stats si disponibles.",
      run:getDashboardStats
    },
    get_boost_status:{
      description:"Charge le statut boost si disponible.",
      run:getBoostStatus
    },
    build_pay_url:{
      description:"Construit l’URL d’activation.",
      run:buildPayUrl
    },
    open_home:{
      description:"Ouvre le comptoir.",
      run:openHome
    },
    open_caisse:{
      description:"Ouvre la caisse.",
      run:openCaisse
    },
    open_admin:{
      description:"Ouvre l’arrière-boutique.",
      run:openAdmin
    },
    open_articles:{
      description:"Ouvre les articles.",
      run:openArticles
    },
    open_profile:{
      description:"Ouvre la fiche commerce.",
      run:openProfile
    },
    open_qr:{
      description:"Ouvre le QR.",
      run:openQr
    },
    open_pin:{
      description:"Ouvre le code d’accès.",
      run:openPin
    },
    open_dashboard:{
      description:"Ancien dashboard → comptoir.",
      run:openDashboard
    }
  };

  function listTools(){
    return Object.entries(tools).map(([name,spec]) => ({
      name,
      description:spec.description
    }));
  }

  async function runAction(name,payload){
    const key = String(name || "").trim().toLowerCase();
    const tool = tools[key];

    if(!tool || typeof tool.run !== "function"){
      return asError("Action inconnue : " + name,{
        available:Object.keys(tools)
      });
    }

    try{
      return await tool.run(payload || {});
    }catch(err){
      return asError(err?.message || String(err),{tool:key});
    }
  }

  async function ready(){
    cleanVisibleUrl();
    const context = await getContext();

    return {
      ok:true,
      module:MODULE,
      context,
      tools:listTools()
    };
  }

  const API = {
    MODULE,
    PATHS,
    RPCS,
    ready,
    getContext,
    snapshot,
    listTools,
    runAction,
    tools,
    goTo,
    cleanVisibleUrl,
    cleanInternalPath,
    normSlug,
    normPhone
  };

  window.DIGIY_CLAW_POS = API;
  window.CLAW_POS = API;

  cleanVisibleUrl();

  console.info(
    "[CLAW_POS clean] chargé —",
    window.DIGIY_GUARD ? "guard présent ✓" : "guard absent ✗"
  );
})();
