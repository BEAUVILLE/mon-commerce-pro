/* DIGIY GO POS — vocabulaire caisse commerce FR WO AR
   POS garde articles, quantités, prix, stock, ticket. PAY reçoit seulement l'argent final.
*/
(function(){
  "use strict";
  var vocab={
    module:"POS",
    label:"Mon commerce",
    version:"pos-vocab-fr-wo-ar-20260528",
    languages:["fr","wo","ar"],
    doctrine:"Le pro ou le client parle en français, wolof ou arabe. POS prépare l'addition article par article. Le pro valide. PAY reçoit seulement le total final.",
    intents:{
      sale:["vendre","vente","ajoute","mets","prends","client prend","facture","ticket","addition","jaay","jënd","jox","facture","بيع","فاتورة","إضافة","حساب"],
      stock:["stock","reste","quantité","quantite","marchandise","arrivage","réassort","reassort","des","desit","stock","marsaandise","مخزون","باقي","كمية","بضاعة"],
      discount:["remise","réduction","reduction","cadeau","prix spécial","waññi","cadeau","تخفيض","هدية","سعر خاص"],
      payment:["cash","espèces","especes","wave","orange money","carte","tpe","xaalis","kesh","كاش","نقدا","وايف","أورنج موني","بطاقة"]
    },
    fields:{
      quantity:["un","une","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","benn","ñaar","ñett","ñent","juróom","واحد","اثنين","ثلاثة","أربعة","خمسة","ستة","سبعة","ثمانية","تسعة","عشرة"],
      product:["savon","serviette","drap","peignoir","fouta","crème","creme","sac","chaussure","riz","huile","sucre","article","produit","saabu","serviet","sëru","dara","mbubb","riz","diwlin","suukar","صابون","منشفة","ملاءة","كيس","حذاء","أرز","زيت","سكر","منتج"],
      unitPrice:["à","a","prix","unité","unite","pièce","piece","njëg","unité","سعر","ثمن","وحدة","قطعة"],
      total:["total","sous-total","addition","lépp","total","المجموع","الحساب"],
      client:["client","nom","pour","kiliyaan","tur","زبون","اسم"]
    },
    examples:["deux serviettes de bain à 5000 cash","ñaar serviette 5000 cash","منشفتين بسعر 5000 كاش"],
    payBridge:{allowed:true,onlyAfterValidation:true,phrasePrefix:"recette commerce POS",forbidden:"Ne jamais envoyer le détail article par article dans PAY."},
    safety:["aucune vente automatique","aucun stock modifié sans clic pro","aucun paiement confirmé sans validation humaine"]
  };
  window.DIGIY_GO_VOCABS=window.DIGIY_GO_VOCABS||{};
  window.DIGIY_GO_VOCABS.POS=vocab;
  window.DIGIY_GO_POS_VOCAB=vocab;
})();
