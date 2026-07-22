/* DIGIY MON COMMERCE — chargeur sécurisé partagé
 * Build: pos-cloud-profile-rpc-abos-v2-20260722
 * Vérifie la session PIN, l'accès ABOS et branche la fiche publique sur la RPC sécurisée.
 */
(function(){
  'use strict';

  const CONFIG=Object.assign({source:'index.html'},window.DIGIY_POS_PAGE||{});
  const KEY='DIGIY_POS_PRO_SESSION_V1';
  const TTL=8*60*60*1000;
  const CLOCK=60*1000;
  const MODULES=new Set(['POS','POS_PRO','COMMERCE','CAISSE','MON_COMMERCE']);
  const SOURCE_COMMIT='abcfde48d1d4e9fc6335ebcb3edd4c90cc92f4c7';
  const SUPABASE_URL='https://wesqmwjjtsefyjnluosj.supabase.co';
  const SUPABASE_ANON='sb_publishable_tGHItRgeWDmGjnd0CK1DVQ_BIep4Ug3';
  const LEGACY=['digiy_pin_session_v1','digiy_pin_until','digiy_pos_pin_until','digiy_access_until','digiy_pro_access_until','digiy_pay_access_until','digiy_session_until','digiy_access_expires_at','digiy_expires_at','digiy_pin_expires_at','DIGIY_PIN_UNTIL','DIGIY_ACCESS_UNTIL','digiy_pin_ok','digiy_pos_pin_ok','digiy_access_ok','digiy_pro_access_ok','digiy_pay_access_ok','digiy_cockpit_access_ok','digiy_session_ok','digiy_access_session','digiy_pos_session','DIGIY_ACCESS_GRANTED','DIGIY_PIN_OK','SESSION_KEY'];
  const BAD_QS=['phone','tel','owner_phone','slug','commerce','pin','code','session','session_token','token','pin_ok','digiy_pin_ok','digiy_access','access','ok','auth','unlocked','expires','until','exp','expiresAt'];

  const parse=raw=>{try{return JSON.parse(raw||'null')}catch(_){return null}};
  const get=(store,key)=>{try{return store.getItem(key)}catch(_){return null}};
  const del=(store,key)=>{try{store.removeItem(key)}catch(_){}};

  function valid(session){
    if(!session||typeof session!=='object')return false;
    const module=String(session.module||'').trim().toUpperCase();
    const phone=String(session.phone||'').replace(/\D/g,'');
    const validated=Number(session.validated_at||0);
    const expires=Number(session.expires_at||0);
    const now=Date.now();
    const access=session.access===true||session.access_ok===true;
    return MODULES.has(module)&&phone.length>=9&&access&&validated>0&&validated<=now+CLOCK&&now-validated<TTL&&expires>now&&expires<=validated+TTL+CLOCK;
  }

  function cleanUrl(){
    try{
      const url=new URL(location.href);
      let changed=false;
      BAD_QS.forEach(key=>{if(url.searchParams.has(key)){url.searchParams.delete(key);changed=true}});
      if(changed)history.replaceState({},document.title,url.pathname+(url.searchParams.toString()?'?'+url.searchParams.toString():'')+url.hash);
    }catch(_){ }
  }

  function fail(message,error){
    const msg=document.getElementById('msg');
    const spin=document.getElementById('spin');
    const login=document.getElementById('login');
    if(msg)msg.textContent=message;
    if(spin)spin.hidden=true;
    if(login)login.hidden=false;
    if(error)console.error('[DIGIY POS LOADER]',error);
  }

  function clearAccess(){
    [localStorage,sessionStorage].forEach(store=>{
      del(store,KEY);
      LEGACY.forEach(key=>del(store,key));
    });
  }

  function boolFromRpc(data){
    const raw=Array.isArray(data)?data[0]:data;
    if(raw===true||raw===1)return true;
    if(typeof raw==='string'){
      const value=raw.trim().toLowerCase();
      return ['true','t','1','yes','ok'].includes(value);
    }
    if(raw&&typeof raw==='object'){
      return ['has_access','access','access_ok','ok','allowed','active','is_active','subscribed','valid']
        .some(key=>raw[key]===true);
    }
    return false;
  }

  async function rpc(name,payload){
    const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+encodeURIComponent(name),{
      method:'POST',
      headers:{
        apikey:SUPABASE_ANON,
        Authorization:'Bearer '+SUPABASE_ANON,
        'Content-Type':'application/json',
        Accept:'application/json'
      },
      body:JSON.stringify(payload||{}),
      cache:'no-store'
    });
    if(!response.ok)throw new Error(name+' '+response.status);
    const text=await response.text();
    return text?JSON.parse(text):null;
  }

  async function accessAllowed(phone){
    const clean=String(phone||'').replace(/\D/g,'');
    if(clean.length<9)return false;

    for(const moduleCode of MODULES){
      try{
        if(boolFromRpc(await rpc('digiy_has_module_access_from_abos',{
          p_phone:clean,
          p_module:moduleCode
        })))return true;
      }catch(_){}
    }

    for(const moduleCode of MODULES){
      try{
        if(boolFromRpc(await rpc('digiy_has_access',{
          p_phone:clean,
          p_module:moduleCode
        })))return true;
      }catch(_){}
    }

    return false;
  }

  function neutralize(html,page){
    let out=String(html||'');

    let removed=0;
    out=out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,block=>{
      const legacy=(block.includes('URL_OK_PARAMS')||/\bconst\s+URL_OK\s*=/.test(block))&&(block.includes('scanUrl')||block.includes('URL_EXP'));
      if(legacy){removed++;return ''}
      return block;
    });
    if(['index.html','caisse.html','produits.html','ventes.html','admin.html'].includes(page)&&removed!==1){
      throw new Error('garde historique non identifiée pour '+page);
    }

    out=out.replace(/\['digiy_pin_session_v1'/g,"['DIGIY_POS_PRO_SESSION_V1','digiy_pin_session_v1'");
    out=out.replace(/Astou Boutique/g,'MON COMMERCE');
    out=out.replace(/Astou boutique/g,'MON COMMERCE');
    out=out.replace(/\bLINEA\b/g,'MON COMMERCE');
    out=out.replace(/Linge de maison/g,'Commerce');
    out=out.replace(/https:\/\/mon-commerce\.digiylyfe\.com\/fiche-astou\.html/gi,'https://mon-commerce.digiylyfe.com/');
    out=out.replace(/https:\/\/astou-boutique\.digiylyfe\.com\/?/gi,'');

    out=out.replace(/const\s+seedProducts\s*=\s*\[[\s\S]*?\];/,'const seedProducts=[];');
    out=out.replace(/name:'MON COMMERCE',activity:'Commerce'/g,"name:'MON COMMERCE',activity:'Commerce'");
    out=out.replace(/if\(!business\.publicLink\|\|\/\^https:[\s\S]*?business\.publicLink='';\}/g,"if(/^https:\\/\\/mon-commerce\\.digiylyfe\\.com\\/?$/i.test(business.publicLink||'')){business.publicLink='';}");
    out=out.replace(/if\(!business\.publicLink\|\|\/\^https:[\s\S]*?business\.publicLink='https:\/\/astou-boutique\.digiylyfe\.com\/';\}/g,"if(/^https:\\/\\/mon-commerce\\.digiylyfe\\.com\\/?$/i.test(business.publicLink||'')){business.publicLink='';}");

    out=out.replace(/href="\.\/index\.html">🧾 Caisse/g,'href="./caisse.html">🧾 Caisse');
    out=out.replace(/href="\.\/index\.html">🧾 Retour caisse/g,'href="./caisse.html">🧾 Retour caisse');
    out=out.replace(/href="\.\/index\.html"><span>🧾<\/span><span>Caisse/g,'href="./caisse.html"><span>🧾</span><span>Caisse');
    out=out.replace(/<a class="pill" href="\.\/pay\.html">💳 PAY<\/a>/g,'<a class="pill" href="https://digiy-carnet-pro.digiylyfe.com/inscription-pay.html" target="_blank" rel="noopener noreferrer">📒 PRO CARNET</a>');

    if(page==='index.html'){
      out=out.replace(/<img\s+src="\.\/carte-visite\.png[^>]*\/>/i,'<div id="digiyNeutralCard" style="min-height:190px;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#fff0a8,#22c55e);color:#052215;font-size:clamp(24px,7vw,44px);font-weight:1000;line-height:1;text-align:center">MON COMMERCE<br><small style="font-size:14px;margin-top:10px">Carte publique à configurer</small></div>');
      out=out.replace(/const CARD_PATH="\.\/carte-visite\.png";/,'const CARD_PATH="";');
      out=out.replace(/const cardUrl=\(\)=>new URL\(CARD_PATH,location\.href\)\.href;/,'const cardUrl=()=>publicUrl();');
      out=out.replace(/const title="MON COMMERCE — DIGIY MON COMMERCE";/g,'const title=(businessName()||"MON COMMERCE")+" — DIGIY MON COMMERCE";');
      out=out.replace(/const text="Découvrez MON COMMERCE sur DIGIY MON COMMERCE\.";/g,'const text="Découvrez "+(businessName()||"MON COMMERCE")+" sur DIGIY MON COMMERCE.";');
      out=out.replace(/const message="Carte de visite MON COMMERCE : "\+cardUrl\(\)\+"\\nVoir la boutique : "\+url;/g,'const message="Voir "+(businessName()||"MON COMMERCE")+" : "+url;');
      out=out.replace(/const message="Bonjour, voici la carte de visite MON COMMERCE : "\+cardUrl\(\)\+"\\nBoutique publique : "\+url;/g,'const message="Bonjour, voici "+(businessName()||"MON COMMERCE")+" : "+url;');
      out=out.replace(/const status=document\.getElementById\("status"\);/,'const status=document.getElementById("status");const businessName=()=>{const b=parse(read("digiy_pos_stable_biz_v1"))||{};return String(b.name||read("digiy_pos_shop_name")||"MON COMMERCE").trim()||"MON COMMERCE";};');
      out=out.replace(/if\(navigator\.share\)\{\s*try\{[\s\S]*?await navigator\.share\(\{title,text,url\}\);\s*setStatus\("Lien de la carte partagé\."\);\s*return;\s*\}/,'if(navigator.share){await navigator.share({title,text,url});setStatus("Lien partagé.");return;}');
    }

    if(page==='profile.html'){
      const before=out;
      out=out.replace(
        /const\s*\{error\}\s*=\s*await\s+S\s*\.from\("digiy_pos_public_profiles"\)\s*\.upsert\(dbPayload\(d\),\{onConflict:"slug"\}\);/,
        'const {error}=await S.rpc("digiy_pos_save_public_profile",{p_phone:phone,p_payload:dbPayload(d)});'
      );
      if(out===before)throw new Error('sauvegarde directe du profil non identifiée');
      out=out.replace(
        /Fiche enregistrée ✅ QR public gardé sur l’appareil\./g,
        'Fiche enregistrée dans Supabase ✅ QR public prêt.'
      );
    }

    const bridge=`<script>(function(){'use strict';try{const read=k=>localStorage.getItem(k)||'';const parse=r=>{try{return JSON.parse(r||'null')}catch(_){return null}};const session=parse(sessionStorage.getItem('DIGIY_POS_PRO_SESSION_V1')||localStorage.getItem('DIGIY_POS_PRO_SESSION_V1'))||{};const slug=String(session.slug||read('digiy_pos_slug')||'').trim();const draft=slug?parse(read('DIGIY_POS_PROFILE_DRAFT:'+slug)):null;const stable=parse(read('digiy_pos_stable_biz_v1'))||{};const name=String(stable.name||(draft&&draft.display_name)||read('digiy_pos_shop_name')||'MON COMMERCE').trim()||'MON COMMERCE';const activity=String(stable.activity||(draft&&draft.category)||read('digiy_pos_activity')||'Commerce').trim()||'Commerce';const publicUrl=String(stable.publicLink||(draft&&draft.qr_target_url)||read('digiy_pos_public_url')||read('digiy_pos_qr_target_url')||'').trim();document.querySelectorAll('#bizTitle').forEach(el=>el.textContent=name);document.querySelectorAll('#bizSub').forEach(el=>el.textContent=activity+' · POS PRO');const neutral=document.getElementById('digiyNeutralCard');if(neutral)neutral.innerHTML='<span>'+name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))+'</span><small style="font-size:14px;margin-top:10px">Carte publique DIGIY</small>';if(publicUrl){['businessCardLink','openPublicCard','openPublic'].forEach(id=>{const el=document.getElementById(id);if(el)el.href=publicUrl;});}if(!document.getElementById('digiyLocalNotice')&&['caisse.html','produits.html','ventes.html','admin.html'].includes(location.pathname.split('/').pop().toLowerCase())){const box=document.createElement('div');box.id='digiyLocalNotice';box.textContent='Données de caisse conservées sur cet appareil · utilise Exporter dans Admin pour ta sauvegarde.';box.style.cssText='width:min(1180px,calc(100% - 22px));margin:10px auto;padding:11px 13px;border:1px solid rgba(255,240,168,.3);border-radius:16px;background:rgba(0,0,0,.18);color:#fff0a8;text-align:center;font:900 12px/1.4 system-ui';const main=document.querySelector('main');if(main)main.before(box);} }catch(error){console.error('[DIGIY POS NEUTRAL]',error)}})();<\/script>`;
    out=out.replace(/<\/body>/i,bridge+'</body>');
    out=out.replace(/<meta name="digiy-build"[^>]*>/i,'<meta name="digiy-build" content="pos-cloud-profile-rpc-abos-v2-20260722">');
    return out;
  }

  async function boot(){
    cleanUrl();
    const session=[parse(get(sessionStorage,KEY)),parse(get(localStorage,KEY))].find(valid)||null;
    if(!session){
      clearAccess();
      const next=location.pathname+location.search+location.hash;
      location.replace('./pin.html?next='+encodeURIComponent(next));
      return;
    }

    if(!(await accessAllowed(session.phone))){
      clearAccess();
      fail('Accès MON COMMERCE inactif. Entre un PIN lié à un abonnement POS actif.');
      setTimeout(()=>location.replace('./pin.html'),900);
      return;
    }

    window.DIGIY_PIN_OK=true;
    window.DIGIY_PIN_EXPIRES_AT=Number(session.expires_at);
    window.DIGIY_ACCESS=Object.assign({},window.DIGIY_ACCESS||{},session);

    if(CONFIG.redirect){location.replace(CONFIG.redirect);return;}

    try{
      const page=String(CONFIG.source||'index.html').split('/').pop().toLowerCase();
      const urls=[
        `https://raw.githubusercontent.com/BEAUVILLE/mon-commerce-pro/${SOURCE_COMMIT}/${page}`,
        `https://cdn.jsdelivr.net/gh/BEAUVILLE/mon-commerce-pro@${SOURCE_COMMIT}/${page}`
      ];
      let html='';
      for(const url of urls){
        try{const response=await fetch(url,{cache:'no-store'});if(response.ok){html=await response.text();break}}catch(_){ }
      }
      if(!html)throw new Error('source indisponible');
      html=neutralize(html,page);
      document.open();document.write(html);document.close();
    }catch(error){
      fail('Ouverture impossible. Aucun outil privé n’a été chargé.',error);
    }
  }

  boot();
})();
