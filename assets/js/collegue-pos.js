/* DIGIY POS — COLLÈGUE DE COMPTOIR
   La caisse ne remplace pas le commerçant.
   Elle devient son collègue de comptoir.
   Elle parle seulement après un clic humain.
*/
(function(){
  "use strict";

  const VERSION = "collegue-pos-20260527-1";

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
      </div>

      <div style="margin-top:12px;padding:12px;border-radius:18px;background:#102015;color:white;font-weight:900;line-height:1.35">
        Le matin, elle accueille. Pendant la journée, elle accompagne. Après la vente, elle confirme. Mais le pro garde la main.
      </div>
    `;

    const anchor = page.querySelector(".hero");
    if(anchor && anchor.nextSibling){
      page.insertBefore(box, anchor.nextSibling);
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
    stockBas: lireStockBas
  };
})();
