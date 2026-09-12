/**
 * Touch precision helper for the physical table map.
 * Desktop mouse remains 1:1. Coarse pointers get a short deadzone and a
 * reduced drag gain so a thumb can place coordinates without overshooting.
 */
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function mapPointerSettings(pointerType) {
  const coarse = pointerType === 'touch' || pointerType === 'pen';
  return Object.freeze({
    coarse,
    deadzonePx: coarse ? 8 : 0,
    plotGain: coarse ? .42 : 1,
    panGain: coarse ? .72 : 1,
  });
}

export function pointerDistance(start, current) {
  return Math.hypot(finite(current?.x) - finite(start?.x), finite(current?.y) - finite(start?.y));
}

export function precisePlotPoint({ startScreen, currentScreen, startWorld, scale, pointerType }) {
  const settings = mapPointerSettings(pointerType);
  const safeScale = Math.max(.000001, finite(scale, .001));
  const dx = finite(currentScreen?.x) - finite(startScreen?.x);
  const dy = finite(currentScreen?.y) - finite(startScreen?.y);
  return Object.freeze({
    x: finite(startWorld?.x) + dx / safeScale * settings.plotGain,
    y: finite(startWorld?.y) + dy / safeScale * settings.plotGain,
  });
}

export function precisePanView({ startScreen, currentScreen, startView, scale, pointerType }) {
  const settings = mapPointerSettings(pointerType);
  const safeScale = Math.max(.000001, finite(scale, .001));
  const dx = finite(currentScreen?.x) - finite(startScreen?.x);
  const dy = finite(currentScreen?.y) - finite(startScreen?.y);
  return Object.freeze({
    x: finite(startView?.x) - dx / safeScale * settings.panGain,
    y: finite(startView?.y) - dy / safeScale * settings.panGain,
  });
}
