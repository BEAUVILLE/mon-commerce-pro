/* DIGIY GO POS — vocabulaire métier caisse commerce
   POS garde les articles, quantités, prix, stock, ticket. PAY reçoit seulement l'argent final.
*/
(function(){
  "use strict";
  var vocab={
    module:"POS",
    label:"Mon commerce",
    version:"pos-vocab-20260528",
    doctrine:"Quantité + produit → addition préparée → clic Total. POS détaille la vente. PAY garde seulement l'argent final.",
    intents:{sale:["vendre","vente","ajoute","mets","prends","client prend","facture","ticket","addition"],stock:["stock","reste","quantité","quantite","marchandise","arrivage","réassort","reassort"],discount:["remise","réduction","reduction","cadeau","prix spécial"],payment:["cash","espèces","especes","wave","orange money","carte","tpe"]},
    fields:{quantity:["un","une","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","douzaine","carton","paquet"],product:["savon","serviette","drap","peignoir","fouta","crème","creme","sac","chaussure","riz","huile","sucre","article","produit"],unitPrice:["à","a","prix","unité","unite","pièce","piece"],total:["total","sous-total","addition"],client:["client","nom","pour"]},
    examples:["deux serviettes de bain à 5000 cash","quatre draps moyens plus deux peignoirs","vente savon karité 3000 Wave","remise 1000 sur l'addition"],
    payBridge:{allowed:true,onlyAfterValidation:true,phrasePrefix:"recette commerce POS",forbidden:"Ne jamais envoyer le détail article par article dans PAY."},
    safety:["aucune vente automatique","aucun stock modifié sans clic pro","aucun paiement confirmé sans validation humaine"]
  };
  window.DIGIY_GO_VOCABS=window.DIGIY_GO_VOCABS||{};
  window.DIGIY_GO_VOCABS.POS=vocab;
  window.DIGIY_GO_POS_VOCAB=vocab;
})();
