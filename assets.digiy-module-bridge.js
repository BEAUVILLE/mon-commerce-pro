/* DIGIYLYFE — Pont session commun
   Invisible pour le pro : il garde les infos utiles côté téléphone
   et nettoie les liens sensibles affichés à l'écran. */
(function(){
  "use strict";
  const MODULE = String(window.DIGIY_MODULE || "POS").toUpperCase();
  const PREFIX = "DIGIY_" + MODULE + "_";
  const SENSITIVE = [
    "phone","tel","p_phone","owner_phone","subscription_phone","checkout_phone",
    "pin","pin4","token","session_token","module","return","redirect","redirect_url","url","from","v"
  ];
  const SLUG_KEYS = ["digiy_pos_slug","digiy_pos_last_slug",PREFIX+"SLUG"];
  const PHONE_KEYS = ["digiy_pos_phone","digiy_pos_last_phone",PREFIX+"PHONE"];
  const SESSION_KEYS = [PREFIX+"PIN_SESSION",PREFIX+"SESSION","DIGIY_PIN_SESSION","DIGIY_ACCESS","digiy_pos_session"];

  function normPhone(v){ return String(v || "").replace(/[^\d]/g,"").slice(0,15); }
  function normSlug(v){
    return String(v || "").trim().toLowerCase()
      .replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"")
      .replace(/-+/g,"-").replace(/^-|-$/g,"");
  }
  function readJSON(raw){ try{return JSON.parse(raw)}catch(_){return null} }
  function setBoth(k,v){ try{sessionStorage.setItem(k,v)}catch(_){} try{localStorage.setItem(k,v)}catch(_){} }
  function first(keys){
    for(const k of keys){
      try{
        const v = sessionStorage.getItem(k) || localStorage.getItem(k) || "";
        if(v) return v;
      }catch(_){}
    }
    return "";
  }
  function writeSession(data){
    const safe = Object.assign({}, data || {}, { module: MODULE, saved_at: Date.now() });
    try{ sessionStorage.setItem(PREFIX+"SESSION", JSON.stringify(safe)); }catch(_){}
    if(safe.slug) setBoth("digiy_pos_last_slug", normSlug(safe.slug));
    if(safe.phone) setBoth("digiy_pos_last_phone", normPhone(safe.phone));
    return safe;
  }
  function readSession(){
    for(const k of SESSION_KEYS){
      const obj = readJSON(first([k]));
      if(obj && typeof obj === "object") return obj;
    }
    const slug = normSlug(first(SLUG_KEYS));
    const phone = normPhone(first(PHONE_KEYS));
    return { module: MODULE, slug, phone };
  }
  function captureFromUrl(){
    try{
      const u = new URL(location.href);
      const slug = normSlug(u.searchParams.get("slug") || u.searchParams.get("commerce") || "");
      const phone = normPhone(u.searchParams.get("phone") || u.searchParams.get("tel") || u.searchParams.get("p_phone") || u.searchParams.get("owner_phone") || "");
      if(slug) SLUG_KEYS.forEach(k=>setBoth(k,slug));
      if(phone) PHONE_KEYS.forEach(k=>setBoth(k,phone));
      if(slug || phone) writeSession(Object.assign(readSession(), {slug, phone}));
    }catch(_){}
  }
  function cleanUrl(){
    try{
      const u = new URL(location.href);
      let changed = false;
      SENSITIVE.concat(["slug","commerce","owner_id"]).forEach(k=>{
        if(u.searchParams.has(k)){ u.searchParams.delete(k); changed = true; }
      });
      if(changed) history.replaceState({}, document.title, u.pathname + u.search + u.hash);
    }catch(_){}
  }
  function set(k,v){ try{ localStorage.setItem("digiy_"+MODULE.toLowerCase()+"_"+k, JSON.stringify(v)); return true; }catch(_){ return false; } }
  function get(k, fallback){
    try{
      const raw = localStorage.getItem("digiy_"+MODULE.toLowerCase()+"_"+k);
      return raw ? JSON.parse(raw) : fallback;
    }catch(_){ return fallback; }
  }
  captureFromUrl();
  cleanUrl();
  window.DIGIY_MODULE_BRIDGE = { module: MODULE, readSession, writeSession, cleanUrl, captureFromUrl, get, set, normPhone, normSlug };
})();
