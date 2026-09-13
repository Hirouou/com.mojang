import { ballistics } from './ballistics.js';
import { artilleryChargeTableRows } from './artillery-charge-table-view.js';
import { mapPointerSettings, pointerDistance, precisePlotPoint, precisePanView } from './map-touch-precision.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = value => Math.round(value).toLocaleString('pt-BR');
const coordinate = value => String(Math.round(value)).padStart(5, '0');
const signed = value => `${value >= 0 ? '+' : '−'}${number(Math.abs(value))}`;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

/** East-positive X, south-positive Y; clockwise bearings from geographic north. */
export function calculatePlot(own, target) {
  const dx = target.x - own.x;
  const dy = target.y - own.y;
  const distance = Math.hypot(dx, dy);
  return { dx, dy, distance, azimuth: distance < 0.001 ? null : (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360 };
}

/**
 * Snapshot-only plotting table. Never receives combat entities or mutates the gun.
 * open({world:{w,h}, own:{x,y}, targets:[{id,type,x,y,reportedAt,source}],
 *       missionId, time, charge, elev}) freezes the supplied report data.
 */
export function createTableMap(root, { onClose = () => {} } = {}) {
  root.innerHTML = `
    <div class="map-card">
      <header class="map-head">
        <div class="map-head-title"><span class="map-head-mark" aria-hidden="true">⌖</span><div><b>MAPA DE MESA</b><small>CADERNETA DO OPERADOR / M-47 MAMUTE</small></div></div>
        <button type="button" data-map-close aria-label="Fechar mapa e voltar à peça">VOLTAR À PEÇA <span aria-hidden="true">×</span></button>
      </header>
      <div class="map-workspace">
        <section class="map-paper-area" aria-label="Carta quadriculada e régua manual">
          <div class="map-tools">
            <button type="button" data-map-mode="plot" class="active" aria-pressed="true">⌖ RÉGUA</button>
            <button type="button" data-map-mode="pan" aria-pressed="false">↔ MOVER</button>
            <button type="button" data-map-mission title="Traçar até o informe da missão">MISSÃO</button>
            <div class="map-zoom">
              <button type="button" data-map-zoom="out" aria-label="Reduzir escala do papel">−</button>
              <button type="button" data-map-zoom="in" aria-label="Ampliar papel">+</button>
              <button type="button" data-map-fit aria-label="Enquadrar a régua no papel">VER</button>
            </div>
          </div>
          <div class="map-surface">
            <canvas data-map-canvas tabindex="0" aria-label="Mapa de mesa: toque ou arraste para marcar uma coordenada; use Mover para deslocar o papel. Setas movem a coordenada em 100 metros; Shift move em 1.000 metros."></canvas>
            <div class="map-paper-caption"><span>QUADRÍCULA 5.000 × 5.000 m</span><span>● M-47 &nbsp; × INFORME</span></div>
          </div>
        </section>
        <aside class="map-sidebar" aria-label="Caderneta de tiro">
          <div class="map-tabs" role="tablist" aria-label="Páginas da caderneta">
            <button id="map-tab-plot" type="button" role="tab" aria-selected="true" aria-controls="map-page-plot" data-map-tab="plot" class="active">TRAÇADO</button>
            <button id="map-tab-charges" type="button" role="tab" aria-selected="false" aria-controls="map-page-charges" data-map-tab="charges">CARGAS</button>
            <button id="map-tab-manual" type="button" role="tab" aria-selected="false" aria-controls="map-page-manual" data-map-tab="manual">COMO LER</button>
          </div>
          <section id="map-page-plot" class="map-tab-content" role="tabpanel" aria-labelledby="map-tab-plot" data-map-page="plot">
            <label class="map-form-label" for="map-report">COORDENADA / INFORME RECEBIDO</label>
            <select id="map-report" class="map-report-select" data-map-reports aria-label="Selecionar informe recebido"></select>
            <div class="map-report-meta" data-map-report-meta></div>
            <div class="map-coords">
              <div class="map-coordinate"><label>MAMUTE / ORIGEM</label><output data-map-own></output></div>
              <div class="map-coordinate target"><label data-map-point-label>PONTO TRAÇADO</label><output data-map-target></output></div>
            </div>
            <div class="map-solution"><div><small>DISTÂNCIA</small><strong data-map-distance>—</strong></div><div><small>AZIMUTE</small><strong data-map-bearing>—</strong></div></div>
            <div class="map-deltas" data-map-deltas></div>
            <div class="map-equations">d = √(ΔX² + ΔY²)<br>az = atan2(ΔX, −ΔY), convertido para 0–360°</div>
            <form class="map-point-form" data-map-point-form>
              <label for="map-point-x">X / LESTE (m)<input id="map-point-x" data-map-x inputmode="numeric" type="text" autocomplete="off" spellcheck="false" aria-label="Coordenada X em metros"></label>
              <label for="map-point-y">Y / SUL (m)<input id="map-point-y" data-map-y inputmode="numeric" type="text" autocomplete="off" spellcheck="false" aria-label="Coordenada Y em metros"></label>
              <button type="submit" aria-label="Traçar coordenadas digitadas">↗</button>
            </form>
            <div class="map-form-error" data-map-error role="status"></div>
          </section>
          <section id="map-page-charges" class="map-tab-content hidden" role="tabpanel" aria-labelledby="map-tab-charges" data-map-page="charges">
            <p class="map-table-intro" data-map-charge-intro></p>
            <table class="map-charge-table"><thead><tr><th>CARGA</th><th>FAIXA NOMINAL (m)</th><th>TRAÇADO</th></tr></thead><tbody data-map-charge-rows></tbody></table>
            <p class="map-charge-footnote" data-map-charge-footnote></p>
          </section>
          <section id="map-page-manual" class="map-tab-content map-manual hidden" role="tabpanel" aria-labelledby="map-tab-manual" data-map-page="manual">
            <p><b>01 / Localize.</b> X cresce para leste (→); Y cresce para sul (↓). Cada quadrícula tem <b>5.000 m</b> de lado.</p>
            <p><b>02 / Trace.</b> Selecione um informe ou toque o papel. A régua sempre começa no Mamute. Amplie para marcar com precisão.</p>
            <p><b>03 / Subtraia.</b><br><code>ΔX = X alvo − X Mamute<br>ΔY = Y alvo − Y Mamute</code></p>
            <p><b>04 / Oriente.</b> Norte 000° · Leste 090°<br>Sul 180° · Oeste 270°.</p>
            <p><b>05 / Opere.</b> Anote distância e azimute. Feche o mapa, gire as manivelas e combine carga e elevação. O papel não ajusta a peça.</p>
          </section>
        </aside>
      </div>
      <footer class="map-footer"><b>Cópia dos informes recebidos · posições podem ter mudado</b><span class="map-stamp" data-map-stamp></span></footer>
    </div>`;

  const find = selector => root.querySelector(selector);
  const canvas = find('[data-map-canvas]');
  const ctx = canvas.getContext('2d');
  const surface = find('.map-surface');
  const reportsSelect = find('[data-map-reports]');
  const ownOutput = find('[data-map-own]');
  const targetOutput = find('[data-map-target]');
  const meta = find('[data-map-report-meta]');
  const xInput = find('[data-map-x]');
  const yInput = find('[data-map-y]');
  let snapshot = null;
  let selectedReport = null;
  let point = null;
  let mode = 'plot';
  let tab = 'plot';
  let opened = false;
  let previousFocus = null;
  let width = 1, height = 1, dpr = 1;
  const view = { x: 0, y: 0, scale: 0.01 };
  const pointers = new Map();
  let gesture = null;

  const toScreen = value => ({ x: (value.x - view.x) * view.scale + width / 2, y: (value.y - view.y) * view.scale + height / 2 });
  const toWorld = value => ({ x: (value.x - width / 2) / view.scale + view.x, y: (value.y - height / 2) / view.scale + view.y });
  const localPoint = event => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const minScale = () => snapshot ? Math.min((width - 46) / snapshot.world.w, (height - 54) / snapshot.world.h) * .75 : .001;
  const validPoint = value => ({ x: Math.round(clamp(value.x, 0, snapshot.world.w)), y: Math.round(clamp(value.y, 0, snapshot.world.h)) });
  function constrainView() {
    view.x = clamp(view.x, -snapshot.world.w * .1, snapshot.world.w * 1.1);
    view.y = clamp(view.y, -snapshot.world.h * .1, snapshot.world.h * 1.1);
    view.scale = clamp(view.scale, Math.max(.0001, minScale()), .35);
  }

  function chooseTab(next) {
    tab = next;
    for (const button of root.querySelectorAll('[data-map-tab]')) {
      const active = button.dataset.mapTab === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
    for (const page of root.querySelectorAll('[data-map-page]')) page.classList.toggle('hidden', page.dataset.mapPage !== next);
  }

  function fit(all = false) {
    if (!snapshot) return;
    if (all || !point || Math.hypot(point.x - snapshot.own.x, point.y - snapshot.own.y) < 100) {
      view.x = snapshot.world.w / 2;
      view.y = snapshot.world.h / 2;
      view.scale = Math.min((width - 66) / snapshot.world.w, (height - 74) / snapshot.world.h);
    } else {
      view.x = (snapshot.own.x + point.x) / 2;
      view.y = (snapshot.own.y + point.y) / 2;
      view.scale = Math.min((width - 100) / Math.max(8000, Math.abs(point.x - snapshot.own.x)), (height - 94) / Math.max(8000, Math.abs(point.y - snapshot.own.y)), .04);
    }
    constrainView();
    draw();
  }

  function resize() {
    if (!opened) return;
    const rect = surface.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    width = rect.width; height = rect.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    constrainView();
    draw();
  }

  function setManual(next) {
    point = validPoint(next);
    selectedReport = null;
    reportsSelect.value = 'manual';
    find('[data-map-error]').textContent = '';
    updateCalculation();
  }

  function setReport(id, frame = true) {
    const report = snapshot.targets.find(target => String(target.id) === String(id));
    if (!report) return;
    selectedReport = report;
    point = { x: report.x, y: report.y };
    reportsSelect.value = String(report.id);
    find('[data-map-error]').textContent = '';
    updateCalculation();
    if (frame) fit();
  }

  function updateCalculation() {
    if (!snapshot || !point) return;
    const plot = calculatePlot(snapshot.own, point);
    ownOutput.innerHTML = `X ${coordinate(snapshot.own.x)}<br>Y ${coordinate(snapshot.own.y)}`;
    targetOutput.innerHTML = `X ${coordinate(point.x)}<br>Y ${coordinate(point.y)}`;
    find('[data-map-point-label]').textContent = selectedReport ? 'ALVO / INFORME' : 'PONTO TRAÇADO';
    find('[data-map-distance]').innerHTML = `${number(plot.distance)} <em>m</em>`;
    find('[data-map-bearing]').textContent = plot.azimuth === null ? '—' : `${plot.azimuth.toFixed(1).padStart(5, '0')}°`;
    find('[data-map-deltas]').innerHTML = `ΔX = ${signed(plot.dx)} m <span aria-hidden="true">·</span> ΔY = ${signed(plot.dy)} m`;
    const age = selectedReport && Number.isFinite(selectedReport.reportedAt) ? Math.max(0, Math.floor(snapshot.time - selectedReport.reportedAt)) : null;
    meta.textContent = selectedReport ? `${selectedReport.source || 'Rádio'}${age !== null ? ` · recebido há ${age < 60 ? `${age}s` : `${Math.floor(age / 60)}min`}` : ' · posição informada'}` : 'Régua manual · marque no papel ou digite X / Y';
    meta.title = meta.textContent;
    xInput.value = Math.round(point.x); yInput.value = Math.round(point.y);
    find('[data-map-charge-intro]').innerHTML = `Distância traçada: <b>${number(plot.distance)} m</b>.<br>Elevações, ápice e tempo vêm da mesma balística fictícia da peça; nada é aplicado automaticamente.`;
    const chargeRows = artilleryChargeTableRows(plot.distance, snapshot.charge, snapshot.elev);
    find('[data-map-charge-rows]').innerHTML = chargeRows.map(row => {
      const arcs = row.arcs.map(arc => arc.displayLabel).join('<br>');
      return `<tr class="${row.reachable ? 'compatible ' : ''}${row.current ? 'current' : ''}"><td>${row.current ? '▸' : ' '} C${row.charge}</td><td>${number(row.min)}–${number(row.max)}</td><td>${arcs || '—'}</td></tr>`;
    }).join('');
    const setting = ballistics(snapshot.charge, snapshot.elev);
    find('[data-map-charge-footnote]').innerHTML = `Ao abrir: C${snapshot.charge} · ${Number(snapshot.elev).toFixed(1)}°<br>Alcance ${number(setting.range)} m · ápice ${number(setting.apex)} m.<br>Caderneta somente informativa. Observe o vento e a resposta do tiro.`;
    draw();
  }

  function drawLabel(text, x, y, ink, align = 'left') {
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textAlign = align;
    const metrics = ctx.measureText(text);
    const boxX = align === 'right' ? x - metrics.width - 3 : align === 'center' ? x - metrics.width / 2 - 3 : x - 3;
    ctx.fillStyle = 'rgba(222,211,176,.92)';
    ctx.fillRect(boxX, y - 10, metrics.width + 6, 14);
    ctx.fillStyle = ink;
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  function draw() {
    if (!opened || !snapshot) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#dbcfaa'; ctx.fillRect(0, 0, width, height);
    const paperLight = ctx.createRadialGradient(width * .4, height * .35, 10, width * .4, height * .35, width * .7);
    paperLight.addColorStop(0, 'rgba(252,240,209,.36)'); paperLight.addColorStop(1, 'rgba(86,71,34,.12)');
    ctx.fillStyle = paperLight; ctx.fillRect(0, 0, width, height);
    // Fixed, decorative paper grain. No random state and no strategic information.
    ctx.fillStyle = '#655b3920';
    for (let index = 0; index < 340; index++) ctx.fillRect((index * 127.37) % width, (index * 53.11) % height, .8, .8);
    ctx.strokeStyle = '#83795445'; ctx.lineWidth = 1; ctx.strokeRect(7.5, 7.5, width - 15, height - 15);
    const topLeft = toWorld({ x: 0, y: 0 });
    const bottomRight = toWorld({ x: width, y: height });
    const beginX = Math.max(0, Math.floor(topLeft.x / 5000) * 5000);
    const endX = Math.min(snapshot.world.w, bottomRight.x + 5000);
    const beginY = Math.max(0, Math.floor(topLeft.y / 5000) * 5000);
    const endY = Math.min(snapshot.world.h, bottomRight.y + 5000);
    const worldTL = toScreen({ x: 0, y: 0 });
    const worldBR = toScreen({ x: snapshot.world.w, y: snapshot.world.h });
    ctx.fillStyle = '#756a3210';
    if (worldTL.x > 0) ctx.fillRect(0, 0, worldTL.x, height);
    if (worldBR.x < width) ctx.fillRect(worldBR.x, 0, width - worldBR.x, height);
    if (worldTL.y > 0) ctx.fillRect(0, 0, width, worldTL.y);
    if (worldBR.y < height) ctx.fillRect(0, worldBR.y, width, height - worldBR.y);
    ctx.save();
    ctx.beginPath(); ctx.rect(Math.max(8, worldTL.x), Math.max(8, worldTL.y), Math.max(0, Math.min(width - 8, worldBR.x) - Math.max(8, worldTL.x)), Math.max(0, Math.min(height - 8, worldBR.y) - Math.max(8, worldTL.y))); ctx.clip();
    if (view.scale * 5000 > 105) {
      ctx.strokeStyle = '#74794819'; ctx.lineWidth = .7; ctx.beginPath();
      for (let x = Math.max(0, Math.floor(topLeft.x / 1000) * 1000); x <= Math.min(snapshot.world.w, bottomRight.x); x += 1000) { const screen = toScreen({ x, y: 0 }); ctx.moveTo(screen.x, 0); ctx.lineTo(screen.x, height); }
      for (let y = Math.max(0, Math.floor(topLeft.y / 1000) * 1000); y <= Math.min(snapshot.world.h, bottomRight.y); y += 1000) { const screen = toScreen({ x: 0, y }); ctx.moveTo(0, screen.y); ctx.lineTo(width, screen.y); }
      ctx.stroke();
    }
    ctx.strokeStyle = '#6770494d'; ctx.lineWidth = .8; ctx.beginPath();
    for (let x = beginX; x <= endX; x += 5000) { const screen = toScreen({ x, y: 0 }); ctx.moveTo(screen.x, 0); ctx.lineTo(screen.x, height); }
    for (let y = beginY; y <= endY; y += 5000) { const screen = toScreen({ x: 0, y }); ctx.moveTo(0, screen.y); ctx.lineTo(width, screen.y); }
    ctx.stroke();
    // Quadrant names describe the paper grid only.
    if (view.scale * 5000 > 55) {
      ctx.fillStyle = '#5d644124'; ctx.font = '11px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center';
      for (let x = beginX; x <= endX; x += 5000) for (let y = beginY; y <= endY; y += 5000) {
        const screen = toScreen({ x: x + 2500, y: y + 2500 });
        ctx.fillText(`${String.fromCharCode(65 + Math.floor(x / 5000))}${Math.floor(y / 5000) + 1}`, screen.x, screen.y);
      }
      ctx.textAlign = 'left';
    }
    ctx.restore();
    ctx.strokeStyle = '#5c654875'; ctx.strokeRect(worldTL.x, worldTL.y, worldBR.x - worldTL.x, worldBR.y - worldTL.y);
    const labelEvery = 5000 * Math.max(1, Math.ceil(54 / (view.scale * 5000)));
    ctx.font = '9px ui-monospace, Consolas, monospace'; ctx.fillStyle = '#616344';
    ctx.textAlign = 'center';
    for (let x = Math.max(0, Math.ceil(topLeft.x / labelEvery) * labelEvery); x <= Math.min(snapshot.world.w, bottomRight.x); x += labelEvery) {
      const screen = toScreen({ x, y: 0 });
      if (screen.x > 36 && screen.x < width - 20) ctx.fillText(coordinate(x), screen.x, 20);
    }
    ctx.textAlign = 'left';
    for (let y = Math.max(0, Math.ceil(topLeft.y / labelEvery) * labelEvery); y <= Math.min(snapshot.world.h, bottomRight.y); y += labelEvery) {
      const screen = toScreen({ x: 0, y });
      if (screen.y > 36 && screen.y < height - 35) { ctx.fillStyle = '#dcd0adcf'; ctx.fillRect(9, screen.y - 8, 34, 12); ctx.fillStyle = '#616344'; ctx.fillText(coordinate(y), 11, screen.y + 1); }
    }
    ctx.fillStyle = '#696945'; ctx.font = '7px ui-monospace, Consolas, monospace'; ctx.fillText('Y / m', 12, 20); ctx.fillText('X / m', width - 37, 32);

    for (const report of snapshot.targets) {
      const screen = toScreen(report);
      if (screen.x < 15 || screen.x > width - 15 || screen.y < 24 || screen.y > height - 25) continue;
      const selected = selectedReport && String(selectedReport.id) === String(report.id);
      ctx.strokeStyle = selected ? '#874830' : '#986d4f99'; ctx.lineWidth = selected ? 1.8 : 1.1;
      ctx.beginPath(); ctx.moveTo(screen.x - 5, screen.y - 5); ctx.lineTo(screen.x + 5, screen.y + 5); ctx.moveTo(screen.x + 5, screen.y - 5); ctx.lineTo(screen.x - 5, screen.y + 5); ctx.stroke();
      if (selected || view.scale > .012) {
        const align = screen.x > width * .65 ? 'right' : 'left';
        drawLabel(String(report.type || 'INFORME'), screen.x + (align === 'right' ? -9 : 9), screen.y - 8, selected ? '#85472f' : '#986d4f', align);
      }
    }
    const own = toScreen(snapshot.own);
    const target = toScreen(point);
    const plot = calculatePlot(snapshot.own, point);
    if (plot.distance > 0) {
      // Projection legs are the taught ΔX/ΔY; the ruled course is purely geometric.
      ctx.setLineDash([3, 5]); ctx.strokeStyle = '#747c5273'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(own.x, own.y); ctx.lineTo(target.x, own.y); ctx.lineTo(target.x, target.y); ctx.stroke();
      ctx.setLineDash([]); ctx.strokeStyle = '#465d50'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(own.x, own.y); ctx.lineTo(target.x, target.y); ctx.stroke();
      const angle = Math.atan2(target.y - own.y, target.x - own.x);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      ctx.lineWidth = 1; ctx.beginPath();
      for (let metre = 1000; metre < plot.distance; metre += 1000) {
        if (view.scale * 1000 < 4 && metre % 5000 !== 0) continue;
        const t = metre / plot.distance, x = own.x + (target.x - own.x) * t, y = own.y + (target.y - own.y) * t;
        const tick = metre % 5000 === 0 ? 5 : 2.5;
        ctx.moveTo(x - nx * tick, y - ny * tick); ctx.lineTo(x + nx * tick, y + ny * tick);
      }
      ctx.stroke();
      const mx = (own.x + target.x) / 2, my = (own.y + target.y) / 2;
      if (mx > 75 && mx < width - 70 && my > 35 && my < height - 35) drawLabel(`${number(plot.distance)} m / ${plot.azimuth.toFixed(1)}°`, mx, my - 9, '#435a49', 'center');
    }
    if (!selectedReport && target.x > 12 && target.x < width - 12 && target.y > 20 && target.y < height - 25) {
      ctx.strokeStyle = '#85553e'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(target.x, target.y, 6, 0, Math.PI * 2); ctx.moveTo(target.x - 11, target.y); ctx.lineTo(target.x + 11, target.y); ctx.moveTo(target.x, target.y - 11); ctx.lineTo(target.x, target.y + 11); ctx.stroke();
    }
    if (own.x > 0 && own.x < width && own.y > 0 && own.y < height) {
      ctx.fillStyle = '#33594f'; ctx.strokeStyle = '#eee2b9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(own.x, own.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const rightSide = own.x > width - 88;
      drawLabel('M-47 / ORIGEM', own.x + (rightSide ? -10 : 10), own.y + 16, '#375549', rightSide ? 'right' : 'left');
    }
    // Small compass and a scale bar belong to the paper, never the game camera.
    const compassX = width - 31, compassY = 54;
    ctx.fillStyle = '#dcd1aeeb'; ctx.beginPath(); ctx.arc(compassX, compassY + 4, 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5e6546'; ctx.fillStyle = '#5e6546'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(compassX, compassY - 10); ctx.lineTo(compassX, compassY + 16); ctx.moveTo(compassX - 9, compassY + 6); ctx.lineTo(compassX + 9, compassY + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(compassX, compassY - 12); ctx.lineTo(compassX - 4, compassY - 2); ctx.lineTo(compassX + 4, compassY - 2); ctx.closePath(); ctx.fill(); ctx.font = 'bold 9px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText('N', compassX, compassY - 17); ctx.textAlign = 'left';
    const scaleDistance = [100, 250, 500, 1000, 2500, 5000, 10000, 20000].find(distance => distance * view.scale >= 42) || 20000;
    const barWidth = scaleDistance * view.scale;
    const barX = 16, barY = height - 40;
    ctx.fillStyle = '#e4d8b6d9'; ctx.fillRect(barX - 4, barY - 15, barWidth + 10, 23); ctx.fillStyle = '#66704a'; ctx.fillRect(barX, barY, barWidth / 2, 4); ctx.strokeStyle = '#66704a'; ctx.strokeRect(barX, barY, barWidth, 4); ctx.font = '8px ui-monospace, Consolas, monospace'; ctx.fillText(`${number(scaleDistance)} m`, barX, barY - 5);
  }

  function zoom(factor, anchor = { x: width / 2, y: height / 2 }) {
    const before = toWorld(anchor);
    view.scale *= factor;
    constrainView();
    const after = toWorld(anchor);
    view.x += before.x - after.x; view.y += before.y - after.y;
    constrainView(); draw();
  }

  function resetGesture() {
    const active = [...pointers.values()];
    if (active.length >= 2) {
      const midpoint = { x: (active[0].x + active[1].x) / 2, y: (active[0].y + active[1].y) / 2 };
      gesture = { kind: 'pinch', distance: Math.max(1, Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y)), anchor: toWorld(midpoint), scale: view.scale };
    } else if (active.length === 1) {
      gesture = { kind: mode, start: active[0], startWorld: toWorld(active[0]), pointerType: active[0].pointerType, x: view.x, y: view.y };
    } else gesture = null;
  }

  canvas.addEventListener('pointerdown', event => {
    if (!opened || event.button > 0) return;
    event.preventDefault();
    const local = localPoint(event), pointerType = event.pointerType || 'mouse';
    pointers.set(event.pointerId, { ...local, pointerType });
    canvas.setPointerCapture(event.pointerId);
    resetGesture();
    // Mouse keeps the immediate 1:1 plotting behaviour. A thumb/pen gets a
    // short deadzone so touching down does not throw the plotted coordinate.
    if (pointers.size === 1 && mode === 'plot' && !mapPointerSettings(pointerType).coarse) setManual(toWorld(local));
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    const current = localPoint(event), previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { ...current, pointerType: previous?.pointerType || event.pointerType || 'mouse' });
    const active = [...pointers.values()];
    if (gesture?.kind === 'pinch' && active.length >= 2) {
      const midpoint = { x: (active[0].x + active[1].x) / 2, y: (active[0].y + active[1].y) / 2 };
      view.scale = gesture.scale * Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y) / gesture.distance;
      constrainView();
      view.x = gesture.anchor.x - (midpoint.x - width / 2) / view.scale;
      view.y = gesture.anchor.y - (midpoint.y - height / 2) / view.scale;
      constrainView(); draw();
    } else if (gesture?.kind === 'pan') {
      const settings = mapPointerSettings(gesture.pointerType);
      if (pointerDistance(gesture.start, current) < settings.deadzonePx) return;
      const nextView = precisePanView({ startScreen: gesture.start, currentScreen: current, startView: { x: gesture.x, y: gesture.y }, scale: view.scale, pointerType: gesture.pointerType });
      view.x = nextView.x; view.y = nextView.y;
      constrainView(); draw();
    } else if (gesture?.kind === 'plot') {
      const settings = mapPointerSettings(gesture.pointerType);
      if (pointerDistance(gesture.start, current) < settings.deadzonePx) return;
      setManual(settings.coarse ? precisePlotPoint({ startScreen: gesture.start, currentScreen: current, startWorld: gesture.startWorld, scale: view.scale, pointerType: gesture.pointerType }) : toWorld(current));
    }
  });
  const endPointer = event => {
    const current = pointers.get(event.pointerId);
    // A short coarse-pointer tap still places a point exactly where the user
    // touched; only dragging is reduced for precision.
    if (gesture?.kind === 'plot' && current && pointers.size === 1) {
      const settings = mapPointerSettings(gesture.pointerType);
      if (settings.coarse && pointerDistance(gesture.start, current) < settings.deadzonePx) setManual(toWorld(current));
    }
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    resetGesture();
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', event => { if (pointers.delete(event.pointerId)) resetGesture(); });
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoom(Math.exp(-event.deltaY * .002), localPoint(event)); }, { passive: false });
  canvas.addEventListener('keydown', event => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!direction || !point) return;
    event.preventDefault(); event.stopPropagation();
    const increment = event.shiftKey ? 1000 : 100;
    setManual({ x: point.x + direction[0] * increment, y: point.y + direction[1] * increment });
  });
  for (const button of root.querySelectorAll('[data-map-mode]')) button.addEventListener('click', () => {
    mode = button.dataset.mapMode;
    for (const sibling of root.querySelectorAll('[data-map-mode]')) { const active = sibling === button; sibling.classList.toggle('active', active); sibling.setAttribute('aria-pressed', String(active)); }
    canvas.style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
  });
  for (const button of root.querySelectorAll('[data-map-tab]')) button.addEventListener('click', () => chooseTab(button.dataset.mapTab));
  find('[data-map-mission]').addEventListener('click', () => { setReport(snapshot.missionId); chooseTab('plot'); });
  reportsSelect.addEventListener('change', () => { if (reportsSelect.value === 'manual') { selectedReport = null; updateCalculation(); } else setReport(reportsSelect.value); });
  find('[data-map-zoom="in"]').addEventListener('click', () => zoom(1.5));
  find('[data-map-zoom="out"]').addEventListener('click', () => zoom(1 / 1.5));
  find('[data-map-fit]').addEventListener('click', () => fit());
  find('[data-map-point-form]').addEventListener('submit', event => {
    event.preventDefault();
    const parse = input => /^\d+(?:[.,]\d+)?$/.test(input.trim()) ? Number(input.trim().replace(',', '.')) : NaN;
    const x = parse(xInput.value), y = parse(yInput.value);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > snapshot.world.w || y > snapshot.world.h) {
      find('[data-map-error]').textContent = `Limites: X 0–${number(snapshot.world.w)} / Y 0–${number(snapshot.world.h)} m.`;
      return;
    }
    xInput.blur(); yInput.blur(); setManual({ x, y }); fit();
  });
  find('[data-map-close]').addEventListener('click', () => { close(); onClose(); });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); onClose(); }
    // Keep keyboard focus in the paper while the game is behind this modal.
    if (event.key === 'Tab') {
      const focusable = [...root.querySelectorAll('button, select, input, [tabindex="0"]')].filter(element => !element.disabled && element.offsetParent !== null);
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
    }
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(surface);

  function open(data) {
    snapshot = {
      world: { w: Number(data.world?.w ?? data.world?.width ?? 80000), h: Number(data.world?.h ?? data.world?.height ?? 60000) },
      own: { x: Number(data.own.x), y: Number(data.own.y) },
      targets: (data.targets || []).filter(target => Number.isFinite(target.x) && Number.isFinite(target.y)).map(target => ({ id: String(target.id), type: String(target.type || 'INFORME'), x: target.x, y: target.y, reportedAt: target.reportedAt, source: String(target.source || 'Rádio') })),
      missionId: data.missionId == null ? null : String(data.missionId),
      time: Number(data.time) || 0,
      charge: clamp(Number(data.charge) || 1, 1, 7),
      elev: Number.isFinite(data.elev) ? data.elev : 45
    };
    previousFocus = document.activeElement;
    opened = true;
    root.classList.remove('hidden');
    pointers.clear(); gesture = null;
    // Closing the notebook is not an instruction to erase the operator's plot.
    // Refresh a selected report when available; retain its last known coordinate
    // as a manual plot if it expires. New missions remain an explicit button.
    if (!point) {
      selectedReport = snapshot.targets.find(target => target.id === snapshot.missionId) || null;
      point = selectedReport ? { x: selectedReport.x, y: selectedReport.y } : { ...snapshot.own };
    } else if (selectedReport) {
      selectedReport = snapshot.targets.find(target => target.id === selectedReport.id) || null;
      if (selectedReport) point = { x: selectedReport.x, y: selectedReport.y };
    }
    point = validPoint(point);
    reportsSelect.innerHTML = `<option value="manual">Régua / coordenada manual</option>${snapshot.targets.map(target => `<option value="${escapeHTML(target.id)}">${escapeHTML(target.type)} · X${coordinate(target.x)} Y${coordinate(target.y)}</option>`).join('')}`;
    reportsSelect.value = selectedReport ? selectedReport.id : 'manual';
    find('[data-map-mission]').disabled = !snapshot.targets.some(target => target.id === snapshot.missionId);
    const time = Math.floor(snapshot.time);
    find('[data-map-stamp]').textContent = `REGISTRO ${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')} · ${snapshot.targets.length} INFORME${snapshot.targets.length === 1 ? '' : 'S'}`;
    chooseTab('plot');
    find('[data-map-error]').textContent = '';
    resize(); fit(); updateCalculation();
    find('[data-map-close]').focus({ preventScroll: true });
  }

  function close() {
    opened = false;
    root.classList.add('hidden');
    for (const pointerId of pointers.keys()) if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    pointers.clear(); gesture = null;
    xInput.blur(); yInput.blur();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  return { open, close, resize };
}
