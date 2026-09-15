// One-time reset for builds created before the 'complete strangers' opening.
// Afterwards the same save key is preserved normally.
try{
  const marker="ultimoSemestre_strangers_build_12";
  if(localStorage.getItem(marker)!=="ok"){
    localStorage.removeItem("ultimoSemestre18_save_v2");
    localStorage.setItem(marker,"ok");
  }
}catch(e){}
