/* ACTION DIGIY RECEIVER — ZONE 1
   Fiche claire du brouillon : métier, quantité, prix, total, argent à contrôler.
   Le bouton valide seulement le brouillon, pas la vente ni l'argent.
*/
(function(){
  "use strict";
  const VERSION="action-digiy-receiver-zone1-20260526";
  const HOST=String(location.hostname||"").toLowerCase();
  const MODULE=HOST.includes("commerce-pro")?"POS":HOST.includes("pro-pay")?"PAY":"MODULE";
  const LATEST="DIGIY_INCOMING_ACTION";
  const MODKEY="DIGIY_"+MODULE+"_INCOMING_ACTION";
  const VALID="DIGIY_"+MODULE+"_VALIDATED_ACTION";

  function safe(s){return String(s||"").replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]})}
  function money(n){return (Number(n)||0).toLocaleString("fr-FR")+" FCFA"}
  function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g," ").replace(/[.,;:!?]/g," ").replace(/\s+/g," ").trim()}
  function nums(s){const a=[];String(s||"").replace(/\d[\d\s.,]*/g,function(m){const n=Number(String(m).replace(/[^\d]/g,""));if(n>0)a.push(n)});return a}
  function clean(s){return String(s||"").trim()
    .replace(/^\s*action\s+(digi\s+i|diji\s+i|dgi\s+i|dj|d\s*j|dji|digiy)\s*/i,"")
    .replace(/^\s*(note|ajoute|ajouter|prepare|prépare|cree|crée|mets|met)\s+/i,"")
    .replace(/\bmodule\s+(pos|pose|poste|post|pay|paie|paye)\b/gi," ")
    .replace(/^\s*(pos|pose|poste|post)\s+/i,"")
    .replace(/\b(web|wêve|weve|wève|wavee|ouve|ouève)\b/gi,"Wave")
    .replace(/\bfrancs?\b/gi,"")
    .replace(/(?:resultat|résultat|rÃ©sultat|total)\s*\d[\d\s.,]*/i,"")
    .replace(/\s+/g," ").trim()}
  function explicitTotal(s){const m=String(s||"").match(/(?:resultat|résultat|rÃ©sultat|total)\s*(\d[\d\s.,]*)/i);return m?Number(m[1].replace(/[^\d]/g,""))||0:0}
  function channel(s,a){if(a&&a.channel)return a.channel;const n=norm(s);if(n.includes("wave")||n.includes("web")||n.includes("weve"))return"Wave";if(n.includes("cash")||n.includes("espece")||n.includes("liquide"))return"Cash";if(n.includes("orange money")||n.includes(" om "))return"Orange Money";return"À contrôler"}
  function parse(action){
    const raw=String(action.commandText||action.rawText||action.note||"");
    const ns=nums(raw), n=norm(raw);
    let q=Number(action.quantity)||0, unit=Number(action.unitPrice)||0, total=Number(action.totalAmount||action.amount)||0;
    const qm=n.match(/(?:^|\b)(\d{1,3})\s+(?:x\s+)?[a-z]/i); if(!q&&qm){const x=Number(qm[1]);if(x>0&&x<1000)q=x}
    const um=raw.match(/(?:à|a|unite|unité|piece|pièce|prix)\s*(\d[\d\s.,]*)/i); if(!unit&&um)unit=Number(um[1].replace(/[^\d]/g,""))||0;
    const et=explicitTotal(raw); if(et)total=et;
    if(q&&ns.length>=2&&!unit)unit=ns.find(function(x){return x!==q&&x!==et})||ns[1]||0;
    if(!q&&ns.length>=2&&ns[0]>0&&ns[0]<1000){q=ns[0];unit=unit||ns[1]}
    if(q&&unit&&(!total||total===q||total===unit))total=q*unit;
    if(!total&&ns.length)total=ns[ns.length-1];
    let item=clean(raw).replace(/^\s*vente\s+(de\s+)?/i,"").replace(/^\s*\d{1,3}\s+/,"").replace(/(?:à|a|unite|unité|piece|pièce|prix)\s*\d[\d\s.,]*/i,"").replace(/\b(cash|wave|orange money|payer|paye|payé)\b/gi,"").replace(/\s+/g," ").trim();
    if(!item)item="À préciser";
    return {item,quantity:q||1,unitPrice:unit||0,total:total||0,note:clean(raw),channel:channel(raw,action)};
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
    card.querySelector("#dzClose").onclick=function(){card.remove()};card.querySelector("#dzDelete").onclick=function(){localStorage.removeItem(MODKEY);card.remove()};card.querySelector("#dzCopy").onclick=function(){navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(data,null,2));alert("Brouillon copié.")};card.querySelector("#dzValidate").onclick=function(){save(data,"draft_validated");alert("Brouillon validé. Contrôle encore l'argent dans POS/PAY avant enregistrement réel.")};
  }
  function boot(){const incoming=readUrl();if(!incoming)return;if(history&&history.replaceState)history.replaceState({},document.title,location.origin+location.pathname);mount(incoming);window.dispatchEvent(new CustomEvent("digiy:action-received",{detail:incoming}))}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
  window.DIGIY_ACTION_RECEIVER={version:VERSION,module:MODULE,mountPanel:mount,parseLine:parse,cleanCommand:clean,readActionFromUrl:readUrl,saveIncomingAction:save};
})();
