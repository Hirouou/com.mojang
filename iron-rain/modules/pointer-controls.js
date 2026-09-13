/** Pointer Events controls for mouse, pen and independent simultaneous touches. */
const noop = () => {};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finitePointerFrame = (event, bounds) => Boolean(
  Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY) &&
  [bounds?.left, bounds?.top, bounds?.width, bounds?.height].every(Number.isFinite) &&
  bounds.width > 0 && bounds.height > 0
);

function pointerBinding(element, { start, move, stop, onEngage = noop, isEnabled = () => true }) {
  const doc = element.ownerDocument;
  const view = doc?.defaultView ?? globalThis.window;
  const listeners = [];
  let pointerId = null;
  let fallbackCapture = false;
  let disposed = false;
  const previousTouchAction = element.style.touchAction;
  element.style.touchAction = 'none';

  function listen(target, name, handler) {
    if (!target?.addEventListener) return;
    target.addEventListener(name, handler, { passive: false });
    listeners.push(() => target.removeEventListener(name, handler));
  }

  function reset() {
    const capturedId = pointerId;
    pointerId = null; // Release can synchronously dispatch lostpointercapture.
    fallbackCapture = false;
    stop();
    if (capturedId !== null) {
      try { element.releasePointerCapture?.(capturedId); } catch { /* Already released by the browser. */ }
    }
  }

  function down(event) {
    if (disposed || pointerId !== null || !isEnabled() || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    pointerId = event.pointerId;
    fallbackCapture = true;
    try {
      if (element.setPointerCapture) {
        element.setPointerCapture(pointerId);
        fallbackCapture = element.hasPointerCapture ? !element.hasPointerCapture(pointerId) : false;
      }
    } catch { /* Window listeners still end a gesture if capture is unavailable. */ }
    onEngage();
    start(event);
  }

  function drag(event) {
    if (event.pointerId !== pointerId || pointerId === null) return;
    if (!isEnabled()) { reset(); return; }
    event.preventDefault();
    event.stopPropagation();
    move(event);
  }

  function end(event) {
    if (pointerId !== null && event.pointerId === pointerId) reset();
  }

  listen(element, 'pointerdown', down);
  listen(element, 'pointermove', drag);
  listen(element, 'pointerup', end);
  listen(element, 'pointercancel', end);
  listen(element, 'lostpointercapture', end);
  // Stops are idempotent, including when a captured event bubbles to window.
  listen(view, 'pointerup', end);
  listen(view, 'pointercancel', end);
  listen(view, 'pointermove', event => { if (fallbackCapture) drag(event); });
  listen(view, 'blur', reset);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); });

  return {
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      listeners.forEach(remove => remove());
      element.style.touchAction = previousTouchAction;
    },
  };
}

/** onChange receives a normalized {x,y}; neutral is always reported on release. */
export function bindJoystick(element, knob, { onChange = noop, onEngage, isEnabled, deadZone = 0.12 } = {}) {
  const zone = clamp(deadZone, 0, 0.9);
  function move(event) {
    const bounds = element.getBoundingClientRect();
    if (!finitePointerFrame(event, bounds)) {
      knob.style.transform = 'translate(0px, 0px)';
      onChange({ x: 0, y: 0 });
      return;
    }
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.35);
    const dx = event.clientX - bounds.left - bounds.width / 2;
    const dy = event.clientY - bounds.top - bounds.height / 2;
    const distance = Math.hypot(dx, dy);
    const travel = Math.min(radius, distance);
    const directionX = distance ? dx / distance : 0;
    const directionY = distance ? dy / distance : 0;
    const strength = clamp((travel / radius - zone) / (1 - zone), 0, 1);
    knob.style.transform = `translate(${directionX * travel}px, ${directionY * travel}px)`;
    onChange({ x: directionX * strength, y: directionY * strength });
  }
  return pointerBinding(element, {
    start: move, move, onEngage, isEnabled,
    stop() { knob.style.transform = 'translate(0px, 0px)'; onChange({ x: 0, y: 0 }); },
  });
}

/**
 * Wheel angle is reduced mechanically into gun degrees. The gun may ease toward
 * that target for inertia. Crossing the centre never creates a half-turn jump.
 */
export function bindHandwheel(element, arm, { onDelta = noop, onEngage, isEnabled, reduction = 0.18 } = {}) {
  if (!Number.isFinite(reduction) || reduction <= 0) throw new RangeError('reduction must be positive');
  let lastAngle = null;
  let visualDegrees = 0;
  function angleAt(event) {
    const bounds = element.getBoundingClientRect();
    if (!finitePointerFrame(event, bounds)) return null;
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    if (Math.hypot(x, y) < Math.min(bounds.width, bounds.height) * 0.14) return null;
    return Math.atan2(y, x);
  }
  const binding = pointerBinding(element, {
    onEngage, isEnabled,
    start(event) { lastAngle = angleAt(event); },
    move(event) {
      const angle = angleAt(event);
      if (angle === null || lastAngle === null) { lastAngle = angle; return; }
      const difference = Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle));
      lastAngle = angle;
      const degrees = difference * 180 / Math.PI;
      visualDegrees = (visualDegrees + degrees) % 360;
      arm.style.transform = `rotate(${visualDegrees}deg)`;
      onDelta(degrees * reduction);
    },
    stop() { lastAngle = null; },
  });
  return {
    ...binding,
    reset() {
      binding.reset();
      lastAngle = null;
      visualDegrees = 0;
      arm.style.transform = 'rotate(0deg)';
    },
  };
}