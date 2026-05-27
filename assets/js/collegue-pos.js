/* DIGIY POS — COLLÈGUE DE COMPTOIR
   La caisse ne remplace pas le commerçant.
   Elle devient son collègue de comptoir.
   Elle parle seulement après un clic humain.
*/
(function(){
  "use strict";

  const VERSION = "collegue-pos-20260527-cloture-1";
  const CLOTURE_PREFIX = "caisse_cloture_";
  const PAY_ACTION_URL = "https://pro-pay.digiylyfe.com/action.html";

  function readJSON(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(_){
      return fallback;
    }
  }

  function money(n){
    return (Number(n) || 0).toLocaleString("fr-FR") + " F";
  }

  function todayISO(){
    return new Date().toISOString().slice(0,10);
  }

  function ventes(){
    const list = readJSON("caisse_ventes", []);
    return Array.isArray(list) ? list : [];
  }

  function ventesDuJour(){
    const d = todayISO();
    return ventes().filter(v => String(v.day || String(v.date || "").slice(0,10)) === d);
  }

  function ventesParJour(){
    const map = {};
    ventes().forEach(v => {
      const day = String(v.day || String(v.date || "").slice(0,10) || "").slice(0,10);
      if(!day) return;
      if(!map[day]) map[day] = [];
      map[day].push(v);
    });
    return map;
  }

  function clotureKey(day){
    return CLOTURE_PREFIX + String(day || todayISO()).slice(0,10);
  }

  function clotureLue(day){
    return readJSON(clotureKey(day), null);
  }

  function normalizeMode(v){
    const raw = String(
      v && (
        v.payLabel ||
        v.paymentLabel ||
        v.channel ||
        v.payment ||
        v.pay ||
        v.mode ||
        ""
      ) || ""
    ).toLowerCase();

    if(raw.includes("wave")) return "wave";
    if(raw.includes("orange")) return "orange";
    if(raw.includes("carte") || raw.includes("tpe") || raw.includes("card") || raw.includes("crd")) return "card";
    if(raw.includes("esp") || raw.includes("cash") || raw.includes("liquide")) return "cash";

    if(raw === "esp") return "cash";
    if(raw === "crd") return "card";

    return "cash";
  }

  function modeLabel(mode){
    return ({
      cash:"Cash",
      wave:"Wave",
      orange:"Orange Money",
      card:"Carte / TPE",
      other:"Autres"
    })[mode] || "Cash";
  }

  function calculClotureJour(day){
    const target = String(day || todayISO()).slice(0,10);
    const list = ventes().filter(v => String(v.day || String(v.date || "").slice(0,10)) === target);

    const totals = { cash:0, wave:0, orange:0, card:0, other:0 };
    list.forEach(v => {
      const mode = normalizeMode(v);
      const total = Number(v.total || v.totalAmount || v.amount || 0);
      totals[totals.hasOwnProperty(mode) ? mode : "other"] += total;
    });

    const totalGeneral = Object.values(totals).reduce((s,n) => s + Number(n || 0), 0);
    const closureRef = "POS-CLOTURE-" + target.replace(/[^0-9A-Za-z]/g,"") + "-" + String(list.length).padStart(3,"0");

    return {
      id: closureRef,
      closureRef,
      source: "POS_CLOSURE",
      module: "PAY",
      day: target,
      date: target,
      count: list.length,
      total: totalGeneral,
      totals,
      createdAt: new Date().toISOString(),
      status: clotureLue(target)?.status || "draft"
    };
  }

  function joursNonClotures(){
    const today = todayISO();
    const map = ventesParJour();
    return Object.keys(map)
      .filter(day => day < today && map[day] && map[day].length && !clotureLue(day))
      .sort();
  }

  function clotureDejaEnvoyee(day){
    const c = clotureLue(day);
    return !!(c && (c.status === "sent_to_pay" || c.sentToPayAt));
  }

  function saveCloture(closure, status){
    const clean = {
      ...closure,
      status: status || closure.status || "closed_local",
      savedAt: new Date().toISOString()
    };
    try{
      localStorage.setItem(clotureKey(clean.day), JSON.stringify(clean));
      localStorage.setItem("caisse_last_cloture", JSON.stringify(clean));
      localStorage.setItem("caisse_cloture_touch", String(Date.now()));
    }catch(_){}
    return clean;
  }

  function buildPayClosureUrl(closure){
    const url = new URL(PAY_ACTION_URL);
    url.searchParams.set("from", "POS_CLOSURE");
    url.searchParams.set("date", closure.day);
    url.searchParams.set("closureRef", closure.closureRef || closure.id || "");
    url.searchParams.set("count", String(closure.count || 0));
    url.searchParams.set("total", String(Math.round(Number(closure.total || 0))));
    url.searchParams.set("cash", String(Math.round(Number(closure.totals?.cash || 0))));
    url.searchParams.set("wave", String(Math.round(Number(closure.totals?.wave || 0))));
    url.searchParams.set("orange", String(Math.round(Number(closure.totals?.orange || 0))));
    url.searchParams.set("card", String(Math.round(Number(closure.totals?.card || 0))));
    url.searchParams.set("other", String(Math.round(Number(closure.totals?.other || 0))));
    url.searchParams.set("category", "Clôture caisse POS");
    url.searchParams.set("who", "MON COMMERCE POS");
    return url.toString();
  }

  function phraseCloture(closure){
    const t = closure.totals || {};
    return [
      "Clôture caisse du " + closure.day + ".",
             "Nombre de ventes : " + closure.count + ".",
      "Cash : " + Math.round(t.cash || 0) + " francs.",
      "Wave : " + Math.round(t.wave || 0) + " francs.",
      "Orange Money : " + Math.round(t.orange || 0) + " francs.",
      "Carte : " + Math.round(t.card || 0) + " francs.",
      Number(t.other || 0) ? "Autres : " + Math.round(t.other || 0) + " francs." : "",
      "Total recette boutique : " + Math.round(closure.total || 0) + " francs.",
      "Le pro vérifie, puis envoie à PAY."
    ].filter(Boolean).join(" ");
  }

  function clotureRowsHTML(closure){
    const t = closure.totals || {};
    const rows = [
      ["Cash", t.cash],
      ["Wave", t.wave],
      ["Orange Money", t.orange],
      ["Carte / TPE", t.card],
      ["Autres", t.other]
    ];

    return rows.map(([label,value]) => {
      const n = Number(value || 0);
      const muted = n <= 0 ? "opacity:.55" : "";
      return `
        <div style="${muted};display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.10);font-weight:1000">
          <span>${label}</span>
          <b>${money(n)}</b>
        </div>
      `;
    }).join("");
  }

  function renderClotureBox(day){
    const box = document.getElementById("cloturePosBox");
    if(!box) return;

    const closure = calculClotureJour(day || todayISO());
    const missed = joursNonClotures();
    const saved = clotureLue(closure.day);

    const warning = missed.length ? `
      <div style="margin-top:10px;padding:10px 12px;border-radius:16px;background:rgba(250,204,21,.14);border:1px solid rgba(250,204,21,.28);color:#fff3cf;font-weight:1000;line-height:1.35">
        ⚠️ Journée précédente non clôturée : ${missed.slice(-3).join(", ")}.
      </div>
    ` : "";

    box.innerHTML = `
      <div class="section-title">🌙 Clôture caisse du jour</div>
      <p style="font-weight:900;color:var(--muted);line-height:1.4;margin-top:0">
        POS garde les ventes et les articles. En fin de journée, PAY reçoit la recette consolidée par mode de paiement.
      </p>

      ${warning}

      <div style="margin-top:12px;padding:12px;border-radius:18px;background:#0b1d12;color:white;border:1px solid rgba(244,200,106,.20)">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;font-weight:1000;color:#f4c86a">
          <span>${closure.day}</span>
          <span>${closure.count} vente${closure.count>1?"s":""}</span>
        </div>

        <div style="margin-top:8px">
          ${clotureRowsHTML(closure)}
        </div>

        <div style="display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(244,200,106,.24);font-weight:1000;font-size:18px">
          <span>Total recette boutique</span>
          <b style="color:#f4c86a">${money(closure.total)}</b>
        </div>

        <div style="margin-top:10px;color:rgba(255,255,255,.72);font-weight:900;font-size:13px;line-height:1.35">
          Statut : ${saved ? (saved.status === "sent_to_pay" ? "envoyée à PAY" : "clôture locale gardée") : "non clôturée"}
        </div>
      </div>

      <div class="actions" style="margin-top:12px">
        <button class="btn" type="button" id="btnClotureListen">🎧 Écouter clôture</button>
        <button class="btn" type="button" id="btnClotureRefresh">🔄 Relire</button>
        <button class="primary-btn" type="button" id="btnCloturePay">📤 Envoyer à PAY</button>
        <button class="btn" type="button" id="btnClotureLocal">✅ Marquer clôturée</button>
      </div>

      <div style="margin-top:12px;padding:12px;border-radius:18px;background:#102015;color:white;font-weight:900;line-height:1.35">
        Option B validée : une clôture visible, plusieurs mouvements PAY derrière — Cash, Wave, Orange Money, Carte.
      </div>
    `;

    document.getElementById("btnClotureListen")?.addEventListener("click", () => speak(phraseCloture(closure)));
    document.getElementById("btnClotureRefresh")?.addEventListener("click", () => renderClotureBox(closure.day));
    document.getElementById("btnClotureLocal")?.addEventListener("click", () => {
      saveCloture(closure, "closed_local");
      renderClotureBox(closure.day);
      toast("Clôture locale gardée.");
    });
    document.getElementById("btnCloturePay")?.addEventListener("click", () => envoyerCloturePay(closure));
  }

  function ouvrirCloture(){
    renderClotureBox(todayISO());
    const box = document.getElementById("cloturePosBox");
    if(box) box.scrollIntoView({behavior:"smooth", block:"start"});
  }

  function envoyerCloturePay(closure){
    const c = closure || calculClotureJour(todayISO());
    if(!c.count || !c.total){
      const ok = confirm("Aucune recette sur cette journée. Envoyer quand même une clôture zéro vers PAY ?");
      if(!ok) return;
    }

    if(clotureDejaEnvoyee(c.day)){
      const again = confirm("Cette journée semble déjà envoyée à PAY. Renvoyer quand même ?");
      if(!again) return;
    }

    const sent = saveCloture({...c, sentToPayAt:new Date().toISOString()}, "sent_to_pay");
    toast("Clôture prête pour PAY.");
    location.href = buildPayClosureUrl(sent);
  }

  function derniereVente(){
    return ventes()[0] || readJSON("caisse_last_vente", null);
  }

  function totalJour(){
    return ventesDuJour().reduce((s,v) => s + Number(v.total || 0), 0);
  }

  function plusGrosTicketJour(){
    const list = ventesDuJour();
    if(!list.length) return null;
    return list.reduce((best,v) => Number(v.total || 0) > Number(best.total || 0) ? v : best, list[0]);
  }

  function stockBas(){
    const prods = (typeof window.getProds === "function") ? window.getProds() : readJSON("caisse_prods", []);
    return (Array.isArray(prods) ? prods : []).filter(p => Number(p.stock || 0) > 0 && Number(p.stock || 0) <= 5);
  }

  function speak(text){
    if(!("speechSynthesis" in window)){
      alert(text);
      return;
    }

    try{
      speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 0.88;
      u.pitch = 1.02;
      u.volume = 1;

      const voices = speechSynthesis.getVoices() || [];
      const fr = voices.find(v => /^fr/i.test(v.lang));
      if(fr) u.voice = fr;

      speechSynthesis.speak(u);
    }catch(_){
      alert(text);
    }
  }

  function toast(msg){
    if(typeof window.showToast === "function") window.showToast(msg);
    else console.log("DIGIY POS:", msg);
  }

  function phraseAccueil(){
         const total = totalJour();
    const last = derniereVente();
    const low = stockBas();

    let text = "Bonjour. Caisse prête. Aujourd’hui peut être une belle journée business. On vend proprement, on garde la trace, on avance.";

    if(last && Number(last.total || 0) > 0){
      text += " Dernière vente enregistrée : " + Math.round(Number(last.total || 0)) + " francs.";
    }

    if(total > 0){
      text += " Total du jour actuel : " + Math.round(total) + " francs.";
    }

    if(low.length){
      text += " Attention. " + low.length + " marchandise" + (low.length > 1 ? "s" : "") + " en stock bas.";
    }

    const missed = joursNonClotures();
    if(missed.length){
      text += " Attention. Une journée précédente n'est pas clôturée : " + missed[missed.length - 1] + ".";
    }

    return text;
  }

  function lireDerniereVente(){
    const v = derniereVente();
    if(!v){
      speak("Aucune dernière vente enregistrée pour le moment.");
      return;
    }

    const items = Array.isArray(v.items) ? v.items : [];
    const detail = items.slice(0,3).map(i => {
      return (i.name || "article") + " fois " + Number(i.qty || 1);
    }).join(", ");

    speak(
      "Dernière vente : " +
      Math.round(Number(v.total || 0)) +
      " francs. " +
      (detail ? "Détail : " + detail + "." : "")
    );
  }

  function lirePlusGrosTicket(){
    const v = plusGrosTicketJour();
    if(!v){
      speak("Aucun ticket enregistré aujourd’hui pour le moment.");
      return;
    }

    speak("Plus gros ticket du jour : " + Math.round(Number(v.total || 0)) + " francs.");
  }

  function lireTotalJour(){
    const total = totalJour();
    if(!total){
      speak("Total du jour : zéro franc pour le moment. La journée commence.");
      return;
    }

    speak("Total du jour : " + Math.round(total) + " francs.");
  }

  function lireStockBas(){
    const low = stockBas();

    if(!low.length){
      speak("Stock vérifié. Rien d’urgent pour le moment.");
      return;
    }

    const noms = low.slice(0,5).map(p => p.name + ", reste " + Number(p.stock || 0)).join(". ");
    speak("Attention stock bas. " + noms + ".");
  }

  function injectUI(){
    const page = document.getElementById("page-caisse");
    if(!page || document.getElementById("colleguePosBlock")) return;

    const box = document.createElement("section");
    box.id = "colleguePosBlock";
    box.className = "card";
    box.style.marginTop = "12px";

    box.innerHTML = `
      <div class="section-title">🌅 Collègue POS</div>
      <p style="font-weight:900;color:var(--muted);line-height:1.4;margin-top:0">
        La caisse ne remplace pas le commerçant. Elle devient son collègue de comptoir.
      </p>

      <div class="actions">
        <button class="primary-btn" type="button" id="btnCollegueStart">🌅 Commencer la journée</button>
        <button class="btn" type="button" id="btnCollegueLast">🧾 Dernière vente</button>
        <button class="btn" type="button" id="btnCollegueBig">🏆 Plus gros ticket</button>
        <button class="btn" type="button" id="btnCollegueTotal">📊 Total du jour</button>
        <button class="btn" type="button" id="btnCollegueStock">🔔 Stock bas</button>
        <button class="primary-btn" type="button" id="btnCollegueCloture">🌙 Clôture caisse</button>
      </div>

      <div style="margin-top:12px;padding:12px;border-radius:18px;background:#102015;color:white;font-weight:900;line-height:1.35">
        Le matin, elle accueille. Pendant la journée, elle accompagne. En fin de journée, elle aide à clôturer la caisse vers PAY. Mais le pro garde la main.
      </div>

      <div id="cloturePosBox" style="margin-top:12px"></div>
    `;

    const anchor =
  page.querySelector(".pos-sale-panel") ||
  page.querySelector(".pos-departments") ||
  page.querySelector(".manual-products") ||
  page.firstElementChild;

if(anchor && anchor.nextSibling){
  page.insertBefore(box, anchor.nextSibling);
}else if(anchor){
  page.appendChild(box);
}else{
  page.appendChild(box);
}

    document.getElementById("btnCollegueStart")?.addEventListener("click", function(){
      speak(phraseAccueil());
      toast("Collègue POS réveillé.");
    });

    document.getElementById("btnCollegueLast")?.addEventListener("click", lireDerniereVente);
    document.getElementById("btnCollegueBig")?.addEventListener("click", lirePlusGrosTicket);
    document.getElementById("btnCollegueTotal")?.addEventListener("click", lireTotalJour);
    document.getElementById("btnCollegueStock")?.addEventListener("click", lireStockBas);
    document.getElementById("btnCollegueCloture")?.addEventListener("click", ouvrirCloture);

    renderClotureBox(todayISO());
  }

  function boot(){
    setTimeout(injectUI, 250);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  }else{
    boot();
  }

  window.DIGIY_COLLEGUE_POS = {
    version: VERSION,
    parler: speak,
    accueil: phraseAccueil,
    derniereVente: lireDerniereVente,
    plusGrosTicket: lirePlusGrosTicket,
    totalJour: lireTotalJour,
    stockBas: lireStockBas,
    ouvrirCloture: ouvrirCloture,
    calculClotureJour: calculClotureJour,
    envoyerCloturePay: envoyerCloturePay
  };
})();
