/* ═══════════════════════════════════════════════════════════════════════════
   DIGIY POS → PAY · RECETTE FINALE
   POS garde le détail de la vente.
   PAY reçoit seulement l'argent réel : montant total + canal + origine.
   Rien sur les articles n'est recopié dans PAY pour éviter la double caisse.
   ═══════════════════════════════════════════════════════════════════════════ */

const DIGIY_PAY_ACTIONS_KEY = "DIGIY_PAY_ACTIONS";
const DIGIY_PAY_PENDING_KEY = "DIGIY_PAY_PENDING_ACTION";
const DIGIY_PAY_POS_OUTBOX_KEY = "DIGIY_PAY_POS_OUTBOX";
const DIGIY_PAY_HANDOFF_KEY = "DIGIY_PAY_HANDOFF_URL";

function normalizePayChannelFromPos(payCode, payLabel){
  const raw = String(payLabel || payCode || "").toLowerCase();
  if(raw.includes("wave")) return "Wave";
  if(raw.includes("orange")) return "Orange Money";
  if(raw.includes("carte") || raw.includes("tpe") || raw.includes("crd")) return "Carte";
  return "Cash";
}

function makePosPayProofRef(vente){
  const rawId = vente && vente.id ? String(vente.id) : String(Date.now());
  return "POS-PAY-" + rawId.replace(/[^0-9A-Za-z_-]/g, "");
}

function formatPayBridgeDate(value){
  const d = value ? new Date(value) : new Date();
  if(isNaN(d.getTime())) return new Date().toLocaleString("fr-FR");
  return d.toLocaleString("fr-FR");
}

function buildPosPayMovement(vente){
  const total = Number(vente && vente.total || 0);
  const channel = normalizePayChannelFromPos(vente && vente.pay, vente && vente.payLabel);
  const ref = makePosPayProofRef(vente);
  const when = (vente && vente.date) || new Date().toISOString();
  const client = String((vente && vente.client) || "").trim();

  const movement = {
    id: "PAY_FROM_POS_" + Date.now(),
    proofRef: ref,
    source: "POS",
    sourceLabel: "MON COMMERCE POS",
    module: "PAY",
    type: "income",
    typeLabel: "Recette",
    amount: total,
    currency: "XOF",
    channel: channel,
    who: client || "Commerce POS",
    client: client || "Commerce POS",
    category: "Recette Commerce POS",
    note: "Recette Commerce POS — " + fmt(total) + " — " + channel,
    rawText: "Recette Commerce POS " + Math.round(total) + " " + channel,
    status: "validated",
    requiresHumanValidation: false,
    validatedBy: "POS",
    createdAt: when,
    validatedAt: new Date().toISOString(),
    posSaleId: vente && vente.id ? vente.id : null,
    posDay: vente && vente.day ? vente.day : "",
    sourceOrigin: location.origin,
    safety: {
      noArticleDetailInPay: true,
      posKeepsItems: true,
      payKeepsFinalMoney: true,
      humanValidatedInPos: true
    }
  };

  movement.proofText = [
    "PREUVE PAY — RECETTE POS",
    "Référence : " + movement.proofRef,
    "Date : " + formatPayBridgeDate(movement.validatedAt),
    "Type : Recette Commerce POS",
    "Montant : " + fmt(movement.amount),
    "Canal : " + movement.channel,
    "Origine : Commerce POS",
    "Client : " + (client || "Non précisé"),
    "Validation : vente encaissée dans POS",
    "Détail articles : conservé dans POS uniquement"
  ].join("\n");

  return movement;
}

function buildPayHandoffUrl(movement){
  const base = window.DIGIY_PAY_ACTION_URL || "https://pro-pay.digiylyfe.com/action.html";

  try{
    const url = new URL(base, location.href);
    url.searchParams.set("from", "POS");
    url.searchParams.set("type", "income");
    url.searchParams.set("amount", String(Math.round(Number(movement.amount || 0))));
    url.searchParams.set("channel", movement.channel || "Cash");
    url.searchParams.set("category", movement.category || "Recette Commerce POS");
    url.searchParams.set("who", movement.who || "Commerce POS");
    url.searchParams.set("proofRef", movement.proofRef || "");
    return url.toString();
  }catch(_){
    return base;
  }
}

function sendPosReceiptToPay(vente){
  try{
    if(!vente || Number(vente.total || 0) <= 0) return false;

    const movement = buildPosPayMovement(vente);

    const actions = readJSON(DIGIY_PAY_ACTIONS_KEY, []);
    const list = Array.isArray(actions) ? actions : [];
    list.unshift(movement);

    saveJSON(DIGIY_PAY_ACTIONS_KEY, list.slice(0, 200));
    saveJSON(DIGIY_PAY_PENDING_KEY, movement);

    const outbox = readJSON(DIGIY_PAY_POS_OUTBOX_KEY, []);
    const out = Array.isArray(outbox) ? outbox : [];
    out.unshift(movement);
    saveJSON(DIGIY_PAY_POS_OUTBOX_KEY, out.slice(0, 200));

    localStorage.setItem(DIGIY_PAY_HANDOFF_KEY, buildPayHandoffUrl(movement));
    localStorage.setItem("DIGIY_PAY_POS_TOUCH", String(Date.now()));

    return true;
  }catch(e){
    try{ console.warn("[DIGIY POS→PAY] Pont non bloquant :", e); }catch(_){}
    return false;
  }
}

function openPayHandoff(){
  try{
    const url = localStorage.getItem(DIGIY_PAY_HANDOFF_KEY) || "https://pro-pay.digiylyfe.com/action.html";
    window.location.href = url;
  }catch(_){
    window.location.href = "https://pro-pay.digiylyfe.com/action.html";
  }
}
