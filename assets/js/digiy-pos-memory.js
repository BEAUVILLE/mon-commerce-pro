/* DIGIYLYFE — Mémoire locale métier MON COMMERCE
   Le téléphone garde les gestes essentiels quand le réseau flanche. */
(function(){
  "use strict";
  const ROOT = "digiy_pos_memory_v1";
  function readRoot(){
    try{return JSON.parse(localStorage.getItem(ROOT) || "{}") || {}}catch(_){return {}}
  }
  function writeRoot(data){
    try{localStorage.setItem(ROOT, JSON.stringify(Object.assign({}, data || {}, {updated_at: Date.now()}))); return true}catch(_){return false}
  }
  function get(key, fallback){
    const r = readRoot();
    return Object.prototype.hasOwnProperty.call(r,key) ? r[key] : fallback;
  }
  function set(key, value){
    const r = readRoot();
    r[key] = value;
    return writeRoot(r);
  }
  function push(key, value, limit){
    const arr = Array.isArray(get(key, [])) ? get(key, []) : [];
    arr.unshift(Object.assign({id: Date.now(), saved_at: Date.now()}, value || {}));
    set(key, arr.slice(0, limit || 80));
    return arr[0];
  }
  function remove(key){
    const r = readRoot();
    delete r[key];
    return writeRoot(r);
  }
  function snapshot(){ return readRoot(); }
  window.DIGIY_POS_MEMORY = {get,set,push,remove,snapshot,writeRoot,readRoot};
})();
