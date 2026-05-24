/* ==========================================================================
   DIGIYLYFE — OREILLE POS / MON COMMERCE V1
   Fichier : assets/js/oreille-pos.js
   Version : 2026-05-24 · vente + produit + quantité + prix + paiement
   Dépendance : assets/js/oreille-metier-core.js

   Doctrine :
   L’Oreille écoute.
   DIGIY formule.
   Le commerçant valide.
   POS range.
   Aucune vente, stock, remise, ticket ou paiement n’est confirmé automatiquement.
   ========================================================================== */

(function () {
  "use strict";

  var VERSION = "oreille-pos-v1-20260524";
  var CLIENTS_KEY = "DIGIY_POS_CLIENTS_LOCAL_V1";

  var POS_GUIDE =
    "Bienvenue dans Oreille POS DIGIYLYFE. " +
    "Ici, le commerçant peut parler ou cliquer pour préparer une vente, un ticket, une note de caisse ou une trace client. " +
    "POS aide à préciser le produit, la quantité, le prix unitaire, le total, la remise, le client ou la source, le téléphone, le mode de paiement, le stock, la preuve et le statut. " +
    "Mais POS ne confirme jamais seul une vente, un paiement, une remise ou une sortie de stock. " +
    "Le commerçant vérifie le prix, la quantité, le stock, le paiement et le ticket avant de valider. " +
    "L’Oreille prépare. DIGIY formule. Le commerçant relit. Le commerçant valide. POS range. " +
    "Le terrain garde la main.";

  var POS_TEMPLATES = [
    "🧾 Nouvelle vente — produit · quantité · prix · total · mode cash/Wave/autre.",
    "📦 Produit vendu — produit · quantité · stock restant · client/source.",
    "💰 Paiement reçu — montant · mode cash/Wave/autre · client · preuve.",
    "🏷️ Remise — produit · prix initial · remise · prix final · raison.",
    "📋 Ticket client — produits · quantités · total · mode · téléphone.",
    "📉 Stock à corriger — produit · quantité réelle · raison · date.",
    "↩️ Retour / échange — produit · client · téléphone · raison · statut.",
    "🧍 Client à noter — nom · téléphone · produit · détail.",
    "📒 Vente à crédit — client · téléphone · montant dû · date prévue.",
    "⚠️ Doute / brouillon — garder en note, ne pas valider la caisse."
  ];

  var POS_CONFIG = {
    module: "POS",
    title: "Oreille POS",
    subtitle: "Produit · quantité · prix · total · client · paiement · stock · ticket.",
    storagePrefix: "DIGIY_OREILLE_METIER",
    guideText: POS_GUIDE,
    templates: POS_TEMPLATES
  };

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.!?;:])/g, "$1")
      .trim();
  }

  function lower(value) {
    return normalizeText(value).toLowerCase();
  }

  function findMountTarget() {
    return (
      document.querySelector("#digiy-oreille-pos") ||
      document.querySelector("[data-digiy-oreille-pos]") ||
      document.querySelector("[data-digiy-pos-oreille]") ||
      document.querySelector("#digiy-oreille-metier") ||
      document.querySelector("[data-digiy-oreille]")
    );
  }

  function extractField(text, labels) {
    var clean = normalizeText(text);

    for (var i = 0; i < labels.length; i += 1) {
      var label = labels[i];

      var re = new RegExp(
        "(?:^|[\\s;,.|—-])" +
          label +
          "\\s*[:\\-]?\\s*([^;|\\n]+?)(?=\\s+(?:produit|article|client|source|nom|tel|tél|telephone|téléphone|quantité|quantite|nombre|prix|tarif|montant|total|remise|stock|mode|paiement|preuve|ticket|détail|detail|statut|raison|date|heure)\\s*[:\\-]|$)",
        "i"
      );

      var match = clean.match(re);
      if (match && match[1]) return normalizeText(match[1]);
    }

    return "";
  }

  function extractPhone(text) {
    var clean = normalizeText(text);
    var explicit = clean.match(/(?:tel|tél|telephone|téléphone|phone|numéro|numero)\s*[:\-]?\s*((?:\+?\d[\d\s().-]{6,}\d))/i);
    if (explicit && explicit[1]) return normalizeText(explicit[1]);

    var any = clean.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
    return any ? normalizeText(any[0]) : "";
  }

  function extractClientName(text) {
    var explicit = extractField(text, ["client", "source", "nom", "personne"]);
    if (explicit) return explicit;

    var clean = normalizeText(text);
    var match = clean.match(/\b(?:client|pour|avec|chez)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'.-]{1,40})/i);

    if (match && match[1]) {
      var candidate = normalizeText(match[1])
        .replace(/\b(?:tel|produit|prix|quantité|quantite|total|cash|wave|stock)\b.*$/i, "")
        .trim();

      if (candidate && candidate.length <= 45) return candidate;
    }

    return "";
  }

  function extractProduct(text) {
    var explicit = extractField(text, ["produit", "article", "objet", "marchandise"]);
    if (explicit) return explicit;

    var clean = normalizeText(text);
    var match = clean.match(/\b(?:vente|vendu|vendre|ticket|achat|acheter)\s+([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s'.-]{1,50})/i);

    if (match && match[1]) {
      var candidate = normalizeText(match[1])
        .replace(/\b(?:prix|quantité|quantite|total|cash|wave|fcfa|cfa|stock)\b.*$/i, "")
        .trim();

      if (candidate && candidate.length <= 60) return candidate;
    }

    return "";
  }

  function extractQuantity(text) {
    var explicit = extractField(text, ["quantité", "quantite", "nombre", "qté", "qte"]);
    if (explicit) return explicit;

    var clean = normalizeText(text);
    var match = clean.match(/\b(\d{1,4})\s*(pièces|pieces|pcs|unités|unites|articles|x)?\b/i);

    if (match && match[1]) {
      var n = Number(match[1]);
      if (n > 0 && n < 10000) return String(n);
    }

    return "";
  }

  function extractMoneyByLabel(text, labels) {
    var explicit = extractField(text, labels);
    if (explicit) return explicit;

    return "";
  }

  function extractFirstMoney(text) {
    var clean = normalizeText(text);
    var match = clean.match(/\b(\d[\d\s.,]*)\s*(fcfa|f\s*cfa|xof|cfa|€|eur|euro|euros)\b/i);

    if (match && match[1]) {
      return normalizeText(match[1] + " " + (match[2] || ""));
    }

    return "";
  }

  function extractUnitPrice(text) {
    return extractMoneyByLabel(text, ["prix unitaire", "prix", "tarif"]) || extractFirstMoney(text);
  }

  function extractTotal(text) {
    return extractMoneyByLabel(text, ["total", "montant total", "montant"]);
  }

  function extractDiscount(text) {
    return extractField(text, ["remise", "réduction", "reduction", "rabais"]);
  }

  function extractStock(text) {
    return extractField(text, ["stock", "stock restant", "reste", "quantité réelle", "quantite reelle"]);
  }

  function extractPaymentMode(text) {
    var explicit = extractField(text, ["mode", "paiement", "mode paiement"]);
    if (explicit) return explicit;

    var t = lower(text);

    if (/wave|wav/.test(t)) return "Wave";
    if (/cash|espèce|espece|liquide/.test(t)) return "cash";
    if (/orange money|om\b/.test(t)) return "Orange Money";
    if (/virement|banque|carte|chèque|cheque|autre|mobile money/.test(t)) return "autre";

    return "";
  }

  function extractProof(text) {
    var proof = extractField(text, ["preuve", "ticket", "reçu", "recu", "capture"]);
    if (proof) return proof;

    var t = lower(text);
    if (/ticket|preuve|capture|reçu|recu|photo/.test(t)) return "à vérifier";

    return "";
  }

  function extractDetail(text) {
    return extractField(text, [
      "détail",
      "detail",
      "description",
      "note",
      "raison",
      "message",
      "taille",
      "couleur",
      "marque"
    ]);
  }

  function extractDate(text) {
    var explicit = extractField(text, ["date", "jour"]);
    if (explicit) return explicit;

    var clean = normalizeText(text);

    var numeric = clean.match(/\b(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\b/);
    if (numeric && numeric[1]) return numeric[1];

    var natural = clean.match(/\b(aujourd'hui|demain|après-demain|apres-demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i);
    if (natural && natural[1]) return natural[1];

    return "";
  }

  function guessStatus(text) {
    var t = lower(text);

    if (/crédit|credit|dette|à payer|a payer|reste à payer|reste a payer|client doit/.test(t)) return "vente à crédit";
    if (/payé|paye|paiement|wave|cash|reçu|recu/.test(t)) return "paiement à vérifier";
    if (/remise|réduction|reduction|rabais/.test(t)) return "remise à vérifier";
    if (/retour|échange|echange|rembours/.test(t)) return "retour / échange";
    if (/stock|rupture|reste|corriger/.test(t)) return "stock à vérifier";
    if (/ticket|reçu|recu/.test(t)) return "ticket à préparer";

    return "brouillon caisse";
  }

  function missingFields(draft) {
    var missing = [];

    if (!draft.product) missing.push("produit");
    if (!draft.quantity) missing.push("quantité");
    if (!draft.unit_price) missing.push("prix unitaire");
    if (!draft.total) missing.push("total");
    if (!draft.payment_mode) missing.push("mode cash/Wave/autre");
    if (!draft.client_name) missing.push("client/source");
    if (!draft.client_phone) missing.push("téléphone");
    if (!draft.proof) missing.push("preuve/ticket");

    return missing;
  }

  function buildPosDraft(text) {
    var clean = normalizeText(text);

    var draft = {
      module: "POS",
      raw_text: clean,
      product: extractProduct(clean),
      quantity: extractQuantity(clean),
      unit_price: extractUnitPrice(clean),
      total: extractTotal(clean),
      discount: extractDiscount(clean),
      stock: extractStock(clean),
      client_name: extractClientName(clean),
      client_phone: extractPhone(clean),
      payment_mode: extractPaymentMode(clean),
      proof: extractProof(clean),
      detail: extractDetail(clean),
      date: extractDate(clean),
      status: guessStatus(clean),
      created_at: new Date().toISOString(),
      warning: "À vérifier par le commerçant avant validation caisse."
    };

    draft.missing = missingFields(draft);
    return draft;
  }

  function formatPosDraftMessage(draft) {
    if (!draft || !draft.raw_text) {
      return "POS · Note vide : préciser produit, quantité, prix, total, mode, client et ticket avant validation.";
    }

    var productPart = "Produit : " + (draft.product || "à préciser");
    var qtyPart = "Quantité : " + (draft.quantity || "à préciser");
    var unitPart = "Prix unitaire : " + (draft.unit_price || "à préciser");
    var totalPart = "Total : " + (draft.total || "à calculer / vérifier");
    var discountPart = "Remise : " + (draft.discount || "aucune / à préciser");
    var stockPart = "Stock : " + (draft.stock || "à vérifier si utile");
    var clientPart = "Client/source : " + (draft.client_name || "à préciser");
    var phonePart = "Téléphone : " + (draft.client_phone || "à préciser");
    var modePart = "Mode : " + (draft.payment_mode || "cash / Wave / autre à choisir");
    var proofPart = "Ticket/preuve : " + (draft.proof || "à vérifier");
    var detailPart = "Détail : " + (draft.detail || "à préciser");
    var statusPart = "Statut : " + (draft.status || "brouillon caisse");

    var missing =
      draft.missing && draft.missing.length
        ? "Manque : " + draft.missing.join(", ") + ". "
        : "Trace complète à vérifier. ";

    var warning =
      "POS ne valide pas seul. Le commerçant doit vérifier produit, quantité, prix, paiement, stock et ticket avant validation.";

    if (draft.status === "vente à crédit") {
      warning = "Vente à crédit : ce montant reste à recevoir. Il ne devient pas cash tant qu’un vrai paiement n’est pas confirmé.";
    }

    if (draft.status === "paiement à vérifier") {
      warning = "Paiement à vérifier avant de compter l’argent comme reçu.";
    }

    return (
      "POS · Vente préparée — " +
      productPart +
      " · " +
      qtyPart +
      " · " +
      unitPart +
      " · " +
      totalPart +
      " · " +
      discountPart +
      " · " +
      stockPart +
      " · " +
      clientPart +
      " · " +
      phonePart +
      " · " +
      modePart +
      " · " +
      proofPart +
      " · " +
      detailPart +
      " · " +
      statusPart +
      ". " +
      missing +
      warning +
      " Texte d’origine : " +
      draft.raw_text
    );
  }

  function formulatePosDeep(text) {
    return formatPosDraftMessage(buildPosDraft(text));
  }

  function getClients() {
    try {
      var raw = localStorage.getItem(CLIENTS_KEY) || "[]";
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  function setClients(clients) {
    try {
      localStorage.setItem(CLIENTS_KEY, JSON.stringify((clients || []).slice(0, 200)));
    } catch (_err) {}
  }

  function upsertClientFromDraft(draft) {
    if (!draft || (!draft.client_name && !draft.client_phone)) return null;

    var clients = getClients();
    var phone = normalizeText(draft.client_phone);
    var name = normalizeText(draft.client_name) || "Client sans nom";
    var found = null;

    if (phone) {
      found = clients.find(function (c) {
        return normalizeText(c.phone) === phone;
      });
    }

    if (!found && name) {
      found = clients.find(function (c) {
        return lower(c.name) === lower(name);
      });
    }

    var now = new Date().toISOString();

    if (found) {
      found.name = found.name || name;
      found.phone = found.phone || phone;
      found.last_product = draft.product || found.last_product || "";
      found.last_total = draft.total || found.last_total || "";
      found.last_payment_mode = draft.payment_mode || found.last_payment_mode || "";
      found.last_status = draft.status || found.last_status || "";
      found.updated_at = now;
    } else {
      found = {
        id: "pos_client_" + Date.now(),
        name: name,
        phone: phone,
        last_product: draft.product || "",
        last_total: draft.total || "",
        last_payment_mode: draft.payment_mode || "",
        last_status: draft.status || "brouillon caisse",
        notes: "",
        created_at: now,
        updated_at: now
      };

      clients.unshift(found);
    }

    setClients(clients);
    return found;
  }

  function injectPosStyles() {
    if (document.getElementById("digiyOreillePosStyles")) return;

    var style = document.createElement("style");
    style.id = "digiyOreillePosStyles";
    style.textContent =
      ".digiy-pos-help{" +
        "margin:10px 0 0;" +
        "border:1px dashed rgba(83,58,26,.24);" +
        "border-radius:16px;" +
        "background:rgba(250,204,21,.13);" +
        "padding:10px;" +
        "color:#25351f;" +
        "font-weight:950;" +
        "line-height:1.32;" +
        "font-size:14px;" +
      "}" +

      ".digiy-pos-help b{color:#6b4e09;font-weight:1000}" +

      ".digiy-oreille-templates{" +
        "display:grid!important;" +
        "grid-template-columns:repeat(2,minmax(0,1fr))!important;" +
        "gap:7px!important;" +
        "max-height:220px!important;" +
        "overflow-y:auto!important;" +
        "padding-right:5px!important;" +
        "scroll-snap-type:y proximity!important;" +
        "-webkit-overflow-scrolling:touch!important;" +
        "border:1px solid rgba(83,58,26,.18)!important;" +
        "border-radius:18px!important;" +
        "background:rgba(255,255,255,.38)!important;" +
        "padding:8px!important;" +
      "}" +

      ".digiy-oreille-template{" +
        "min-height:52px!important;" +
        "display:flex!important;" +
        "align-items:center!important;" +
        "justify-content:flex-start!important;" +
        "border-radius:14px!important;" +
        "font-size:12px!important;" +
        "font-weight:1000!important;" +
        "line-height:1.14!important;" +
        "padding:8px!important;" +
        "letter-spacing:-.01em!important;" +
        "scroll-snap-align:start!important;" +
        "overflow:hidden!important;" +
      "}" +

      ".digiy-pos-client-mini{" +
        "margin-top:10px;" +
        "border:1px solid rgba(24,32,20,.14);" +
        "border-radius:16px;" +
        "background:#fffdf4;" +
        "padding:10px;" +
        "font-weight:900;" +
        "color:#182014;" +
        "line-height:1.32;" +
        "font-size:14px;" +
      "}" +

      ".digiy-pos-client-mini b{" +
        "display:block;" +
        "margin-bottom:4px;" +
        "color:#14532d;" +
        "font-weight:1000;" +
      "}" +

      "@media(min-width:760px){" +
        ".digiy-oreille-templates{max-height:245px!important;}" +
        ".digiy-oreille-template{min-height:56px!important;font-size:12.5px!important;}" +
      "}" +

      "@media(max-width:360px){" +
        ".digiy-oreille-templates{max-height:205px!important;}" +
        ".digiy-oreille-template{min-height:49px!important;font-size:11.5px!important;}" +
      "}";

    document.head.appendChild(style);
  }

  function addPosHelp(target) {
    if (!target || target.querySelector(".digiy-pos-help")) return;

    var status = target.querySelector(".digiy-oreille-status");
    if (!status) return;

    var help = document.createElement("div");
    help.className = "digiy-pos-help";
    help.innerHTML =
      "<b>POS demande une trace complète.</b><br>" +
      "Produit · quantité · prix · total · client/source · téléphone · mode cash/Wave/autre · ticket/preuve. " +
      "Aucune vente ou sortie stock n’est validée sans le commerçant.";

    status.insertAdjacentElement("afterend", help);
  }

  function addClientPreview(target) {
    if (!target || target.querySelector(".digiy-pos-client-mini")) return;

    var notes = target.querySelector(".digiy-oreille-notes");
    if (!notes) return;

    var box = document.createElement("div");
    box.className = "digiy-pos-client-mini";
    box.innerHTML =
      "<b>📇 Fichier client POS local</b>" +
      "<span>Quand tu ranges une vente avec nom ou téléphone, POS garde une trace client sur cet appareil.</span>";

    notes.insertAdjacentElement("beforebegin", box);
  }

  function patchInstanceButtons(target, core) {
    if (!target) return;

    target.addEventListener(
      "click",
      function (event) {
        var actionEl = event.target.closest("[data-action]");
        if (!actionEl) return;

        var action = actionEl.getAttribute("data-action");
        var textArea = target.querySelector(".digiy-oreille-text");
        var status = target.querySelector(".digiy-oreille-status");

        if (!textArea) return;

        if (action === "formulate") {
          window.setTimeout(function () {
            textArea.value = formulatePosDeep(textArea.value);
            if (status) status.textContent = "Vente POS préparée. Complète les champs manquants puis valide.";
          }, 0);
        }

        if (action === "save") {
          window.setTimeout(function () {
            var draft = buildPosDraft(textArea.value);
            upsertClientFromDraft(draft);

            if (status) {
              status.textContent =
                draft.missing && draft.missing.length
                  ? "Vente rangée en brouillon. Il manque : " + draft.missing.join(", ") + "."
                  : "Vente rangée. Client local mis à jour si nom ou téléphone présent.";
            }

            if (core && typeof core.showToast === "function") {
              core.showToast("POS rangé en brouillon");
            }
          }, 0);
        }
      },
      true
    );
  }

  function exposePosApi(core) {
    window.DigiyOreillePOS = {
      version: VERSION,
      config: POS_CONFIG,
      templates: POS_TEMPLATES.slice(),
      guideText: POS_GUIDE,
      clientsKey: CLIENTS_KEY,

      detect: function (text) {
        return buildPosDraft(text);
      },

      formulate: function (text) {
        return formulatePosDeep(text);
      },

      getClients: getClients,
      setClients: setClients,

      saveDraft: function (text) {
        var draft = buildPosDraft(text);
        var message = formatPosDraftMessage(draft);

        upsertClientFromDraft(draft);

        if (!core || typeof core.saveNote !== "function") return null;

        return core.saveNote(POS_CONFIG, message, {
          pos_draft: draft,
          sale: draft,
          ticket: draft
        });
      },

      speakGuide: function () {
        if (core && typeof core.speak === "function") core.speak(POS_GUIDE);
      },

      stopVoice: function () {
        if (core && typeof core.stopVoice === "function") core.stopVoice();
      }
    };
  }

  function mountPosOreille(core) {
    var target = findMountTarget();

    exposePosApi(core);
    injectPosStyles();

    if (!target) {
      console.info("[DIGIY Oreille POS] Aucun conteneur trouvé. Ajoute <div id=\"digiy-oreille-pos\"></div> pour afficher l’oreille.");
      return;
    }

    if (target.getAttribute("data-digiy-oreille-mounted") === "1") return;

    target.setAttribute("data-digiy-oreille-mounted", "1");

    var instance = core.mount({
      target: target,
      module: POS_CONFIG.module,
      title: POS_CONFIG.title,
      subtitle: POS_CONFIG.subtitle,
      storagePrefix: POS_CONFIG.storagePrefix,
      guideText: POS_CONFIG.guideText,
      templates: POS_CONFIG.templates
    });

    window.DigiyOreillePOS.instance = instance || null;

    addPosHelp(target);
    addClientPreview(target);
    patchInstanceButtons(target, core);

    console.info("[DIGIY Oreille POS] montée avec succès.");
  }

  function bootPosOreille() {
    var tries = 0;
    var maxTries = 30;

    function attempt() {
      tries += 1;

      var core = window.DigiyOreilleMetier;

      if (core && typeof core.mount === "function") {
        mountPosOreille(core);
        return;
      }

      if (tries >= maxTries) {
        console.warn("[DIGIY Oreille POS] Core introuvable. Vérifie que oreille-metier-core.js est chargé avant oreille-pos.js.");
        return;
      }

      window.setTimeout(attempt, 100);
    }

    attempt();
  }

  ready(bootPosOreille);
})();
