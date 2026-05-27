/* DIGIY ACTION → CAISSE POS
   Petite passerelle séparée : lit la traçabilité ACTION POS et la met dans l’addition.
   Ne remplace pas caisse.html. Ne déclenche jamais encaisser().
   V2 : une trace est consommée une seule fois, puis retirée du moule.
*/
(function(){
  "use strict";
  const VERSION = "action-trace-to-caisse-20260527-2";
  const TRACE_KEYS = ["DIGIY_POS_CAISSE_TRACE", "caisse_action_last_trace"];
  const CONSUMED_KEY = "caisse_action_consumed_trace_id";
  const CONSUMED_AT_KEY = "caisse_action_consumed_trace_at";
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

  function markConsumed(trace){
    try{
      localStorage.setItem(CONSUMED_KEY, String(trace && trace.id || ""));
      localStorage.setItem(CONSUMED_AT_KEY, String(Date.now()));
    }catch(_){}
  }

  function isConsumed(trace){
    if(!trace || !trace.id) return false;
    try{
      return String(localStorage.getItem(CONSUMED_KEY) || "") === String(trace.id);
    }catch(_){ return false; }
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

    if(isConsumed(trace)){
      removeTrace();
      return false;
    }

    if(loadedId === trace.id){
      removeTrace();
      return false;
    }

    if(typeof cart === "undefined" || !Array.isArray(cart)){
      toast("Caisse pas encore prête pour ACTION.");
      return false;
    }

    const already = cart.find(i => String(i.actionTraceId || "") === String(trace.id));
    if(already){
      loadedId = trace.id;
      markConsumed(trace);
      removeTrace();
      return false;
    }

    const line = buildLine(trace);
    if(!line || !Number(line.price || 0)){
      toast("Trace ACTION reçue, prix à vérifier.");
      return false;
    }

    cart.push(line);
    loadedId = trace.id;
    markConsumed(trace);
    removeTrace();

    try{ window.updatePanierBar && window.updatePanierBar(); }catch(_){}
    try{ window.renderAddition && window.renderAddition(); }catch(_){}
    try{ window.updateTotals && window.updateTotals(); }catch(_){}
    try{ applyPayment(trace); }catch(_){}
    try{ window.showPage && window.showPage("page-caisse"); }catch(_){}

    setTimeout(function(){
      try{ window.openAddition && window.openAddition(); }catch(_){}
      toast("Traçabilité ACTION chargée une fois dans l’addition POS.");
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
    clearTrace: removeTrace,
    markConsumed
  };
})();

/* DIGIY POS — PAGINATION PRODUITS 12 PAR PAGE
   Add-on non destructif : il arrive après caisse-pos.js et remplace seulement l'affichage des produits.
   Le panier, l'encaissement, les stats, les notes et PAY restent dans caisse-pos.js.
*/
(function(){
  "use strict";

  const VERSION = "pos-products-pagination-12-20260527-1";
  const PAGE_SIZE = 12;
  let productPage = 1;
  let lastFilterKey = "";

  function money(n){
    if(typeof window.fmt === "function") return window.fmt(n);
    return Math.round(Number(n)||0).toLocaleString("fr-FR") + " F";
  }

  function esc(v){
    if(typeof window.esc === "function") return window.esc(v);
    return String(v ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function getSelectedCategory(){
    try{ if(typeof selCat !== "undefined") return selCat || "Tous"; }catch(_){}
    return "Tous";
  }

  function getQuery(){
    const input = document.getElementById("searchInput");
    return String(input && input.value || "").toLowerCase().trim();
  }

  function filteredProducts(){
    const q = getQuery();
    const cat = getSelectedCategory();
    const prods = (typeof window.getProds === "function") ? window.getProds() : [];
    return (Array.isArray(prods) ? prods : []).filter(p => {
      const okCat = cat === "Tous" || p.cat === cat;
      const okQuery = !q || String(p.name || "").toLowerCase().includes(q);
      return okCat && okQuery;
    });
  }

  function ensurePager(grid){
    let pager = document.getElementById("prodsPager");
    if(!pager && grid){
      pager = document.createElement("div");
      pager.id = "prodsPager";
      pager.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 0;padding:10px;border-radius:18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#fff;font-weight:1000";
      grid.insertAdjacentElement("afterend", pager);
    }
    return pager;
  }

  function productCard(p){
    return `
      <div class="pcard${Number(p.stock)<=0 ? " oos" : ""}" onclick="addToCart(${Number(p.id)})">
        <span class="stk-badge ${Number(p.stock)<=5 ? "stk-low" : "stk-ok"}">${Number(p.stock)||0}</span>
        <div class="pcard-emoji">${esc(p.emoji || "📦")}</div>
        <div class="pcard-name">${esc(p.name)}</div>
        <div class="pcard-price">${money(p.price)}</div>
      </div>`;
  }

  function renderPager(pager, totalPages, totalItems){
    if(!pager) return;
    if(totalPages <= 1){
      pager.innerHTML = `<span>${totalItems} produit${totalItems>1?"s":""}</span>`;
      return;
    }

    pager.innerHTML = `
      <button class="btn" type="button" id="prodsPrev" ${productPage<=1 ? "disabled" : ""}>← Précédent</button>
      <span>Page ${productPage}/${totalPages} · ${totalItems} produits</span>
      <button class="btn" type="button" id="prodsNext" ${productPage>=totalPages ? "disabled" : ""}>Suivant →</button>
    `;

    const prev = document.getElementById("prodsPrev");
    const next = document.getElementById("prodsNext");

    if(prev){
      prev.onclick = function(){
        productPage = Math.max(1, productPage - 1);
        renderProdsPaginated();
      };
    }

    if(next){
      next.onclick = function(){
        productPage = Math.min(totalPages, productPage + 1);
        renderProdsPaginated();
      };
    }
  }

  function renderProdsPaginated(){
    const grid = document.getElementById("prodsGrid");
    if(!grid) return;

    const cat = getSelectedCategory();
    const q = getQuery();
    const key = cat + "::" + q;
    if(key !== lastFilterKey){
      productPage = 1;
      lastFilterKey = key;
    }

    const items = filteredProducts();
    const pager = ensurePager(grid);

    if(!items.length){
      grid.innerHTML = `<div style="grid-column:1/-1" class="no-data">Aucune marchandise encore. Va dans Marchandises pour programmer tes articles, ou charge un exemple métier si tu veux tester.</div>`;
      if(pager) pager.innerHTML = "";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    if(productPage > totalPages) productPage = totalPages;

    const start = (productPage - 1) * PAGE_SIZE;
    const pageItems = items.slice(start, start + PAGE_SIZE);

    grid.innerHTML = pageItems.map(productCard).join("");
    renderPager(pager, totalPages, items.length);
  }

  function patchSearch(){
    const input = document.getElementById("searchInput");
    if(!input || input.dataset.paginationPatched === "1") return;
    input.dataset.paginationPatched = "1";
    input.addEventListener("input", function(){
      productPage = 1;
      setTimeout(renderProdsPaginated, 0);
    });
  }

  function patchCats(){
    const bar = document.getElementById("catsBar");
    if(!bar || bar.dataset.paginationPatched === "1") return;
    bar.dataset.paginationPatched = "1";
    bar.addEventListener("click", function(){
      productPage = 1;
      setTimeout(renderProdsPaginated, 0);
    }, true);
  }

  function patchGlobals(){
    window.renderProds = renderProdsPaginated;
    try{ renderProds = renderProdsPaginated; }catch(_){}

    const oldBuildCats = window.buildCats;
    if(typeof oldBuildCats === "function" && !oldBuildCats.__digiyPaginationPatched){
      const wrapped = function(){
        const out = oldBuildCats.apply(this, arguments);
        patchCats();
        productPage = 1;
        setTimeout(renderProdsPaginated, 0);
        return out;
      };
      wrapped.__digiyPaginationPatched = true;
      window.buildCats = wrapped;
      try{ buildCats = wrapped; }catch(_){}
    }
  }

  function boot(){
    patchGlobals();
    patchSearch();
    patchCats();
    setTimeout(renderProdsPaginated, 80);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.DIGIY_POS_PRODUCTS_PAGINATION = {
    version: VERSION,
    pageSize: PAGE_SIZE,
    render: renderProdsPaginated,
    reset(){ productPage = 1; renderProdsPaginated(); },
    next(){ productPage += 1; renderProdsPaginated(); },
    prev(){ productPage = Math.max(1, productPage - 1); renderProdsPaginated(); }
  };
})();

/* DIGIY POS — RETOUR HUB POS FIXE
   La caisse peut scroller longtemps : le retour HUB doit rester visible.
*/
(function(){
  "use strict";
  const VERSION = "hub-pos-return-fixed-20260527-1";

  function injectHubReturn(){
    if(document.getElementById("digiyHubPosFloat")) return;

    const a = document.createElement("a");
    a.id = "digiyHubPosFloat";
    a.href = "./hub.html";
    a.setAttribute("aria-label", "Retourner au HUB POS");
    a.textContent = "🧭 HUB POS";
    a.style.cssText = [
      "position:fixed",
      "right:12px",
      "top:78px",
      "z-index:120",
      "min-height:44px",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "gap:6px",
      "padding:10px 14px",
      "border-radius:999px",
      "background:linear-gradient(135deg,#ffe8a8,#f4c86a)",
      "color:#102015",
      "border:1px solid rgba(255,255,255,.55)",
      "box-shadow:0 12px 28px rgba(0,0,0,.24)",
      "font-weight:1000",
      "font-size:14px",
      "text-decoration:none"
    ].join(";");

    document.body.appendChild(a);
  }

  function boot(){ setTimeout(injectHubReturn, 120); }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.DIGIY_POS_HUB_RETURN = { version: VERSION, inject: injectHubReturn };
})();
