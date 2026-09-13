const EVENT_NAME = 'iron-rain:maintenance-feedback';

let root = null;
let source = null;
let label = null;
let value = null;
let vfx = null;

function ensureOverlay() {
  if (root || typeof document === 'undefined') return root;
  const style = document.createElement('style');
  style.textContent = `
    .ir-maintenance{--p:0;position:fixed;left:50%;top:58%;z-index:18;transform:translate(-50%,-50%);display:grid;grid-template-columns:46px auto;align-items:center;gap:10px;min-width:178px;padding:8px 11px 8px 8px;pointer-events:none;background:#091009d9;border:1px solid #b9ad7558;border-left:2px solid #c4ad70;box-shadow:0 8px 26px #0009;color:#e8ddb9;font-family:ui-monospace,Consolas,monospace;backdrop-filter:blur(2px);contain:layout paint}
    .ir-maintenance[hidden]{display:none}
    .ir-maintenance.remote{border-left-color:#7fa7c8;box-shadow:0 8px 26px #0009,0 0 0 1px #7fa7c81f}
    .ir-maintenance.remote .ir-maintenance-copy b{color:#b7d7ee}
    .ir-maintenance-ring{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#d5bc78 calc(var(--p)*1turn),#30362d calc(var(--p)*1turn));box-shadow:inset 0 0 0 1px #d8c48733,0 0 14px #0008;position:relative}
    .ir-maintenance-ring:after{content:'';width:27px;height:27px;border-radius:50%;background:#111811;box-shadow:inset 0 0 0 1px #6e755f55}
    .ir-maintenance-value{position:absolute;inset:0;display:grid;place-items:center;z-index:2;font-size:8px;font-weight:700;color:#efe4c0}
    .ir-maintenance-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
    .ir-maintenance-copy b{font-size:8px;letter-spacing:1.2px;font-weight:700;color:#b7bfa7}
    .ir-maintenance-copy span{font-size:10px;letter-spacing:.45px;white-space:nowrap;color:#ead9aa}
    .ir-maintenance.extinguish{border-left-color:#d9e2d7}
    .ir-maintenance.extinguish .ir-maintenance-ring{background:conic-gradient(#e7eee8 calc(var(--p)*1turn),#30362d calc(var(--p)*1turn))}
    .ir-maintenance.extinguish:before{content:'';position:absolute;left:38px;top:-7px;width:44px;height:14px;opacity:.75;background:radial-gradient(circle at 15% 70%,#f7fff8 0 3px,#0000 4px),radial-gradient(circle at 42% 35%,#eef6ef 0 2px,#0000 3px),radial-gradient(circle at 68% 70%,#fff 0 3px,#0000 4px),radial-gradient(circle at 88% 30%,#e7eee8 0 2px,#0000 3px);animation:ir-foam .42s steps(2,end) infinite}
    .ir-maintenance.repair .ir-maintenance-ring{filter:saturate(.85)}
    .ir-maintenance.repair:before,.ir-maintenance.repair:after{content:'';position:absolute;width:3px;height:3px;background:#d7b36d;box-shadow:8px 4px #b47c45,14px -3px #e2c078;right:31px;top:9px;animation:ir-sparks .55s steps(2,end) infinite}
    .ir-maintenance.repair:after{right:45px;top:auto;bottom:7px;animation-delay:.18s}
    .ir-maintenance-vfx{--spray:.45;--sparks:.25;--repair-speed:.36s;--danger:0;position:fixed;inset:0;z-index:17;pointer-events:none;overflow:hidden;contain:strict;display:none;background:radial-gradient(ellipse at center,#0000 52%,rgb(110 24 18 / calc(var(--danger)*.28)) 100%)}
    .ir-maintenance-vfx.active{display:block}
    .ir-maintenance-vfx.remote{opacity:.58;filter:saturate(.72)}
    .ir-maintenance-vfx .foam,.ir-maintenance-vfx .spark,.ir-maintenance-vfx .tool{position:absolute;display:none}
    .ir-maintenance-vfx.extinguish .foam{display:block;left:18%;top:62%;width:48%;height:18%;transform-origin:left center;opacity:calc(.2 + var(--spray)*.7);filter:blur(.2px);background:radial-gradient(ellipse at 8% 55%,#f7fff7e6 0 2%,#0000 3%),radial-gradient(ellipse at 26% 35%,#eff8f0d9 0 3%,#0000 4%),radial-gradient(ellipse at 43% 66%,#fffde8cc 0 2.5%,#0000 3.5%),radial-gradient(ellipse at 61% 29%,#e6efe7cc 0 3%,#0000 4%),radial-gradient(ellipse at 82% 58%,#f7fff7ba 0 4%,#0000 5%),linear-gradient(8deg,#dfe8df00 0 20%,#eef6eec4 46%,#fff0 73%);clip-path:polygon(0 42%,100% 0,100% 100%,0 58%);animation:ir-spray-cone .18s steps(2,end) infinite}
    .ir-maintenance-vfx.extinguish:after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 64% 66%,#eaf2e619 0 8%,#0000 28%);opacity:var(--spray);animation:ir-foam-haze .36s ease-in-out infinite alternate}
    .ir-maintenance-vfx.repair .tool{display:block;left:67%;top:61%;width:54px;height:8px;background:#6f7469;border:1px solid #b3aa83;box-shadow:0 0 0 2px #1a201d,26px -8px 0 -1px #8a7548;transform-origin:8px 4px;animation:ir-tool-strike var(--repair-speed) ease-in-out infinite alternate}
    .ir-maintenance-vfx.repair .spark{display:block;left:70%;top:63%;width:5px;height:5px;background:#ffd98a;box-shadow:18px -9px #e4a755,29px 5px #ffdf9b,40px -16px #bd7840,52px 10px #e9bb67;opacity:var(--sparks);animation:ir-repair-burst .34s steps(2,end) infinite}
    .ir-maintenance-vfx.repair:after{content:'';position:absolute;left:63%;top:54%;width:18%;height:22%;background:radial-gradient(circle,#f2b7602c 0,#0000 62%);opacity:var(--sparks);animation:ir-repair-glow .28s ease-in-out infinite alternate}
    @keyframes ir-foam{0%{transform:translate(0,1px) scale(.9);opacity:.45}100%{transform:translate(6px,-4px) scale(1.08);opacity:.9}}
    @keyframes ir-sparks{0%{transform:translate(0,0);opacity:.25}55%{transform:translate(5px,-5px);opacity:1}100%{transform:translate(9px,-8px);opacity:0}}
    @keyframes ir-spray-cone{0%{transform:rotate(-4deg) scaleX(.94) scaleY(.86)}100%{transform:rotate(2deg) scaleX(1.04) scaleY(1.08)}}
    @keyframes ir-foam-haze{0%{transform:translate(-1%,1%) scale(.96)}100%{transform:translate(2%,-2%) scale(1.05)}}
    @keyframes ir-tool-strike{0%{transform:rotate(-23deg) translate(-4px,2px)}100%{transform:rotate(18deg) translate(5px,-3px)}}
    @keyframes ir-repair-burst{0%{transform:translate(0,0) scale(.7);opacity:.15}60%{transform:translate(10px,-12px) scale(1.1);opacity:var(--sparks)}100%{transform:translate(18px,-21px) scale(.55);opacity:0}}
    @keyframes ir-repair-glow{from{transform:scale(.86)}to{transform:scale(1.08)}}
    @media(max-width:900px) and (orientation:landscape){.ir-maintenance{top:61%;min-width:154px;grid-template-columns:40px auto;gap:8px;padding:6px 9px 6px 6px;background:#091009f2;backdrop-filter:none}.ir-maintenance-ring{width:34px;height:34px}.ir-maintenance-ring:after{width:24px;height:24px}.ir-maintenance-copy span{font-size:8px}.ir-maintenance-copy b{font-size:6.5px}.ir-maintenance-value{font-size:7px}.ir-maintenance.extinguish:before,.ir-maintenance.repair:before,.ir-maintenance.repair:after{animation:none}.ir-maintenance.extinguish:before{transform:translate(3px,-2px);opacity:.72}.ir-maintenance.repair:before,.ir-maintenance.repair:after{transform:translate(4px,-4px);opacity:.85}.ir-maintenance-vfx.extinguish .foam{left:12%;top:59%;width:55%;height:22%;animation-duration:.26s}.ir-maintenance-vfx.extinguish:after,.ir-maintenance-vfx.repair:after{animation:none}.ir-maintenance-vfx.repair .tool{left:72%;top:58%}.ir-maintenance-vfx.repair .spark{left:74%;top:61%}.ir-maintenance-vfx.repair:after{left:68%;top:50%}}
    @media(prefers-reduced-motion:reduce){.ir-maintenance.extinguish:before,.ir-maintenance.repair:before,.ir-maintenance.repair:after,.ir-maintenance-vfx .foam,.ir-maintenance-vfx .spark,.ir-maintenance-vfx .tool,.ir-maintenance-vfx:after{animation:none!important}.ir-maintenance.extinguish:before{transform:translate(3px,-2px);opacity:.68}.ir-maintenance.repair:before,.ir-maintenance.repair:after{transform:translate(4px,-4px);opacity:.8}}
  `;
  document.head.appendChild(style);
  root = document.createElement('div');
  root.className = 'ir-maintenance';
  root.hidden = true;
  root.innerHTML = '<div class="ir-maintenance-ring"><span class="ir-maintenance-value">0%</span></div><div class="ir-maintenance-copy"><b>MANUTENÇÃO LOCAL</b><span>AGUARDANDO</span></div>';
  source = root.querySelector('.ir-maintenance-copy b');
  label = root.querySelector('.ir-maintenance-copy span');
  value = root.querySelector('.ir-maintenance-value');
  document.body.appendChild(root);
  vfx = document.createElement('div');
  vfx.className = 'ir-maintenance-vfx';
  vfx.innerHTML = '<i class="foam"></i><i class="tool"></i><i class="spark"></i>';
  document.body.appendChild(vfx);
  return root;
}

