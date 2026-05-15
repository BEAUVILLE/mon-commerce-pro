/*
  DIGIY OREILLE MÉTIER — POS / COMMERCE V1
  Doctrine : Tu parles de l’action à DIGIY. DIGIY prépare. Tu valides. Ton assistant métier s’exécute.
  Sans API. Sans Supabase. Navigateur + règles terrain + validation humaine.
*/
(function(){
  "use strict";

  const BUILD = "oreille-metier-pos-v1-20260515";
  let lastDraft = null;
  let recognition = null;
  let listening = false;

  function $(id){ return document.getElementById(id); }
  function money(n){ return Math.round(Number(n||0)).toLocaleString("fr-FR") + " F"; }

  function esc(v){
    return String(v == null ? "" : v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/\"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function stripAccents(v){
    return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  }

  function norm(v){
    return stripAccents(String(v||"").toLowerCase())
      .replace(/[’']/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function toast(msg){
    if(typeof window.showToast === "function") window.showToast(msg);
    else alert(msg);
  }

  function products(){
    try{
      return typeof window.getProds === "function" ? window.getProds() : [];
    }catch(_){
      return [];
    }
  }

  function saveProducts(items){
    try{
      if(typeof window.saveProds === "function") window.saveProds(items);
    }catch(_){}
  }

  function getNotesSafe(){
    try{
      return typeof window.getNotes === "function"
        ? window.getNotes()
        : JSON.parse(localStorage.getItem("caisse_notes") || "[]");
    }catch(_){
      return [];
    }
  }

  function saveNotesSafe(notes){
    try{
      if(typeof window.saveNotes === "function") window.saveNotes(notes);
      else localStorage.setItem("caisse_notes", JSON.stringify(notes));
    }catch(_){}
  }

  function findProduct(name){
    const key = norm(name);
    if(!key) return null;

    const list = products();

    return list.find(p => norm(p.name) === key)
      || list.find(p => norm(p.name).includes(key) || key.includes(norm(p.name)))
      || null;
  }

  function nextProductId(list){
    return (list || []).reduce((m,p) => Math.max(m, Number(p.id) || 0), 0) + 1;
  }

  function extractAmount(text){
    const raw = String(text || "").replace(/\s+/g," ");
    const m = raw.match(/(\d[\d\s.,]*)\s*(?:f|fcfa|xof|francs?)?/i);
    if(!m) return 0;
    return Number(String(m[1]).replace(/[^\d]/g,"")) || 0;
  }

  function extractQty(text){
    const t = norm(text);
    const m = t.match(/\b(\d+)\s+(?:x\s+)?([a-z0-9\- ]{2,})/i);
    if(m) return Number(m[1]) || 1;
    return 1;
  }

  function cleanProductName(part){
    return String(part || "")
      .replace(/\b(ajoute|ajouter|article|stock|prix|vendu|vends|vend|j ai vendu|jai vendu|vente|panier|mets|met|a|à|de|du|des|fcfa|f|francs|cash|wave|orange|money|client|doit|dette|credit|crédit|vendeur|fin|mois|date|tel|telephone|téléphone)\b/gi," ")
      .replace(/\d+/g," ")
      .replace(/[.,;:!?]/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function parseDate(text){
    const t = norm(text);
    const d = new Date();

    function iso(x){
      const y = x.getFullYear();
      const m = String(x.getMonth() + 1).padStart(2,"0");
      const day = String(x.getDate()).padStart(2,"0");
      return `${y}-${m}-${day}`;
    }

    if(t.includes("fin du mois")) return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));

    if(t.includes("demain")){
      d.setDate(d.getDate() + 1);
      return iso(d);
    }

    const w = {
      dimanche:0,
      lundi:1,
      mardi:2,
      mercredi:3,
      jeudi:4,
      vendredi:5,
      samedi:6
    };

    for(const [name,target] of Object.entries(w)){
      if(t.includes(name)){
        let add = (target - d.getDay() + 7) % 7;
        if(add === 0) add = 7;
        d.setDate(d.getDate() + add);
        return iso(d);
      }
    }

    const m = String(text || "").match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);

    if(m){
      const year = m[3]
        ? Number(String(m[3]).length === 2 ? "20" + m[3] : m[3])
        : d.getFullYear();

      return iso(new Date(year, Number(m[2]) - 1, Number(m[1])));
    }

    return "";
  }

  function extractPhone(text){
    const m = String(text || "").match(/(?:tel|tél|telephone|téléphone|whatsapp|wa)\s*[:\-]?\s*([+0-9][0-9\s().-]{6,})/i);

    if(m && m[1]) return m[1].replace(/[^\d+]/g,"");

    const any = String(text || "").match(/(?:\+?221)?\s*(7[05678])[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})/);

    if(any) return (any[1] + any[2] + any[3] + any[4]).replace(/[^\d]/g,"");

    return "";
  }

  function extractClientName(text){
    const raw = String(text || "")
      .replace(/(?:tel|tél|telephone|téléphone|whatsapp|wa)\s*[:\-]?\s*[+0-9][0-9\s().-]{6,}/ig," ")
      .replace(/\d[\d\s.,]*/g," ");

    const stop = new Set(
      "pos pay commerce boutique client doit dette dettes credit crédit vendeur date fin mois en fois payable vendredi lundi mardi mercredi jeudi samedi dimanche tel telephone téléphone whatsapp wa vente vendu vends vend panier article ajoute ajouter stock prix"
      .split(" ")
    );

    const words = raw
      .replace(/[.,;:!?()]/g," ")
      .split(/\s+/)
      .map(x => x.trim())
      .filter(Boolean);

    for(const w of words){
      const k = norm(w);
      if(k.length < 2 || stop.has(k)) continue;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }

    return "Client";
  }

  function parse(text){
    const original = String(text || "").trim();
    const t = norm(original);

    if(!original) return null;

    if(/\b(dette client|dettes clients|credit vendeur|client doit|doit|reste a payer|reste à payer)\b/.test(t)){
      return {
        type:"client_debt",
        title:"📒 Dette client",
        client: extractClientName(original),
        phone: extractPhone(original),
        amount: extractAmount(original),
        dueDate: parseDate(original),
        note: original
      };
    }

    if(/\b(ajoute|ajouter|article|stock|prix)\b/.test(t)){
      const amount = extractAmount(original);
      const qty = extractQty(original);
      let name = "";

      let m = original.match(/(?:ajoute|ajouter|article|stock|prix)\s+(.+?)(?:\s+(?:a|à|prix|stock|quantite|quantité|de)\s+|$)/i);

      if(m && m[1]) name = cleanProductName(m[1]);

      if(!name){
        const afterQty = original.match(/\b\d+\s+(.+?)(?:\s+(?:a|à)\s+\d|$)/i);
        name = cleanProductName(afterQty?.[1] || original);
      }

      return {
        type:"product_upsert",
        title:"📦 Article / stock",
        name: name || "Article",
        qty,
        price: amount,
        note: original
      };
    }

    if(/\b(vendu|vends|vend|vente|mets au panier|met au panier|panier)\b/.test(t)){
      const amount = extractAmount(original);
      const qty = extractQty(original);

      const m = original.match(/(?:vendu|vends|vend|vente|panier)\s+(.+?)(?:\s+(?:a|à)\s+\d|$)/i);

      const name = cleanProductName(m?.[1] || original);

      return {
        type:"sale_cart",
        title:"🛒 Vente / panier",
        name: name || "Article",
        qty,
        price: amount,
        note: original
      };
    }

    if(/\b(note|rappelle|a faire|à faire|depense|dépense|achat)\b/.test(t)){
      return {
        type:"note",
        title:"✍️ Note comptoir",
        amount: extractAmount(original),
        note: original
      };
    }

    return {
      type:"unknown",
      title:"🗣️ À préciser",
      note: original
    };
  }

  function renderDraft(draft){
    const box = $("digiyPosDraft");
    const btn = $("digiyPosValidate");

    if(!box || !btn) return;

    lastDraft = draft;

    if(!draft){
      box.innerHTML = `
        <strong>Doctrine</strong>
        <span>Dis l’action. DIGIY prépare. Tu valides. Ta caisse s’exécute.</span>
      `;
      btn.disabled = true;
      return;
    }

    btn.disabled = draft.type === "unknown";

    if(draft.type === "product_upsert"){
      box.innerHTML = `
        <strong>${esc(draft.title)}</strong>
        <span>Article : ${esc(draft.name)}</span>
        <span>Stock à ajouter : ${esc(draft.qty)}</span>
        <span>Prix : ${draft.price ? esc(money(draft.price)) : "à compléter côté Articles"}</span>
        <em>Brouillon seulement. Valide pour mettre à jour la caisse locale.</em>
      `;
    }else if(draft.type === "sale_cart"){
      box.innerHTML = `
        <strong>${esc(draft.title)}</strong>
        <span>Article : ${esc(draft.name)}</span>
        <span>Quantité : ${esc(draft.qty)}</span>
        <span>${draft.price ? "Prix entendu : " + esc(money(draft.price)) : "Prix repris dans la caisse si l’article existe."}</span>
        <em>Valide pour ajouter au panier.</em>
      `;
    }else if(draft.type === "client_debt"){
      box.innerHTML = `
        <strong>${esc(draft.title)}</strong>
        <span>Client : ${esc(draft.client)}</span>
        <span>Tel : ${esc(draft.phone || "—")}</span>
        <span>Somme due : ${draft.amount ? esc(money(draft.amount)) : "à compléter"}</span>
        <span>Date : ${esc(draft.dueDate || "à préciser")}</span>
        <em>Dette client = argent attendu. Pas encore recette.</em>
      `;
    }else if(draft.type === "note"){
      box.innerHTML = `
        <strong>${esc(draft.title)}</strong>
        <span>${esc(draft.note)}</span>
        <span>${draft.amount ? "Montant : " + esc(money(draft.amount)) : "Montant optionnel"}</span>
        <em>Valide pour garder la note.</em>
      `;
    }else{
      box.innerHTML = `
        <strong>À préciser</strong>
        <span>${esc(draft.note)}</span>
        <em>Essaie : “Ajoute 12 savons à 500”, “Vendu 3 savons”, “Fatou dette client 50000 fin du mois”.</em>
      `;
    }
  }

  function executeDraft(){
    const d = lastDraft;

    if(!d || d.type === "unknown") return;

    if(d.type === "product_upsert"){
      const list = products();
      let p = findProduct(d.name);

      if(p){
        p.stock = Number(p.stock || 0) + Number(d.qty || 0);
        if(d.price) p.price = Number(d.price);
      }else{
        list.push({
          id: nextProductId(list),
          name: d.name,
          cat: "Autres",
          emoji: "📦",
          price: Number(d.price || 0),
          stock: Number(d.qty || 0),
          published: true
        });
      }

      saveProducts(list);

      if(typeof window.buildCats === "function") window.buildCats();
      if(typeof window.renderProds === "function") window.renderProds();

      toast("📦 Article préparé dans la caisse");
    }

    if(d.type === "sale_cart"){
      let p = findProduct(d.name);

      if(!p && d.price){
        const list = products();

        p = {
          id: nextProductId(list),
          name: d.name,
          cat: "Autres",
          emoji: "📦",
          price: Number(d.price || 0),
          stock: Math.max(Number(d.qty || 1), 1),
          published: true
        };

        list.push(p);
        saveProducts(list);

        if(typeof window.buildCats === "function") window.buildCats();
        if(typeof window.renderProds === "function") window.renderProds();
      }

      if(!p){
        toast("Article introuvable. Ajoute d’abord l’article ou donne le prix.");
        return;
      }

      for(let i = 0; i < Number(d.qty || 1); i++){
        if(typeof window.addToCart === "function") window.addToCart(p.id);
      }

      toast("🛒 Ajouté au panier");
    }

    if(d.type === "client_debt"){
      const notes = getNotesSafe();

      notes.unshift({
        id: Date.now(),
        date: new Date().toISOString(),
        type: "client_doit",
        amount: Number(d.amount || 0),
        text: `${d.client}${d.phone ? " · Tel " + d.phone : ""}${d.dueDate ? " · Date " + d.dueDate : ""}\n${d.note}`
      });

      saveNotesSafe(notes);

      if(typeof window.renderNotes === "function") window.renderNotes();

      toast("📒 Dette client gardée en note comptoir");
    }

    if(d.type === "note"){
      const notes = getNotesSafe();

      notes.unshift({
        id: Date.now(),
        date: new Date().toISOString(),
        type: "autre",
        amount: Number(d.amount || 0),
        text: d.note
      });

      saveNotesSafe(notes);

      if(typeof window.renderNotes === "function") window.renderNotes();

      toast("✍️ Note gardée");
    }

    const input = $("digiyPosVoiceInput");

    if(input) input.value = "";

    renderDraft(null);
  }

  function startVoice(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = $("digiyPosMic");
    const input = $("digiyPosVoiceInput");

    if(!SR){
      toast("Voix non disponible sur ce navigateur. Écris la phrase, ça marche aussi.");
      return;
    }

    try{
      if(recognition && listening){
        recognition.stop();
        return;
      }

      recognition = new SR();
      recognition.lang = "fr-FR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        listening = true;
        if(btn) btn.textContent = "🎧 J’écoute…";
      };

      recognition.onend = () => {
        listening = false;
        if(btn) btn.textContent = "🎙️ Parler";
      };

      recognition.onerror = () => {
        listening = false;
        if(btn) btn.textContent = "🎙️ Parler";
        toast("Voix non comprise. Écris la phrase.");
      };

      recognition.onresult = (event) => {
        const said = event?.results?.[0]?.[0]?.transcript || "";

        if(input && said){
          input.value = said;
          renderDraft(parse(said));
          toast("Phrase captée. Vérifie puis valide.");
        }
      };

      recognition.start();
    }catch(_){
      toast("Micro déjà ouvert ou navigateur bloqué.");
    }
  }

  function inject(){
    if($("digiyPosEar")) return;

    const anchor =
      document.querySelector("#page-caisse .home-strip")
      || document.querySelector("#page-caisse .topbar");

    if(!anchor) return;

    const css = document.createElement("style");

    css.textContent = `
      .digiy-pos-ear{
        margin:10px 12px 10px;
        padding:14px;
        border:2px solid #cfe8d7;
        border-radius:20px;
        background:linear-gradient(160deg,#fff,#f6fff8);
        box-shadow:0 8px 24px rgba(16,35,24,.08);
        display:grid;
        gap:10px;
        color:#102318;
      }

      .digiy-pos-ear-title{
        font-size:13px;
        font-weight:950;
        text-transform:uppercase;
        letter-spacing:.08em;
        color:#7a4c00;
      }

      .digiy-pos-ear-help{
        font-size:13px;
        line-height:1.45;
        color:#5f7468;
        font-weight:850;
      }

      .digiy-pos-ear-grid{
        display:grid;
        grid-template-columns:1fr .9fr;
        gap:10px;
        align-items:start;
      }

      .digiy-pos-ear textarea{
        width:100%;
        min-height:96px;
        border:1px solid #cfe8d7;
        border-radius:14px;
        padding:12px;
        font-size:16px;
        font-weight:850;
        color:#102318;
        background:#fff;
        resize:vertical;
        outline:none;
      }

      .digiy-pos-ear-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:8px;
      }

      .digiy-pos-ear button{
        min-height:42px;
        border-radius:999px;
        border:1px solid #cfe8d7;
        background:#fff;
        color:#102318;
        padding:9px 12px;
        font-size:13px;
        font-weight:950;
        cursor:pointer;
      }

      .digiy-pos-ear button.primary{
        background:#f5a623;
        border-color:#f5a623;
        color:#000;
      }

      .digiy-pos-ear button.confirm{
        background:#16a765;
        border-color:#16a765;
        color:#fff;
      }

      .digiy-pos-ear button:disabled{
        opacity:.55;
        cursor:not-allowed;
      }

      .digiy-pos-draft{
        min-height:96px;
        border:1px solid #cfe8d7;
        border-radius:14px;
        background:#fff;
        padding:12px;
        display:grid;
        gap:5px;
        font-size:13px;
        line-height:1.4;
        color:#5f7468;
        font-weight:850;
      }

      .digiy-pos-draft strong{
        color:#102318;
        font-size:15px;
        font-weight:950;
      }

      .digiy-pos-draft em{
        color:#7a4c00;
        font-style:normal;
        font-weight:950;
      }

      .digiy-pos-examples{
        display:flex;
        gap:7px;
        flex-wrap:wrap;
      }

      .digiy-pos-examples button{
        font-size:12px;
        min-height:34px;
        padding:7px 10px;
      }

      @media(max-width:760px){
        .digiy-pos-ear-grid{
          grid-template-columns:1fr;
        }

        .digiy-pos-ear{
          margin-left:10px;
          margin-right:10px;
        }

        .digiy-pos-ear textarea{
          min-height:88px;
        }
      }
    `;

    document.head.appendChild(css);

    const panel = document.createElement("section");

    panel.className = "digiy-pos-ear";
    panel.id = "digiyPosEar";

    panel.innerHTML = `
      <div>
        <div class="digiy-pos-ear-title">🎙️ Oreille métier POS</div>
        <div class="digiy-pos-ear-help">Dis l’action. DIGIY prépare. Tu valides. Ta caisse s’exécute.</div>
      </div>

      <div class="digiy-pos-ear-grid">
        <div>
          <textarea id="digiyPosVoiceInput" placeholder="Ex. Ajoute 12 savons à 500 / Vendu 3 savons / Fatou dette client 50000 fin du mois"></textarea>

          <div class="digiy-pos-ear-actions">
            <button id="digiyPosMic" type="button">🎙️ Parler</button>
            <button class="primary" id="digiyPosPrepare" type="button">⚡ Préparer</button>
            <button class="confirm" id="digiyPosValidate" type="button" disabled>✅ Valider l’action</button>
            <button id="digiyPosClear" type="button">Effacer</button>
          </div>
        </div>

        <div class="digiy-pos-draft" id="digiyPosDraft">
          <strong>Doctrine</strong>
          <span>Dis l’action. DIGIY prépare. Tu valides. Ta caisse s’exécute.</span>
        </div>
      </div>

      <div class="digiy-pos-examples">
        <button type="button" data-pos-example="Ajoute 12 savons à 500">Ajoute stock</button>
        <button type="button" data-pos-example="Vendu 3 savons">Vente panier</button>
        <button type="button" data-pos-example="Fatou dette client 50000 tel 771234567 date fin du mois">Dette client</button>
        <button type="button" data-pos-example="Note achat sachets 2000">Note</button>
      </div>
    `;

    anchor.insertAdjacentElement("afterend", panel);

    $("digiyPosMic")?.addEventListener("click", startVoice);

    $("digiyPosPrepare")?.addEventListener("click", () => {
      renderDraft(parse($("digiyPosVoiceInput")?.value || ""));
    });

    $("digiyPosValidate")?.addEventListener("click", executeDraft);

    $("digiyPosClear")?.addEventListener("click", () => {
      if($("digiyPosVoiceInput")) $("digiyPosVoiceInput").value = "";
      renderDraft(null);
    });

    panel.querySelectorAll("[data-pos-example]").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-pos-example") || "";
        if($("digiyPosVoiceInput")) $("digiyPosVoiceInput").value = v;
        renderDraft(parse(v));
      });
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", inject);
  }else{
    inject();
  }

  window.DIGIY_OREILLE_METIER_POS = {
    BUILD,
    parse,
    renderDraft,
    executeDraft
  };
})();
