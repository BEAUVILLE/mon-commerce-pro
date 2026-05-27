/* ACTION DIGIY RECEIVER — ZONE 1
   Fiche claire du brouillon : métier, quantité, prix, total, argent à contrôler.
   Le bouton valide seulement le brouillon, pas la vente ni l'argent.
*/
(function(){
  "use strict";
  const VERSION="action-digiy-receiver-zone1-pos-proof-20260527";
  const HOST=String(location.hostname||"").toLowerCase();
  const MODULE=HOST.includes("commerce-pro")?"POS":HOST.includes("pro-pay")?"PAY":"MODULE";
  const LATEST="DIGIY_INCOMING_ACTION";
  const MODKEY="DIGIY_"+MODULE+"_INCOMING_ACTION";
  const VALID="DIGIY_"+MODULE+"_VALIDATED_ACTION";
  const PROOF="DIGIY_POS_CAISSE_PROOF";

  const NUMBER_WORDS={un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10,onze:11,douze:12,treize:13,quatorze:14,quinze:15,seize:16,vingt:20,trente:30,quarante:40,cinquante:50};
  const NUMBER_WORD_RE="un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante";

  function fixText(s){return String(s||"").trim()
    .replace(/Ã\u00a0/g,"à").replace(/Ã\s+/g,"à ").replace(/Ã$/g,"à")
    .replace(/Ã©/g,"é").replace(/Ã¨/g,"è").replace(/Ãª/g,"ê").replace(/Ã«/g,"ë")
    .replace(/Ã /g,"à").replace(/Ã¡/g,"á").replace(/Ã¢/g,"â").replace(/Ã¤/g,"ä")
    .replace(/Ã´/g,"ô").replace(/Ã¶/g,"ö").replace(/Ã¹/g,"ù").replace(/Ã»/g,"û").replace(/Ã¼/g,"ü")
    .replace(/Ã®/g,"î").replace(/Ã¯/g,"ï").replace(/Ã§/g,"ç")
    .replace(/â\u20ac\u2122/g,"’").replace(/â€™/g,"’").replace(/Â/g,"")}

  function safe(s){return String(s||"").replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]})}
  function money(n){return (Number(n)||0).toLocaleString("fr-FR")+" FCFA"}
  function norm(s){return fixText(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g," ").replace(/[.,;:!?]/g," ").replace(/\s+/g," ").trim()}
  function nums(s){const a=[];fixText(s).replace(/\d[\d\s.,]*/g,function(m){const n=Number(String(m).replace(/[^\d]/g,""));if(n>0)a.push(n)});return a}
  function wordNumber(w){return NUMBER_WORDS[norm(w)]||0}
  function looksLikeDeForDeux(s){
    const n=norm(s);
    return /^de\s+[a-z]+s\b/.test(n) && /\b(a|unite|piece|prix)\s*\d|\d[\d\s.,]*\s*(cash|wave|orange|om)?\b/i.test(n);
  }
  function quantityFromText(s){
    const n=norm(s);
    const digit=n.match(/(?:^|\b)(\d{1,3})\s*(?:x\s+)?[a-z]/i);
    if(digit){const x=Number(digit[1]);if(x>0&&x<1000)return x}
    const word=n.match(new RegExp("(?:^|\\b)("+NUMBER_WORD_RE+")\\s+(?:x\\s+)?[a-z]","i"));
    if(word){const x=wordNumber(word[1]);if(x>0&&x<1000)return x}
    if(looksLikeDeForDeux(s))return 2;
    return 0;
  }
  function removeQuantityPrefix(s){return String(s||"").trim()
    .replace(/^\s*\d{1,3}\s*(?:x\s*)?/i,"")
    .replace(new RegExp("^\\s*("+NUMBER_WORD_RE+")\\s*(?:x\\s*)?","i"),"")
    .replace(/^\s*de\s+(?=[a-zA-ZÀ-ÿ]+s\b)/i,"")
    .trim()}
  function clean(s){let t=fixText(s)
    .replace(/^\s*action\s+(digi\s+i|diji\s+i|dgi\s+i|dj|d\s*j|dji|digiy)\s*/i,"")
    .replace(/^\s*(note|ajoute|ajouter|prepare|prépare|cree|crée|mets|met)\s+/i,"")
    .replace(/\bmodule\s+(pos|pose|poste|post|pay|paie|paye)\b/gi," ")
    .replace(/^\s*(pos|pose|poste|post)\s+/i,"")
    .replace(/\b(web|wêve|weve|wève|wavee|ouve|ouève)\b/gi,"Wave")
    .replace(/\ben\s+(cash|wave|orange money)\b/gi,"$1")
    .replace(/\bfrancs?\b/gi,"")
    .replace(/(?:resultat|résultat|total)\s*\d[\d\s.,]*/i,"")
    .replace(/\s+/g," ").trim();
    if(looksLikeDeForDeux(t))t=t.replace(/^de\s+/i,"deux ");
    return t;
  }
  function explicitTotal(s){const m=fixText(s).match(/(?:resultat|résultat|total)\s*(\d[\d\s.,]*)/i);return m?Number(m[1].replace(/[^\d]/g,""))||0:0}
  function channel(s,a){if(a&&a.channel)return a.channel;const n=norm(s);if(n.includes("wave")||n.includes("web")||n.includes("weve"))return"Wave";if(n.includes("cash")||n.includes("espece")||n.includes("liquide"))return"Cash";if(n.includes("orange money")||n.includes(" om "))return"Orange Money";return"À contrôler"}
  function parse(action){
    const raw=fixText(action.commandText||action.rawText||action.note||"");
    const ns=nums(raw);
    let q=Number(action.quantity)||wordNumber(action.quantity)||0, unit=Number(action.unitPrice)||0, total=Number(action.totalAmount||action.amount)||0;
    if(!q)q=quantityFromText(raw);
    const um=raw.match(/(?:à|a|Ã\s*|Ã\u00a0|unite|unité|piece|pièce|prix)\s*(\d[\d\s.,]*)/i); if(!unit&&um)unit=Number(um[1].replace(/[^\d]/g,""))||0;
    const et=explicitTotal(raw); if(et)total=et;
    if(q&&ns.length>=1&&!unit)unit=ns.find(function(x){return x!==q&&x!==et})||ns[ns.length-1]||0;
    if(!q&&ns.length>=2&&ns[0]>0&&ns[0]<1000){q=ns[0];unit=unit||ns[1]}
    if(q&&unit&&(!total||total===q||total===unit))total=q*unit;
    if(!total&&ns.length)total=ns[ns.length-1];
    let item=clean(raw)
      .replace(/^\s*vente\s+(de\s+)?/i,"")
      .replace(/(?:à|a|Ã\s*|Ã\u00a0|unite|unité|piece|pièce|prix)\s*\d[\d\s.,]*/i,"")
      .replace(/\ben\s+(cash|wave|orange money)\b/gi,"$1")
      .replace(/\b(cash|wave|orange money|payer|paye|payé)\b/gi,"")
      .replace(/\ben\s*$/i,"")
      .replace(/\s+/g," ").trim();
    item=removeQuantityPrefix(item);
    if(!item)item="À préciser";
    return {item,quantity:q||1,unitPrice:unit||0,total:total||0,note:clean(raw),channel:channel(raw,action)};
  }
  function makeProof(data){
    const now=new Date();
    return {
      id:"POS-PREUVE-"+Date.now(),
      createdAt:now.toISOString(),
      status:"preuve_caisse_preparee",
      module:"POS",
      item:data.item,
      quantity:Number(data.quantity||1),
      unitPrice:Number(data.unitPrice||0),
      total:Number(data.total||0),
      channel:data.channel||"À contrôler",
      note:data.note||"",
      warning:"Preuve POS préparée. Vente non enregistrée. Argent non confirmé."
    };
  }
  function saveProof(proof){
    try{
      localStorage.setItem(PROOF,JSON.stringify(proof));
      localStorage.setItem("caisse_action_last_proof",JSON.stringify(proof));
      localStorage.setItem("caisse_action_proof_touch",String(Date.now()));
    }catch(e){}
  }
  function renderProof(card,proof){
    const old=card.querySelector("#dzProof");if(old)old.remove();
    const box=document.createElement("div");box.id="dzProof";
    box.style.cssText="margin-top:12px;padding:14px;border-radius:18px;background:#ecfdf5;border:2px solid rgba(34,197,94,.35);color:#052e16;font-weight:900";
    box.innerHTML='<div style="font-size:13px;color:#166534;font-weight:1000;letter-spacing:.08em;text-transform:uppercase">✅ PREUVE CAISSE POS</div><div style="font-size:24px;font-weight:1000;margin-top:4px">'+money(proof.total)+'</div><div style="margin-top:8px;line-height:1.45">'+safe(proof.quantity)+' × '+safe(proof.item)+' à '+money(proof.unitPrice)+'<br>Paiement annoncé : '+safe(proof.channel)+'</div><div style="margin-top:10px;padding:10px;border-radius:14px;background:#052e16;color:white">Preuve préparée dans POS. Vente non enregistrée. Argent non confirmé.</div>';
    const actions=card.querySelector("#dzValidate")?.parentElement;
    if(actions)card.insertBefore(box,actions);else card.appendChild(box);
  }
  function parsePacked(v){if(!v)return null;const tries=[v];try{tries.push(decodeURIComponent(v))}catch(e){}try{tries.push(atob(v))}catch(e){}try{tries.push(atob(decodeURIComponent(v)))}catch(e){}for(const x of tries){try{const o=JSON.parse(x);if(o&&typeof o==="object")return o}catch(e){}}return null}
  function readUrl(){const h=new URLSearchParams(String(location.hash||"").replace(/^#/,""));const q=new URLSearchParams(String(location.search||"").replace(/^\?/,""));return parsePacked(h.get("digiyAction")||h.get("action")||q.get("digiyAction")||q.get("action"))}
  function moduleName(m){return m==="POS"?"POS / Mon commerce":m==="PAY"?"PAY / Mon argent":m||"Module"}
  function actionName(a){return a==="ADD_EXPENSE"?"Dépense à contrôler":a==="ADD_SALE"?"Vente à contrôler":"Action à contrôler"}
  function save(action,status){const p=parse(action);const out={...action,...p,receiverVersion:VERSION,receivedAt:new Date().toISOString(),receivedByModule:MODULE,status:status||"draft_received",requiresHumanValidation:true};localStorage.setItem(LATEST,JSON.stringify(out));localStorage.setItem(MODKEY,JSON.stringify(out));if(status==="draft_validated")localStorage.setItem(VALID,JSON.stringify(out));return out}
  function mount(action){
    if(!action)return;const data=save(action,"draft_received");const old=document.getElementById("digiyZone1");if(old)old.remove();
    const card=document.createElement("section");card.id="digiyZone1";card.style.cssText="margin:14px auto;width:min(980px,calc(100% - 24px));border:2px solid rgba(250,204,21,.45);border-radius:24px;background:#fff8e8;color:#102015;padding:16px;box-shadow:0 18px 42px rgba(0,0,0,.24);font-family:system-ui";
    card.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px"><div><div style="font-weight:1000;color:#8a6400">🎙️ ACTION DIGIY</div><h2 style="margin:4px 0 0;font-size:28px;line-height:1">Brouillon préparé</h2><p style="margin:8px 0 0;font-weight:900;color:#5b4b16">Première zone : comprendre, contrôler, puis seulement valider.</p></div><button id="dzClose" style="width:38px;height:38px;border:0;border-radius:99px;background:#102015;color:white;font-size:20px">×</button></div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px"><div class="dz"><small>Module</small><b>'+safe(moduleName(data.primaryModule||data.module||MODULE))+'</b></div><div class="dz"><small>Geste</small><b>'+safe(actionName(data.action))+'</b></div><div class="dz"><small>Article / service</small><b>'+safe(data.item)+'</b></div><div class="dz"><small>Paiement</small><b>'+safe(data.channel)+'</b></div><div class="dz"><small>Quantité</small><b>'+safe(data.quantity)+'</b></div><div class="dz"><small>Prix unité</small><b>'+money(data.unitPrice)+'</b></div><div class="dz"><small>Total</small><b>'+money(data.total)+'</b></div><div class="dz"><small>Argent</small><b>À contrôler</b></div></div><div style="margin-top:12px;padding:12px;border-radius:18px;background:#102015;color:white;font-weight:900"><b>Note propre :</b><br>'+safe(data.note||"—")+'<br><br>Brouillon validé ≠ vente enregistrée ≠ argent confirmé.</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px"><button id="dzValidate" style="min-height:50px;border:0;border-radius:15px;background:linear-gradient(135deg,#22c55e,#facc15);font-weight:1000">✅ Valider brouillon</button><button id="dzCopy" style="min-height:50px;border:0;border-radius:15px;background:#eee;font-weight:1000">📋 Copier</button><button id="dzDelete" style="min-height:50px;border:0;border-radius:15px;background:#fee2e2;color:#7f1d1d;font-weight:1000">✖ Effacer</button></div><style>#digiyZone1 .dz{border:1px solid rgba(16,32,21,.14);background:white;border-radius:16px;padding:10px;min-height:74px}#digiyZone1 small{display:block;color:#6b5b21;font-weight:1000;margin-bottom:4px}#digiyZone1 b{font-weight:1000}@media(max-width:760px){#digiyZone1 div[style*="repeat(4"]{grid-template-columns:1fr 1fr!important}#digiyZone1 div[style*="repeat(3"]{grid-template-columns:1fr!important}}@media(max-width:430px){#digiyZone1 div[style*="repeat(4"]{grid-template-columns:1fr!important}}</style>';
    const target=document.querySelector("main")||document.body;target.insertBefore(card,target.firstChild);
    card.querySelector("#dzClose").onclick=function(){card.remove()};card.querySelector("#dzDelete").onclick=function(){localStorage.removeItem(MODKEY);localStorage.removeItem(LATEST);localStorage.removeItem(VALID);localStorage.removeItem(PROOF);card.remove()};card.querySelector("#dzCopy").onclick=function(){navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(data,null,2));alert("Brouillon copié.")};card.querySelector("#dzValidate").onclick=function(){const validated=save(data,"draft_validated");const proof=makeProof(validated);saveProof(proof);renderProof(card,proof);this.textContent="✅ Preuve POS préparée";alert("Preuve POS préparée. La vente n'est pas encore enregistrée et l'argent n'est pas confirmé.")};
  }
  function boot(){const incoming=readUrl();if(!incoming)return;if(history&&history.replaceState)history.replaceState({},document.title,location.origin+location.pathname);mount(incoming);window.dispatchEvent(new CustomEvent("digiy:action-received",{detail:incoming}))}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
  window.DIGIY_ACTION_RECEIVER={version:VERSION,module:MODULE,mountPanel:mount,parseLine:parse,cleanCommand:clean,readActionFromUrl:readUrl,saveIncomingAction:save};
})();