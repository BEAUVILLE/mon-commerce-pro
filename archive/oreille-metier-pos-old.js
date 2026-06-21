/* DIGIY OREILLE MÉTIER — POS / COMMERCE V3
   Conteneur safe + grande lecture caisse.
   Dis l’action. DIGIY prépare. Tu valides. Ta caisse s’exécute.
*/
(function(){
  'use strict';

  const BUILD='oreille-metier-pos-v3-conteneur-safe-20260519';

  let lastDraft=null, recognition=null, listening=false;

  const $=id=>document.getElementById(id);
  const fmt=n=>Math.round(Number(n||0)).toLocaleString('fr-FR')+' F';
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const strip=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const norm=v=>strip(String(v||'').toLowerCase()).replace(/[’']/g,' ').replace(/\s+/g,' ').trim();
  const toast=m=>typeof window.showToast==='function'?window.showToast(m):alert(m);

  const prods=()=>{try{return typeof window.getProds==='function'?window.getProds():[]}catch(_){return[]}};
  const saveProdsSafe=items=>{try{if(typeof window.saveProds==='function')window.saveProds(items)}catch(_){}};
  const notes=()=>{try{return typeof window.getNotes==='function'?window.getNotes():JSON.parse(localStorage.getItem('caisse_notes')||'[]')}catch(_){return[]}};
  const saveNotesSafe=n=>{try{if(typeof window.saveNotes==='function')window.saveNotes(n);else localStorage.setItem('caisse_notes',JSON.stringify(n))}catch(_){}};
  const nextId=list=>(list||[]).reduce((m,p)=>Math.max(m,Number(p.id)||0),0)+1;

  function findProduct(name){
    const k=norm(name);
    const list=prods();
    return list.find(p=>norm(p.name)===k)||list.find(p=>norm(p.name).includes(k)||k.includes(norm(p.name)))||null;
  }

  function num(v){
    const m=String(v||'').match(/(\d[\d\s.,]*)/);
    return m?Number(String(m[1]).replace(/[^\d]/g,''))||0:0;
  }

  function cleanName(s){
    return String(s||'')
      .replace(/\b(ajoute|ajouter|rajoute|rajouter|article|articles|stock|prix|vendu|vends|vend|vente|panier|mets|met|a|à|de|du|des|fcfa|f|francs|piece|pièce|pieces|pièces|unite|unité|unités|client|doit|dette|credit|crédit|vendeur|fin|mois|date|tel|telephone|téléphone|whatsapp|wa)\b/gi,' ')
      .replace(/\d+/g,' ')
      .replace(/[.,;:!?]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function qty(text){
    const m=norm(text).match(/\b(\d+)\s+(?:x\s+)?([a-z0-9\- ]{2,})/);
    return m?Number(m[1])||1:1;
  }

  function parseDate(text){
    const t=norm(text), d=new Date();
    const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;

    if(t.includes('fin du mois'))return iso(new Date(d.getFullYear(),d.getMonth()+1,0));
    if(t.includes('demain')){d.setDate(d.getDate()+1);return iso(d)}

    const w={dimanche:0,lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6};

    for(const [n,target] of Object.entries(w)){
      if(t.includes(n)){
        let add=(target-d.getDay()+7)%7;
        if(add===0)add=7;
        d.setDate(d.getDate()+add);
        return iso(d);
      }
    }

    const m=String(text||'').match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);

    if(m){
      const y=m[3]?Number(String(m[3]).length===2?'20'+m[3]:m[3]):d.getFullYear();
      return iso(new Date(y,Number(m[2])-1,Number(m[1])));
    }

    return '';
  }

  function phone(text){
    const m=String(text||'').match(/(?:tel|tél|telephone|téléphone|whatsapp|wa)\s*[:\-]?\s*([+0-9][0-9\s().-]{6,})/i);
    if(m&&m[1])return m[1].replace(/[^\d+]/g,'');

    const any=String(text||'').match(/(?:\+?221)?\s*(7[05678])[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})/);
    return any?(any[1]+any[2]+any[3]+any[4]).replace(/[^\d]/g,''):'';
  }

  function clientName(text){
    const raw=String(text||'')
      .replace(/(?:tel|tél|telephone|téléphone|whatsapp|wa)\s*[:\-]?\s*[+0-9][0-9\s().-]{6,}/ig,' ')
      .replace(/\d[\d\s.,]*/g,' ');

    const stop=new Set('pos pay commerce boutique client doit dette dettes credit crédit vendeur date fin mois en fois payable vendredi lundi mardi mercredi jeudi samedi dimanche tel telephone téléphone whatsapp wa vente vendu vends vend panier article articles ajoute ajouter stock prix reste payer'.split(' '));

    for(const w of raw.replace(/[.,;:!?()]/g,' ').split(/\s+/).filter(Boolean)){
      const k=norm(w);
      if(k.length>=2&&!stop.has(k))return w.charAt(0).toUpperCase()+w.slice(1);
    }

    return 'Client';
  }

  function splitItems(text){
    return String(text||'')
      .replace(/\b(ajoute|ajouter|rajoute|rajouter|articles?|stock)\b/ig,' ')
      .replace(/\bet puis\b/ig,',')
      .replace(/\bpuis\b/ig,',')
      .replace(/\bet\b/ig,',')
      .replace(/[;|]/g,',')
      .replace(/\s+/g,' ')
      .trim()
      .split(',')
      .map(x=>x.trim())
      .filter(Boolean);
  }

  function parseSegment(seg){
    let m=String(seg||'').match(/^\s*(\d+)\s+(.+?)\s+(?:a|à)\s+(\d[\d\s.,]*)\s*(?:f|fcfa|francs?)?\s*$/i);
    if(m)return{name:cleanName(m[2]),qty:Number(m[1])||1,price:Number(String(m[3]).replace(/[^\d]/g,''))||0};

    m=String(seg||'').match(/^\s*(.+?)\s+(\d+)\s+(?:a|à)\s+(\d[\d\s.,]*)\s*(?:f|fcfa|francs?)?\s*$/i);
    if(m)return{name:cleanName(m[1]),qty:Number(m[2])||1,price:Number(String(m[3]).replace(/[^\d]/g,''))||0};

    m=String(seg||'').match(/^\s*(\d+)\s+(.+?)\s*$/i);
    if(m)return{name:cleanName(m[2]),qty:Number(m[1])||1,price:0};

    return null;
  }

  function parseBatch(text){
    return splitItems(text).map(parseSegment).filter(x=>x&&x.name);
  }

  function parseNav(original,t){
    if(/\b(retour caisse|caisse|encaisser|faire une vente|vente rapide)\b/.test(t))return{type:'navigate',title:'🧭 Aller à la caisse',target:'page-caisse'};
    if(/\b(notes?|ouvrir notes?|note comptoir|noter)\b/.test(t))return{type:'navigate',title:'🧭 Aller aux notes',target:'page-notes'};
    if(/\b(stats?|statistiques|historique|voir ventes)\b/.test(t))return{type:'navigate',title:'🧭 Aller aux stats',target:'page-stats'};
    if(/\b(articles?|ajouter article|ajout article|catalogue|stock)\b/.test(t)&&!/\d/.test(t))return{type:'navigate',title:'🧭 Aller aux articles',target:'admin-articles',href:'./admin.html#articleList'};
    if(/\b(addition|panier|ouvrir panier)\b/.test(t))return{type:'navigate',title:'🧭 Ouvrir l’addition',target:'addition'};
    return null;
  }

  function parse(text){
    const original=String(text||'').trim(),t=norm(original);
    if(!original)return null;

    const nav=parseNav(original,t);
    if(nav)return nav;

    if(/\b(ajoute|ajouter|rajoute|rajouter|articles?|stock)\b/.test(t)){
      const b=parseBatch(original);
      if(b.length>=2)return{type:'product_batch',title:'📦 Liste d’articles',items:b,note:original};
      if(b.length===1&&(original.includes(' à ')||original.includes(' a ')))return{type:'product_upsert',title:'📦 Article / stock',name:b[0].name,qty:b[0].qty,price:b[0].price,note:original};
      return{type:'product_upsert',title:'📦 Article / stock',name:cleanName(original)||'Article',qty:qty(original),price:num(original),note:original};
    }

    if(/\b(dette client|dettes clients|credit vendeur|client doit|doit|reste a payer|reste à payer)\b/.test(t))return{type:'client_debt',title:'📒 Dette client',client:clientName(original),phone:phone(original),amount:num(original),dueDate:parseDate(original),note:original};

    if(/\b(vendu|vends|vend|vente|mets au panier|met au panier|panier)\b/.test(t)){
      const m=original.match(/(?:vendu|vends|vend|vente|panier)\s+(.+?)(?:\s+(?:a|à)\s+\d|$)/i);
      return{type:'sale_cart',title:'🛒 Vente / panier',name:cleanName(m?.[1]||original)||'Article',qty:qty(original),price:num(original),note:original};
    }

    if(/\b(note|rappelle|a faire|à faire|depense|dépense|achat)\b/.test(t))return{type:'note',title:'✍️ Note comptoir',amount:num(original),note:original};

    return{type:'unknown',title:'🗣️ À préciser',note:original};
  }

  function renderDraft(d){
    const box=$('digiyPosDraft'),btn=$('digiyPosValidate');
    if(!box||!btn)return;

    lastDraft=d;

    if(!d){
      box.innerHTML='<strong>Doctrine</strong><span>Le pro pose sa base. Ensuite la voix rend la caisse fluide.</span>';
      btn.disabled=true;
      return;
    }

    btn.disabled=d.type==='unknown';

    if(d.type==='navigate'){
      box.innerHTML=`<strong>${esc(d.title)}</strong><span>Chemin préparé : ${esc(d.href||d.target)}</span><em>Valide pour ouvrir le bon chemin.</em>`;
    }else if(d.type==='product_batch'){
      box.innerHTML=`<strong>${esc(d.title)}</strong><span>${d.items.length} articles préparés.</span><div class="digiy-pos-table">${d.items.map((it,i)=>`<div class="digiy-pos-row"><span>${i+1}. ${esc(it.name)}</span><span>${esc(it.qty)} × ${it.price?esc(fmt(it.price)):'prix à compléter'}</span></div>`).join('')}</div><em>Valide pour ajouter / mettre à jour ces articles.</em>`;
    }else if(d.type==='product_upsert'){
      box.innerHTML=`<strong>${esc(d.title)}</strong><span>Article : ${esc(d.name)}</span><span>Stock à ajouter : ${esc(d.qty)}</span><span>Prix : ${d.price?esc(fmt(d.price)):'à compléter côté Articles'}</span><em>Brouillon seulement.</em>`;
    }else if(d.type==='sale_cart'){
      box.innerHTML=`<strong>${esc(d.title)}</strong><span>Article : ${esc(d.name)}</span><span>Quantité : ${esc(d.qty)}</span><span>${d.price?'Prix entendu : '+esc(fmt(d.price)):'Prix repris si l’article existe.'}</span><em>Valide pour ajouter au panier.</em>`;
    }else if(d.type==='client_debt'){
      box.innerHTML=`<strong>${esc(d.title)}</strong><span>Client : ${esc(d.client)}</span><span>Contact : ${d.phone?'renseigné':'—'}</span><span>Somme due : ${d.amount?esc(fmt(d.amount)):'à compléter'}</span><span>Date : ${esc(d.dueDate||'à préciser')}</span><em>Dette client = argent attendu. Pas encore recette.</em>`;
    }else if(d.type==='note'){
      box.innerHTML=`<strong>${esc(d.title)}</strong><span>${esc(d.note)}</span><span>${d.amount?'Montant : '+esc(fmt(d.amount)):'Montant optionnel'}</span><em>Valide pour garder la note.</em>`;
    }else{
      box.innerHTML=`<strong>À préciser</strong><span>${esc(d.note)}</span><em>Essaie : “Ajoute 12 savons à 500”, “12 savons à 500, 10 huiles à 1500”, “Vendu 3 savons”.</em>`;
    }
  }

  function upsert(it){
    const list=prods();
    let p=findProduct(it.name);

    if(p){
      p.stock=Number(p.stock||0)+Number(it.qty||0);
      if(it.price)p.price=Number(it.price);
    }else{
      list.push({id:nextId(list),name:it.name,cat:'Autres',emoji:'📦',price:Number(it.price||0),stock:Number(it.qty||0),published:true});
    }

    saveProdsSafe(list);
  }

  function execNav(d){
    if(d.target==='admin-articles'&&d.href){
      location.href=d.href;
      return;
    }

    if(d.target==='addition'&&typeof window.openAddition==='function'){
      window.openAddition();
      return;
    }

    if(d.target&&typeof window.showPage==='function')window.showPage(d.target);
  }

  function executeDraft(){
    const d=lastDraft;
    if(!d||d.type==='unknown')return;

    if(d.type==='navigate'){
      execNav(d);
      toast('🧭 Chemin ouvert');
    }

    if(d.type==='product_batch'){
      d.items.forEach(upsert);
      if(window.buildCats)window.buildCats();
      if(window.renderProds)window.renderProds();
      toast('📦 Liste d’articles ajoutée');
    }

    if(d.type==='product_upsert'){
      upsert({name:d.name,qty:d.qty,price:d.price});
      if(window.buildCats)window.buildCats();
      if(window.renderProds)window.renderProds();
      toast('📦 Article préparé dans la caisse');
    }

    if(d.type==='sale_cart'){
      let p=findProduct(d.name);

      if(!p&&d.price){
        const list=prods();
        p={id:nextId(list),name:d.name,cat:'Autres',emoji:'📦',price:Number(d.price||0),stock:Math.max(Number(d.qty||1),1),published:true};
        list.push(p);
        saveProdsSafe(list);

        if(window.buildCats)window.buildCats();
        if(window.renderProds)window.renderProds();
      }

      if(!p){
        toast('Article introuvable. Ajoute d’abord l’article ou donne le prix.');
        return;
      }

      for(let i=0;i<Number(d.qty||1);i++){
        if(window.addToCart)window.addToCart(p.id);
      }

      toast('🛒 Ajouté au panier');
    }

    if(d.type==='client_debt'){
      const n=notes();
      n.unshift({
        id:Date.now(),
        date:new Date().toISOString(),
        type:'client_doit',
        amount:Number(d.amount||0),
        text:`${d.client}${d.phone?' · Tel '+d.phone:''}${d.dueDate?' · Date '+d.dueDate:''}\n${d.note}`
      });
      saveNotesSafe(n);

      if(window.renderNotes)window.renderNotes();

      toast('📒 Dette client gardée en note comptoir');
    }

    if(d.type==='note'){
      const n=notes();
      n.unshift({id:Date.now(),date:new Date().toISOString(),type:'autre',amount:Number(d.amount||0),text:d.note});
      saveNotesSafe(n);

      if(window.renderNotes)window.renderNotes();

      toast('✍️ Note gardée');
    }

    const input=$('digiyPosVoiceInput');
    if(input)input.value='';

    renderDraft(null);
  }

  function startVoice(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const btn=$('digiyPosMic');
    const input=$('digiyPosVoiceInput');

    if(!SR){
      toast('Voix non disponible sur ce navigateur. Écris la phrase, ça marche aussi.');
      return;
    }

    try{
      if(recognition&&listening){
        recognition.stop();
        return;
      }

      recognition=new SR();
      recognition.lang='fr-FR';
      recognition.interimResults=false;
      recognition.maxAlternatives=1;

      recognition.onstart=()=>{
        listening=true;
        if(btn)btn.textContent='🎧 J’écoute…';
      };

      recognition.onend=()=>{
        listening=false;
        if(btn)btn.textContent='🎙️ Parler';
      };

      recognition.onerror=()=>{
        listening=false;
        if(btn)btn.textContent='🎙️ Parler';
        toast('Voix non comprise. Écris la phrase.');
      };

      recognition.onresult=e=>{
        const said=e?.results?.[0]?.[0]?.transcript||'';
        if(input&&said){
          input.value=said;
          renderDraft(parse(said));
          toast('Phrase captée. Vérifie puis valide.');
        }
      };

      recognition.start();
    }catch(_){
      toast('Micro déjà ouvert ou navigateur bloqué.');
    }
  }

  function inject(){
    if($('digiyPosEar'))return;

    const helpBody=document.querySelector('#posHelpFold .pos-fold-body');
    const containerHead=document.querySelector('#posComptoirContainer .pos-container-head');
    const anchor=helpBody||containerHead||document.querySelector('#page-caisse .topbar');

    if(!anchor)return;

    const css=document.createElement('style');
    css.textContent=`.digiy-pos-ear{margin:12px 12px 0;padding:14px;border:2px solid #cfe8d7;border-radius:20px;background:linear-gradient(160deg,#fff,#f6fff8);box-shadow:0 8px 24px rgba(16,35,24,.08);display:grid;gap:10px;color:#102318}.digiy-pos-ear-title{font-size:16px;font-weight:1000;text-transform:uppercase;letter-spacing:.08em;color:#7a4c00}.digiy-pos-ear-help{font-size:15px;line-height:1.45;color:#5f7468;font-weight:950}.digiy-pos-ear-grid{display:grid;grid-template-columns:1fr .9fr;gap:10px;align-items:start}.digiy-pos-ear textarea{width:100%;min-height:96px;border:1px solid #cfe8d7;border-radius:14px;padding:12px;font-size:18px;font-weight:950;color:#102318;background:#fff;resize:vertical;outline:none}.digiy-pos-ear-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.digiy-pos-ear button{min-height:42px;border-radius:999px;border:1px solid #cfe8d7;background:#fff;color:#102318;padding:9px 12px;font-size:15.5px;font-weight:1000;cursor:pointer}.digiy-pos-ear button.primary{background:#f5a623;border-color:#f5a623;color:#000}.digiy-pos-ear button.confirm{background:#16a765;border-color:#16a765;color:#fff}.digiy-pos-ear button:disabled{opacity:.55;cursor:not-allowed}.digiy-pos-draft{min-height:96px;border:1px solid #cfe8d7;border-radius:14px;background:#fff;padding:12px;display:grid;gap:5px;font-size:15px;line-height:1.4;color:#5f7468;font-weight:950}.digiy-pos-draft strong{color:#102318;font-size:18px;font-weight:1000}.digiy-pos-draft em{color:#7a4c00;font-style:normal;font-weight:950}.digiy-pos-table{display:grid;gap:5px;margin:4px 0}.digiy-pos-row{display:flex;justify-content:space-between;gap:8px;padding:7px 9px;border:1px solid #cfe8d7;border-radius:10px;background:#f8fff9;color:#102318;font-weight:950}.digiy-pos-examples{display:flex;gap:7px;flex-wrap:wrap}.digiy-pos-examples button{font-size:13px;min-height:36px;padding:7px 10px}@media(max-width:760px){.digiy-pos-ear-grid{grid-template-columns:1fr}.digiy-pos-ear{margin-left:10px;margin-right:10px}.digiy-pos-ear textarea{min-height:88px}.digiy-pos-row{display:grid}}`;
    document.head.appendChild(css);

    const panel=document.createElement('section');
    panel.className='digiy-pos-ear';
    panel.id='digiyPosEar';

    panel.innerHTML=`<div><div class="digiy-pos-ear-title">🎙️ Oreille métier POS</div><div class="digiy-pos-ear-help">Voix ou écrit secours. DIGIY prépare, tu valides. Replié dans l’aide pour garder le comptoir léger.</div></div><div class="digiy-pos-ear-grid"><div><textarea id="digiyPosVoiceInput" placeholder="Ex. Ajoute 12 savons à 500, 10 huiles à 1500 / Vendu 3 savons / Va aux stats"></textarea><div class="digiy-pos-ear-actions"><button id="digiyPosMic" type="button">🎙️ Parler</button><button class="primary" id="digiyPosPrepare" type="button">⚡ Préparer</button><button class="confirm" id="digiyPosValidate" type="button" disabled>✅ Valider l’action</button><button id="digiyPosClear" type="button">Effacer</button></div></div><div class="digiy-pos-draft" id="digiyPosDraft"><strong>Doctrine</strong><span>Le pro pose sa base. Ensuite la voix rend la caisse fluide.</span></div></div><div class="digiy-pos-examples"><button type="button" data-pos-example="Ajoute 12 savons à 500, 10 huiles à 1500, 6 dentifrices à 1200">Liste articles</button><button type="button" data-pos-example="Vendu 3 savons">Vente panier</button><button type="button" data-pos-example="Fatou dette client 50000 date fin du mois">Dette client</button><button type="button" data-pos-example="Va aux stats">Stats</button><button type="button" data-pos-example="Ajouter article">Articles</button></div>`;

    if(helpBody){
      helpBody.appendChild(panel);
    }else{
      anchor.insertAdjacentElement('afterend',panel);
    }

    $('digiyPosMic')?.addEventListener('click',startVoice);
    $('digiyPosPrepare')?.addEventListener('click',()=>renderDraft(parse($('digiyPosVoiceInput')?.value||'')));
    $('digiyPosValidate')?.addEventListener('click',executeDraft);
    $('digiyPosClear')?.addEventListener('click',()=>{
      if($('digiyPosVoiceInput'))$('digiyPosVoiceInput').value='';
      renderDraft(null);
    });

    panel.querySelectorAll('[data-pos-example]').forEach(btn=>btn.addEventListener('click',()=>{
      const v=btn.getAttribute('data-pos-example')||'';
      if($('digiyPosVoiceInput'))$('digiyPosVoiceInput').value=v;
      renderDraft(parse(v));
    }));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);
  else inject();

  window.DIGIY_OREILLE_METIER_POS={BUILD,parse,renderDraft,executeDraft};
})();

