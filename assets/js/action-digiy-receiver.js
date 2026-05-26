/* =========================================================
   ACTION DIGIY RECEIVER — DIGIYLYFE
   Reçoit un brouillon venant de https://action-digiy.digiylyfe.com/
   Doctrine :
   - ACTION DIGIY prépare seulement.
   - Le module reçoit.
   - Le pro valide.
   - Rien n’est envoyé, publié, payé, réservé ou confirmé automatiquement.
   ========================================================= */

(function () {
  "use strict";

  const RECEIVER_VERSION = "action-digiy-receiver-v1-20260526";

  const HOST = String(window.location.hostname || "").toLowerCase();

  const MODULE_BY_HOST = (() => {
    if (HOST.includes("commerce-pro")) return "POS";
    if (HOST.includes("pro-pay")) return "PAY";
    if (HOST.includes("pro-driver")) return "DRIVER";
    if (HOST.includes("pro-loc")) return "LOC";
    if (HOST.includes("pro-resa")) return "RESA";
    if (HOST.includes("pro-market")) return "MARKET";
    if (HOST.includes("reseau-digiy")) return "RESEAU_DIGIY";
    if (HOST.includes("pro-build")) return "BUILD";
    if (HOST.includes("pro-job")) return "JOBS";
    return "MODULE";
  })();

  const STORAGE = {
    latest: "DIGIY_INCOMING_ACTION",
    queue: "DIGIY_INCOMING_ACTION_QUEUE",
    moduleLatest: "DIGIY_" + MODULE_BY_HOST + "_INCOMING_ACTION",
    moduleQueue: "DIGIY_" + MODULE_BY_HOST + "_INCOMING_ACTION_QUEUE"
  };

  function normalizeText(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, " ")
      .replace(/[.,;:!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanCommand(text) {
    let t = String(text || "").trim();

    t = t
      .replace(/^\s*action\s+digi\s+i\s*/i, "")
      .replace(/^\s*action\s+diji\s+i\s*/i, "")
      .replace(/^\s*action\s+dgi\s+i\s*/i, "")
      .replace(/^\s*action\s+dj\s*/i, "")
      .replace(/^\s*action\s+d\s*j\s*/i, "")
      .replace(/^\s*action\s+dji\s*/i, "")
      .replace(/^\s*action\s+digiy\s*/i, "")
      .replace(/^\s*digiy\s*/i, "")
      .replace(/^\s*digi\s*i\s*/i, "")
      .trim();

    t = t
      .replace(/^\s*(note|ajoute|ajouter|prépare|prepare|crée|cree|mets|met)\s+/i, "")
      .trim();

    return t;
  }

  function safeJsonParse(value) {
    if (!value) return null;

    const attempts = [];

    attempts.push(value);

    try {
      attempts.push(decodeURIComponent(value));
    } catch (_) {}

    try {
      attempts.push(atob(value));
    } catch (_) {}

    try {
      const decoded = decodeURIComponent(value);
      attempts.push(atob(decoded));
    } catch (_) {}

    for (const candidate of attempts) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object") return parsed;
      } catch (_) {}
    }

    return null;
  }

  function readActionFromUrl() {
    const hash = String(window.location.hash || "");
    const query = String(window.location.search || "");

    const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(query.replace(/^\?/, ""));

    const raw =
      hashParams.get("digiyAction") ||
      hashParams.get("action") ||
      queryParams.get("digiyAction") ||
      queryParams.get("action");

    return safeJsonParse(raw);
  }

  function cleanUrlAfterReception() {
    if (!window.history || !window.history.replaceState) return;

    const cleanUrl = window.location.origin + window.location.pathname + window.location.search.replace(/[?&](digiyAction|action)=[^&]+/g, "");
    window.history.replaceState({}, document.title, cleanUrl);
  }

  function readQueue(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function saveIncomingAction(action) {
    const safeAction = {
      ...action,
      receiverVersion: RECEIVER_VERSION,
      receivedAt: new Date().toISOString(),
      receivedByModule: MODULE_BY_HOST,
      commandText: cleanCommand(action.commandText || action.rawText || action.note || ""),
      rawText: cleanCommand(action.rawText || action.commandText || action.note || ""),
      requiresHumanValidation: true,
      status: "received_draft"
    };

    localStorage.setItem(STORAGE.latest, JSON.stringify(safeAction));
    localStorage.setItem(STORAGE.moduleLatest, JSON.stringify(safeAction));

    const q1 = readQueue(STORAGE.queue);
    q1.unshift(safeAction);
    localStorage.setItem(STORAGE.queue, JSON.stringify(q1.slice(0, 50)));

    const q2 = readQueue(STORAGE.moduleQueue);
    q2.unshift(safeAction);
    localStorage.setItem(STORAGE.moduleQueue, JSON.stringify(q2.slice(0, 50)));

    return safeAction;
  }

  function isRelevantForThisModule(action) {
    const primary =
      action.primaryModule ||
      action.module ||
      action.targetModule ||
      "";

    const linked = Array.isArray(action.linkedModules) ? action.linkedModules : [];

    if (primary === MODULE_BY_HOST) return true;
    if (linked.includes(MODULE_BY_HOST)) return true;

    if (MODULE_BY_HOST === "PAY" && linked.includes("PAY")) return true;
    if (MODULE_BY_HOST === "POS" && (primary === "POS" || linked.includes("POS"))) return true;

    return false;
  }

  function moduleLabel(code) {
    const labels = {
      POS: "POS / Mon commerce",
      PAY: "PAY / Mon argent",
      DRIVER: "DRIVER",
      LOC: "LOC",
      RESA: "RESA",
      MARKET: "MARKET",
      RESEAU_DIGIY: "RÉSEAU DIGIY",
      BUILD: "Mes services",
      JOBS: "JOBS",
      MODULE: "Module DIGIY"
    };
    return labels[code] || code || "Module DIGIY";
  }

  function actionLabel(action) {
    const labels = {
      ADD_SALE: "Ajouter une vente",
      ADD_EXPENSE: "Ajouter une dépense",
      ADD_MOVEMENT: "Ajouter un mouvement",
      ADD_RECEIVABLE: "Noter une dette client",
      PREPARE_TRIP: "Préparer une course",
      CLOSE_AVAILABILITY: "Fermer une disponibilité",
      PREPARE_BOOKING: "Préparer une réservation",
      PREPARE_ANNOUNCEMENT: "Préparer une annonce",
      PREPARE_QUOTE: "Préparer un devis"
    };
    return labels[action] || action || "Action métier";
  }

  function formatAmount(action) {
    if (!action.amount) return "—";
    const n = Number(action.amount);
    if (!Number.isFinite(n)) return String(action.amount);
    return n.toLocaleString("fr-FR") + " FCFA";
  }

  function copyText(text) {
    const value = String(text || "");
    if (!value) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).catch(() => {
        window.prompt("Copie :", value);
      });
    } else {
      window.prompt("Copie :", value);
    }
  }

  function fillPossibleFields(action) {
    const note = cleanCommand(action.commandText || action.rawText || "");
    const amount = action.amount ? String(action.amount) : "";
    const channel = action.channel || "";

    const noteSelectors = [
      "#note",
      "#quickNote",
      "#payNote",
      "#posNote",
      "#movementNote",
      "#description",
      "textarea[name='note']",
      "textarea[name='description']",
      "input[name='note']",
      "input[name='description']"
    ];

    const amountSelectors = [
      "#amount",
      "#montant",
      "#payAmount",
      "#posAmount",
      "input[name='amount']",
      "input[name='montant']"
    ];

    const channelSelectors = [
      "#channel",
      "#paymentChannel",
      "#mode",
      "select[name='channel']",
      "select[name='mode']",
      "input[name='channel']",
      "input[name='mode']"
    ];

    noteSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!el.value) el.value = note;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    amountSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!el.value && amount) el.value = amount;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    channelSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!el.value && channel) el.value = channel;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  }

  function buildPanel(action) {
    const panel = document.createElement("section");
    panel.id = "digiyActionReceiverPanel";
    panel.setAttribute("aria-live", "polite");

    const relevant = isRelevantForThisModule(action);

    panel.innerHTML = `
      <style>
        #digiyActionReceiverPanel{
          position:relative;
          z-index:9998;
          margin:14px auto;
          width:min(980px,calc(100% - 24px));
          border:1px solid rgba(246,196,83,.38);
          border-radius:24px;
          background:
            radial-gradient(650px 260px at 12% 0%,rgba(246,196,83,.18),transparent 62%),
            linear-gradient(135deg,rgba(6,20,15,.96),rgba(7,30,19,.96));
          color:#fff8e8;
          box-shadow:0 20px 52px rgba(0,0,0,.32);
          padding:16px;
          font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
        }
        #digiyActionReceiverPanel *{box-sizing:border-box}
        .digiyRecvTop{
          display:flex;
          justify-content:space-between;
          gap:12px;
          align-items:flex-start;
          margin-bottom:12px;
        }
        .digiyRecvBadge{
          display:inline-flex;
          align-items:center;
          gap:7px;
          padding:7px 10px;
          border-radius:999px;
          border:1px solid rgba(246,196,83,.38);
          background:rgba(246,196,83,.12);
          color:#ffe3a0;
          font-size:12px;
          font-weight:900;
        }
        .digiyRecvTitle{
          margin:8px 0 0;
          font-size:26px;
          line-height:1.05;
          letter-spacing:-.04em;
          font-weight:1000;
        }
        .digiyRecvClose{
          width:38px;
          height:38px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.16);
          background:rgba(255,255,255,.08);
          color:#fff;
          font-size:20px;
          cursor:pointer;
        }
        .digiyRecvGrid{
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:9px;
          margin:12px 0;
        }
        .digiyRecvMini{
          border:1px solid rgba(255,255,255,.13);
          background:rgba(255,255,255,.07);
          border-radius:17px;
          padding:11px;
          min-height:74px;
        }
        .digiyRecvMini small{
          display:block;
          color:rgba(255,248,232,.68);
          font-weight:800;
          margin-bottom:5px;
        }
        .digiyRecvMini b{
          display:block;
          color:#fff;
          font-size:16px;
          font-weight:1000;
          overflow-wrap:anywhere;
        }
        .digiyRecvNote{
          border:1px solid rgba(46,229,139,.25);
          background:rgba(46,229,139,.08);
          color:#eafff3;
          border-radius:18px;
          padding:13px;
          font-weight:850;
          line-height:1.42;
          margin-top:10px;
        }
        .digiyRecvWarning{
          border-color:rgba(251,113,133,.30);
          background:rgba(251,113,133,.10);
          color:#ffe3e8;
        }
        .digiyRecvActions{
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:9px;
          margin-top:12px;
        }
        .digiyRecvActions button,
        .digiyRecvActions a{
          min-height:48px;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.16);
          background:rgba(255,255,255,.08);
          color:#fff;
          display:flex;
          align-items:center;
          justify-content:center;
          text-align:center;
          padding:0 10px;
          cursor:pointer;
          text-decoration:none;
          font-weight:1000;
        }
        .digiyRecvActions .gold{
          background:linear-gradient(135deg,#ffe3a0,#f4c86a);
          color:#10160f;
          border-color:rgba(246,196,83,.45);
        }
        .digiyRecvActions .green{
          background:linear-gradient(135deg,#aaffcd,#2ee58b);
          color:#041207;
          border-color:rgba(46,229,139,.45);
        }
        .digiyRecvActions .red{
          background:rgba(251,113,133,.13);
          color:#ffe3e8;
          border-color:rgba(251,113,133,.32);
        }
        @media(max-width:760px){
          .digiyRecvGrid{grid-template-columns:1fr 1fr}
          .digiyRecvActions{grid-template-columns:1fr 1fr}
        }
        @media(max-width:430px){
          .digiyRecvGrid{grid-template-columns:1fr}
          .digiyRecvActions{grid-template-columns:1fr}
        }
      </style>

      <div class="digiyRecvTop">
        <div>
          <div class="digiyRecvBadge">🎙️ Reçu depuis ACTION DIGIY</div>
          <h2 class="digiyRecvTitle">DIGIY a préparé un brouillon.</h2>
        </div>
        <button class="digiyRecvClose" type="button" data-digiy-close aria-label="Fermer">×</button>
      </div>

      <div class="digiyRecvGrid">
        <div class="digiyRecvMini">
          <small>Module actuel</small>
          <b>${moduleLabel(MODULE_BY_HOST)}</b>
        </div>
        <div class="digiyRecvMini">
          <small>Module demandé</small>
          <b>${moduleLabel(action.primaryModule || action.module)}</b>
        </div>
        <div class="digiyRecvMini">
          <small>Action</small>
          <b>${actionLabel(action.action)}</b>
        </div>
        <div class="digiyRecvMini">
          <small>Montant</small>
          <b>${formatAmount(action)}</b>
        </div>
      </div>

      <div class="digiyRecvNote ${relevant ? "" : "digiyRecvWarning"}">
        <strong>Note propre :</strong><br>
        ${cleanCommand(action.commandText || action.rawText || "") || "—"}
        <br><br>
        ${relevant
          ? "Ce brouillon concerne ce module. Le pro peut maintenant modifier, confirmer ou annuler."
          : "Attention : ce brouillon semble destiné à un autre module. Il est affiché ici seulement pour contrôle."}
        <br>
        Rien n’est confirmé automatiquement.
      </div>

      <div class="digiyRecvActions">
        <button class="green" type="button" data-digiy-fill>✅ Pré-remplir ici</button>
        <button class="gold" type="button" data-digiy-copy>📋 Copier la note</button>
        <button type="button" data-digiy-save>💾 Garder brouillon</button>
        <button class="red" type="button" data-digiy-delete>✖ Effacer</button>
      </div>
    `;

    panel.querySelector("[data-digiy-close]").addEventListener("click", function () {
      panel.remove();
    });

    panel.querySelector("[data-digiy-copy]").addEventListener("click", function () {
      copyText(cleanCommand(action.commandText || action.rawText || ""));
    });

    panel.querySelector("[data-digiy-save]").addEventListener("click", function () {
      saveIncomingAction(action);
      alert("Brouillon ACTION DIGIY gardé dans ce module.");
    });

    panel.querySelector("[data-digiy-delete]").addEventListener("click", function () {
      localStorage.removeItem(STORAGE.latest);
      localStorage.removeItem(STORAGE.moduleLatest);
      panel.remove();
    });

    panel.querySelector("[data-digiy-fill]").addEventListener("click", function () {
      fillPossibleFields(action);
      saveIncomingAction(action);
      alert("Brouillon pré-rempli si la page possède les champs compatibles. Vérifie puis valide.");
    });

    return panel;
  }

  function mountPanel(action) {
    const old = document.getElementById("digiyActionReceiverPanel");
    if (old) old.remove();

    const panel = buildPanel(action);

    const preferred =
      document.querySelector("main") ||
      document.querySelector(".page") ||
      document.querySelector(".shell") ||
      document.body;

    if (preferred === document.body) {
      document.body.insertBefore(panel, document.body.firstChild);
    } else {
      preferred.insertBefore(panel, preferred.firstChild);
    }
  }

  function boot() {
    const incoming = readActionFromUrl();
    if (!incoming) return;

    const saved = saveIncomingAction(incoming);
    cleanUrlAfterReception();
    mountPanel(saved);

    window.dispatchEvent(
      new CustomEvent("digiy:action-received", {
        detail: saved
      })
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.DIGIY_ACTION_RECEIVER = {
    version: RECEIVER_VERSION,
    module: MODULE_BY_HOST,
    readActionFromUrl,
    saveIncomingAction,
    mountPanel,
    cleanCommand
  };
})();
