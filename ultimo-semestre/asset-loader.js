// Loads the real generated 2x2 expression sheets from compact base64 payloads.
// This file is intentionally loaded after sprites.js and replaces only rendering.
const VN_REAL_SPRITE_FILES={
  morgana:"assets/morgana-small.b64?v=12",
  bianca:"assets/bianca-small.b64?v=12",
  yumi:"assets/yumi-small.b64?v=12",
  cecilia:"assets/cecilia-small.b64?v=12",
  helena:"assets/helena-small.b64?v=12"
};
const VN_REAL_SPRITES={};
const VN_REAL_PROMISES={};

function vnLoadRealSprite(k){
  if(VN_REAL_SPRITES[k]) return Promise.resolve(VN_REAL_SPRITES[k]);
  if(VN_REAL_PROMISES[k]) return VN_REAL_PROMISES[k];
  VN_REAL_PROMISES[k]=fetch(VN_REAL_SPRITE_FILES[k],{cache:"force-cache"})
    .then(r=>{if(!r.ok) throw new Error(`sprite ${k}: HTTP ${r.status}`);return r.text();})
    .then(raw=>{
      const b64=raw.replace(/\s+/g,"");
      if(!b64.startsWith("UklGR")) throw new Error(`sprite ${k}: payload inválido`);
      const url=`data:image/webp;base64,${b64}`;
      VN_REAL_SPRITES[k]=url;
      return url;
    })
    .catch(err=>{console.error(err);return "";});
  return VN_REAL_PROMISES[k];
}

// Expression index: 0 neutral, 1 happy/soft, 2 blush/flirty, 3 annoyed/stern.
vnShowSprite=function(k,expr=0){
  const av=$("#avatar");
  if(!k){
    av.dataset.character="";
    av.dataset.expr="";
    av.style.opacity="0";
    av.style.backgroundImage="none";
    return;
  }
  const e=Math.max(0,Math.min(3,Number(expr)||0));
  av.dataset.character=k;
  av.dataset.expr=String(e);
  av.style.opacity="0";
  av.style.backgroundImage="none";
  vnLoadRealSprite(k).then(url=>{
    if(!url || av.dataset.character!==k || av.dataset.expr!==String(e)) return;
    av.style.backgroundImage=`url("${url}")`;
    av.style.backgroundSize="200% 200%";
    av.style.backgroundPosition=VN_SPRITE_POS[e];
    av.style.backgroundRepeat="no-repeat";
    av.style.opacity="1";
  });
};

// Start loading immediately so first meetings feel instant.
KEYS.forEach(vnLoadRealSprite);
