/* DIGIY MON COMMERCE — migration prudente du moule vierge
 * Supprime uniquement les anciennes données de démonstration et cibles QR héritées.
 * Ne touche jamais aux clés PIN ou à la session d'accès.
 */
(function(){
  'use strict';
  const MARK='DIGIY_POS_NEUTRALIZED_V1';
  const QR_MARK='DIGIY_POS_QR_NEUTRALIZED_V2';
  const legacyTarget=raw=>/(astou[-\s]?boutique\.digiylyfe\.com|fiche-astou\.html)/i.test(String(raw||''));
  const parse=raw=>{try{return JSON.parse(raw||'null')}catch(_){return null}};

  try{
    /* Ce nettoyage QR s'exécute même si la première migration avait déjà été marquée. */
    const qrKeys=[
      'DIGIY_COMMERCE_QR_PUBLIC_TARGET',
      'DIGIY_EXPLORE_PUBLIC_URL',
      'digiy_explore_public_url',
      'digiy_pos_qr_target_url',
      'digiy_pos_public_url',
      'digiy_pos_qr_image_url'
    ];
    qrKeys.forEach(key=>{
      const value=localStorage.getItem(key)||sessionStorage.getItem(key)||'';
      if(legacyTarget(value)){
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      }
    });

    const existingBiz=parse(localStorage.getItem('digiy_pos_stable_biz_v1'))||{};
    if(legacyTarget(existingBiz.publicLink)){
      existingBiz.publicLink='';
      localStorage.setItem('digiy_pos_stable_biz_v1',JSON.stringify(existingBiz));
    }
    localStorage.setItem(QR_MARK,JSON.stringify({cleaned:true,at:new Date().toISOString()}));

    if(localStorage.getItem(MARK))return;

    const biz=parse(localStorage.getItem('digiy_pos_stable_biz_v1'))||{};
    const products=parse(localStorage.getItem('digiy_pos_stable_products_v1'));
    const name=String(biz.name||localStorage.getItem('digiy_pos_shop_name')||'').trim();
    const activity=String(biz.activity||localStorage.getItem('digiy_pos_activity')||'').trim();
    const publicLink=String(biz.publicLink||localStorage.getItem('digiy_pos_public_url')||localStorage.getItem('digiy_pos_qr_target_url')||'').trim();
    const demoName=/^(linea|astou boutique|boutique linge & style)$/i.test(name);
    const demoActivity=/^linge de maison$/i.test(activity);
    const demoLink=legacyTarget(publicLink);
    const demoIds=new Set(['p_drap_2p','p_drap_1p','p_parure','p_taie','p_serviette_bain','p_peignoir','p_couette','p_oreiller','p_nappe','p_torchon','p_article_1','p_service_1']);
    const demoProducts=Array.isArray(products)&&products.length>0&&products.every(item=>item&&demoIds.has(String(item.id||'')));
    const personalized=!!String(biz.owner||biz.phone||biz.address||biz.city||'').trim();

    if(!personalized&&(demoName||demoLink||(demoActivity&&demoProducts))){
      ['digiy_pos_stable_products_v1','digiy_pos_stable_sales_v1','digiy_pos_stable_moves_v1','digiy_pos_stable_biz_v1','digiy_pos_stable_cart_v1','digiy_pos_public_url','digiy_pos_qr_target_url','digiy_pos_qr_image_url','digiy_pos_shop_name','digiy_pos_activity','caisse_shop'].forEach(key=>localStorage.removeItem(key));
      localStorage.setItem(MARK,JSON.stringify({cleaned:true,at:new Date().toISOString()}));
    }else{
      localStorage.setItem(MARK,JSON.stringify({cleaned:false,at:new Date().toISOString()}));
    }
  }catch(error){
    console.error('[DIGIY POS MIGRATION]',error);
  }
})();
