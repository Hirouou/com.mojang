export const DEFAULT_BINDINGS = Object.freeze({forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',fire:'Space',chargeUp:'KeyA',chargeDown:'KeyQ'});
const movement = ['forward','back','left','right'];
const aiming = ['fire','chargeUp','chargeDown'];
export function eventCode(event) {
  if(event.code) return event.code;
  const key=String(event.key||'');
  if(/^[a-z]$/i.test(key))return 'Key'+key.toUpperCase();
  if(/^[0-9]$/.test(key))return 'Digit'+key;
  return key===' '?'Space':key;
}
export function keyLabel(code) {return code==='Space'?'ESPAÇO':code.replace(/^Key|^Digit/,'').replace('Arrow','SETA ');}
export function actionForKey(code,bindings,station) {
  // A is charge-up while hands are at the aiming station, strafe-left elsewhere.
  if(station==='aim') {const action=aiming.find(a=>bindings[a]===code);if(action)return action;}
  return movement.find(a=>bindings[a]===code)||null;
}
export function rebindKey(bindings,action,code) {
  if(!Object.hasOwn(DEFAULT_BINDINGS,action)||!(/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight)$/.test(code)))return {error:'Use uma letra, número, seta, Espaço ou Shift. E e Esc ficam reservados.'};
  if(code==='KeyE')return {error:'E fica reservado para interagir.'};
  const group=movement.includes(action)?movement:aiming;
  const conflict=group.find(a=>a!==action&&bindings[a]===code);
  if(conflict)return {error:'Essa tecla já está em uso nesse grupo de controles.'};
  return {bindings:{...bindings,[action]:code}};
}
export function restoreBindings(saved) {
  const result={...DEFAULT_BINDINGS};
  if(!saved||typeof saved!=='object')return result;
  // Validate a saved mapping as a whole, including swapped defaults.
  for(const group of [movement,aiming]) {
    const proposed=group.map(a=>saved[a]||DEFAULT_BINDINGS[a]);
    if(new Set(proposed).size!==group.length)continue;
    if(proposed.some(code=>code==='KeyE'||! /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight)$/.test(code)))continue;
    group.forEach((a,i)=>result[a]=proposed[i]);
  }
  return result;
}
