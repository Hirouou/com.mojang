/** Fictional automatic magazine choreography. This clock also gates firing. */
export const LOAD_DURATION=2.8;
export const SHELL_TYPES=Object.freeze(['HE','FRAG','SMOKE']);
export function beginLoading(from,to){
  if(!SHELL_TYPES.includes(to))throw new RangeError('Unknown magazine selection');
  return {from,to,elapsed:0,progress:0,phase:'extract',complete:false};
}
export function stepLoading(cycle,dt){
  if(!cycle||!Number.isFinite(dt)||dt<=0)return cycle;
  cycle.elapsed=Math.min(LOAD_DURATION,cycle.elapsed+dt);cycle.progress=cycle.elapsed/LOAD_DURATION;
  cycle.phase=cycle.progress<.22?'extract':cycle.progress<.62?'rotate':cycle.progress<.9?'ram':'lock';
  cycle.complete=cycle.progress>=1;
  return cycle;
}
export const loadingLabel=cycle=>!cycle?'CULATRA TRAVADA':({extract:'EXTRAINDO CARTUCHO',rotate:'GIRANDO CARROSSEL',ram:'ALIMENTANDO CULATRA',lock:'TRAVANDO CULATRA'}[cycle.phase]);