function setStyleProperty(element, name, next) {
  if (!element || element.style.getPropertyValue(name) === next) return;
  element.style.setProperty(name, next);
}

function setText(element, next) {
  if (element && element.textContent !== next) element.textContent = next;
}

function hideMaintenance(element) {
  if (element && !element.hidden) element.hidden = true;
  if (vfx && vfx.className !== 'ir-maintenance-vfx') vfx.className = 'ir-maintenance-vfx';
}

function render(detail) {
  const element = ensureOverlay();
  if (!element || !detail?.active) {
    hideMaintenance(element);
    return;
  }
  const progress = Math.max(0, Math.min(1, Number(detail.progress) || 0));
  const spray = Math.max(0, Math.min(1, Number(detail.spray) || 0));
  const sparks = Math.max(0, Math.min(1, Number(detail.sparks) || 0));
  const repairMotion = Math.max(0, Math.min(1, Number(detail.repairMotion) || 0));
  const danger = Math.max(0, Math.min(1, Number(detail.dangerPulse) || 0));
  const isExtinguish = detail.kind === 'extinguish';
  const isRepair = detail.kind === 'repair';
  if (!isExtinguish && !isRepair) {
    hideMaintenance(element);
    return;
  }
  const vfxActive = isExtinguish ? spray > .02 : repairMotion > .02 || sparks > .02;
  element.hidden = false;
  element.classList.toggle('extinguish', isExtinguish);
  element.classList.toggle('repair', isRepair);
  element.classList.toggle('remote', detail.remote === true);
  setStyleProperty(element, '--p', (Math.round(progress * 100) / 100).toFixed(2));
  setText(source, detail.remote ? 'OUTRO TRIPULANTE' : 'MANUTENÇÃO LOCAL');
  setText(label, isExtinguish ? 'APAGANDO INCÊNDIO' : 'REPARANDO MOTOR');
  setText(value, `${Math.round(progress * 100)}%`);
  if (vfx) {
    const nextClass = `ir-maintenance-vfx${vfxActive ? ' active' : ''}${detail.remote === true ? ' remote' : ''} ${isExtinguish ? 'extinguish' : 'repair'}`;
    if (vfx.className !== nextClass) vfx.className = nextClass;
    setStyleProperty(vfx, '--spray', (Math.round(spray * 100) / 100).toFixed(2));
    setStyleProperty(vfx, '--sparks', (Math.round(sparks * 100) / 100).toFixed(2));
    setStyleProperty(vfx, '--danger', (Math.round(danger * 100) / 100).toFixed(2));
    setStyleProperty(vfx, '--repair-speed', `${(.42 - Math.round(repairMotion * 100) / 100 * .12).toFixed(3)}s`);
  }
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener(EVENT_NAME, event => render(event?.detail));
}

export { EVENT_NAME, render as renderMaintenanceOverlay };
