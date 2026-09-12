const EVENT_NAME = 'iron-rain:maintenance-feedback';

let root = null;
let label = null;
let value = null;

function ensureOverlay() {
  if (root || typeof document === 'undefined') return root;
  const style = document.createElement('style');
  style.textContent = `
    .ir-maintenance{--p:0;position:fixed;left:50%;top:58%;z-index:18;transform:translate(-50%,-50%);display:grid;grid-template-columns:46px auto;align-items:center;gap:10px;min-width:178px;padding:8px 11px 8px 8px;pointer-events:none;background:#091009d9;border:1px solid #b9ad7558;border-left:2px solid #c4ad70;box-shadow:0 8px 26px #0009;color:#e8ddb9;font-family:ui-monospace,Consolas,monospace;backdrop-filter:blur(2px)}
    .ir-maintenance[hidden]{display:none}
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
    @keyframes ir-foam{0%{transform:translate(0,1px) scale(.9);opacity:.45}100%{transform:translate(6px,-4px) scale(1.08);opacity:.9}}
    @keyframes ir-sparks{0%{transform:translate(0,0);opacity:.25}55%{transform:translate(5px,-5px);opacity:1}100%{transform:translate(9px,-8px);opacity:0}}
    @media(max-width:900px) and (orientation:landscape){.ir-maintenance{top:61%;min-width:154px;grid-template-columns:40px auto;gap:8px;padding:6px 9px 6px 6px}.ir-maintenance-ring{width:34px;height:34px}.ir-maintenance-ring:after{width:24px;height:24px}.ir-maintenance-copy span{font-size:8px}.ir-maintenance-copy b{font-size:6.5px}.ir-maintenance-value{font-size:7px}}
    @media(prefers-reduced-motion:reduce){.ir-maintenance.extinguish:before,.ir-maintenance.repair:before,.ir-maintenance.repair:after{animation:none}.ir-maintenance.extinguish:before{transform:translate(3px,-2px);opacity:.68}.ir-maintenance.repair:before,.ir-maintenance.repair:after{transform:translate(4px,-4px);opacity:.8}}
  `;
  document.head.appendChild(style);
  root = document.createElement('div');
  root.className = 'ir-maintenance';
  root.hidden = true;
  root.innerHTML = '<div class="ir-maintenance-ring"><span class="ir-maintenance-value">0%</span></div><div class="ir-maintenance-copy"><b>MANUTENÇÃO LOCAL</b><span>AGUARDANDO</span></div>';
  label = root.querySelector('.ir-maintenance-copy span');
  value = root.querySelector('.ir-maintenance-value');
  document.body.appendChild(root);
  return root;
}

function render(detail) {
  const element = ensureOverlay();
  if (!element || !detail?.active) {
    if (element) element.hidden = true;
    return;
  }
  const progress = Math.max(0, Math.min(1, Number(detail.progress) || 0));
  element.hidden = false;
  element.classList.toggle('extinguish', detail.kind === 'extinguish');
  element.classList.toggle('repair', detail.kind === 'repair');
  element.style.setProperty('--p', String(progress));
  label.textContent = detail.kind === 'extinguish' ? 'APAGANDO INCÊNDIO' : 'REPARANDO MOTOR';
  value.textContent = `${Math.round(progress * 100)}%`;
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener(EVENT_NAME, event => render(event?.detail));
}

export { EVENT_NAME, render as renderMaintenanceOverlay };
