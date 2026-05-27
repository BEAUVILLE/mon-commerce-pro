/* DIGIY ACTION → CAISSE POS
   Petite passerelle séparée : lit la traçabilité ACTION POS et la met dans l’addition.
   Ne remplace pas caisse.html. Ne déclenche jamais encaisser().
*/
(function(){
  "use strict";
  const VERSION = "action-trace-to-caisse-20260527-1";
  const TRACE_KEYS = ["DIGIY_POS_CAISSE_TRACE", "caisse_action_last_trace"];
  let loadedId = null;

  function readJSON(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(_){ return fallback; }
  }

  function removeTrace(){
    try{
      localStorage.removeItem("DIGIY_POS_CAISSE_TRACE");
      localStorage.removeItem("caisse_action_last_trace");
      localStorage.removeItem("caisse_action_trace_touch");
    }catch(_){}
  }

  function toast(msg){
    if(typeof window.showToast === "function") window.showToast(msg);
    else console.log("DIGIY POS:", msg);
  }

  function norm(v){
    return String(v || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ")
      .replace(/\b(de|du|des|la|le|les|un|une|a|à)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function singular(t){
    t = String(t || "").trim();
    return t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
  }

  function tokens(v){
    return norm(v).split(" ").map(singular).filter(x => x && x.length > 1);
  }

  function score(trace, product){
    const wanted = tokens((trace && (trace.item || trace.note)) || "");
    const prod = tokens((product && product.name) || "");
    if(!wanted.length || !prod.length) return 0;
    let s = 0;
    prod.forEach(t => {
      if(wanted.includes(t)) s += 4;
      else if(wanted.some(w => w.includes(t) || t.includes(w))) s += 2;
    });
    wanted.forEach(t => { if(prod.includes(t)) s += 2; });
    const tracePrice = Number(trace.unitPrice || 0);
    const productPrice = Number(product.price || 0);
    if(tracePrice && productPrice && tracePrice === productPrice) s += 6;
    if(norm(trace.item).includes(norm(product.name))) s += 5;
    if(norm(product.name).includes(norm(trace.item))) s += 4;
    return s;
  }

  function findProduct(trace){
    if(typeof window.getProds !== "function") return null;
    const prods = window.getProds() || [];
    let best = null, bestScore = 0;
    prods.forEach(p => {
      const s = score(trace, p);
      if(s > bestScore){ best = p; bestScore = s; }
    });
    return bestScore >= 5 ? best : null;
  }

  function buildLine(trace){
    const product = findProduct(trace);
    const qty = Math.max(1, Number(trace.quantity || 1));
    const price = Number(trace.unitPrice || trace.price || 0);
    if(product){
      return {
        ...product,
        qty,
        price: price || Number(product.price || 0),
        actionTraceId: trace.id || "ACTION_TRACE",
        actionTraceNote: trace.note || "",
        actionTraceSource: "ACTION_DIGIY"
      };
    }
    return {
      id: "action_trace_" + (trace.id || Date.now()),
      source_id: "ACTION_DIGIY",
      name: trace.item || "Article ACTION",
      cat: "ACTION DIGIY",
      emoji: "🎙️",
      price,
      stock: 999999,
      published: true,
      qty,
      actionTraceId: trace.id || "ACTION_TRACE",
      actionTraceNote: trace.note || "",
      actionTraceSource: "ACTION_DIGIY"
    };
  }

  function getTrace(){
    for(const key of TRACE_KEYS){
      const t = readJSON(key, null);
      if(t && typeof t === "object") return t;
    }
    return null;
  }

  function applyPayment(trace){
    if(typeof window.selPay !== "function" || !trace || !trace.channel) return;
    const m = String(trace.channel || "").toLowerCase();
    if(m.includes("wave")) window.selPay("wave");
    else if(m.includes("orange")) window.selPay("orange");
    else if(m.includes("cash") || m.includes("esp")) window.selPay("esp");
  }

  function importTrace(){
    const trace = getTrace();
    if(!trace || !trace.id) return false;
    if(loadedId === trace.id) return false;
    if(typeof cart === "undefined" || !Array.isArray(cart)){
      toast("Caisse pas encore prête pour ACTION.");
      return false;
    }

    const already = cart.find(i => String(i.actionTraceId || "") === String(trace.id));
    if(already){ loadedId = trace.id; return false; }

    const line = buildLine(trace);
    if(!line || !Number(line.price || 0)){
      toast("Trace ACTION reçue, prix à vérifier.");
      return false;
    }

    cart.push(line);
    loadedId = trace.id;

    try{ window.updatePanierBar && window.updatePanierBar(); }catch(_){}
    try{ window.renderAddition && window.renderAddition(); }catch(_){}
    try{ window.updateTotals && window.updateTotals(); }catch(_){}
    try{ applyPayment(trace); }catch(_){}
    try{ window.showPage && window.showPage("page-caisse"); }catch(_){}

    setTimeout(function(){
      try{ window.openAddition && window.openAddition(); }catch(_){}
      toast("Traçabilité ACTION chargée dans l’addition POS.");
    }, 120);

    return true;
  }

  function boot(){
    setTimeout(importTrace, 220);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.DIGIY_ACTION_TRACE_TO_CAISSE = {
    version: VERSION,
    importTrace,
    clearTrace: removeTrace
  };
})();
