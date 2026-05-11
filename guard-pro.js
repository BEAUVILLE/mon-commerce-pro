// guard-pro.js — compatibilité MON COMMERCE PRO
// Le vrai garde est guard.js.
// Ce fichier existe seulement pour les anciennes pages qui appellent encore guard-pro.js.

(function(){
  "use strict";

  const GUARD_SRC = "./guard.js";
  let loading = null;

  function hasGuard(){
    return !!window.DIGIY_GUARD;
  }

  function loadGuard(){
    if(hasGuard()){
      return Promise.resolve(window.DIGIY_GUARD);
    }

    if(loading) return loading;

    loading = new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts || []).find(s => {
        return String(s.src || "").includes("guard.js");
      });

      if(existing){
        const wait = setInterval(() => {
          if(hasGuard()){
            clearInterval(wait);
            resolve(window.DIGIY_GUARD);
          }
        }, 40);

        setTimeout(() => {
          clearInterval(wait);
          hasGuard() ? resolve(window.DIGIY_GUARD) : reject(new Error("guard.js non prêt"));
        }, 5000);

        return;
      }

      const s = document.createElement("script");
      s.src = GUARD_SRC + "?v=pos-pro-compat";
      s.async = false;

      s.onload = () => {
        if(hasGuard()) resolve(window.DIGIY_GUARD);
        else reject(new Error("guard.js chargé mais DIGIY_GUARD absent"));
      };

      s.onerror = () => reject(new Error("Impossible de charger guard.js"));

      document.head.appendChild(s);
    });

    return loading;
  }

  async function ready(options){
    const guard = await loadGuard();

    if(typeof guard.ready === "function"){
      return guard.ready(options || {
        redirect:false,
        preserve_validation:true,
        allow_soft_session:true
      });
    }

    return { ok:false, reason:"guard_ready_missing" };
  }

  async function requireSession(options){
    const guard = await loadGuard();

    if(typeof guard.requireSession === "function"){
      return guard.requireSession(options || {});
    }

    const res = await ready(options || {});
    return res && res.session ? res.session : null;
  }

  function getSession(){
    if(hasGuard() && typeof window.DIGIY_GUARD.getSession === "function"){
      return window.DIGIY_GUARD.getSession();
    }

    return {
      module:"POS",
      access_ok:false,
      access:false,
      ok:false,
      slug:"",
      phone:"",
      reason:"guard_not_loaded",
      source:"guard-pro-bridge"
    };
  }

  function getSb(){
    if(hasGuard() && typeof window.DIGIY_GUARD.getSb === "function"){
      return window.DIGIY_GUARD.getSb();
    }

    return null;
  }

  async function verifyPin(phone,pin,slug){
    const guard = await loadGuard();

    if(typeof guard.verifyPin === "function"){
      return guard.verifyPin(phone,pin,slug);
    }

    return { ok:false, message:"verifyPin indisponible" };
  }

  async function loginWithPin(slug,pin){
    const guard = await loadGuard();

    if(typeof guard.loginWithPin === "function"){
      return guard.loginWithPin(slug,pin);
    }

    return { ok:false, message:"loginWithPin indisponible" };
  }

  function logout(to){
    if(hasGuard() && typeof window.DIGIY_GUARD.logout === "function"){
      return window.DIGIY_GUARD.logout(to);
    }

    location.href = to || "./pin.html";
  }

  window.DIGIY_GUARD_PRO = {
    module:"POS",
    bridge:true,
    ready,
    boot:ready,
    requireSession,
    getSession,
    getSb,
    verifyPin,
    loginWithPin,
    logout
  };

  // Compat ancien nom, sans écraser le vrai garde.
  window.guardPro = window.DIGIY_GUARD_PRO;

  document.addEventListener("DOMContentLoaded", function(){
    ready({ redirect:false, preserve_validation:true, allow_soft_session:true }).catch(function(err){
      console.warn("[guard-pro bridge]", err && err.message ? err.message : err);
    });
  });
})();
