'use strict';

const STALE_MS = 10000;
const WS_PORT = location.port || 3000;
const WS_URL = `ws://${location.hostname}:${WS_PORT}`;

let devices = [];
let dongleConnected = false;
let editingDeviceId = null;
let editingMaxHrDeviceId = null;
let zoneModel = localStorage.getItem('zoneModel') || '6zone';
let tileOrder = JSON.parse(localStorage.getItem('tileOrder') || '[]');
let targetZoneNum = JSON.parse(localStorage.getItem('targetZone-' + (localStorage.getItem('zoneModel') || '6zone')) ?? 'null');

function setTargetZone(num) {
    targetZoneNum = num;
    if (num === null) {
        localStorage.removeItem('targetZone-' + zoneModel);
    } else {
        localStorage.setItem('targetZone-' + zoneModel, JSON.stringify(num));
    }
    renderTargetZonePicker();
    render();
}

function clearTargetZone() {
    targetZoneNum = null;
    localStorage.removeItem('targetZone-' + zoneModel);
}

function getCompliance(zone) {
    if (targetZoneNum === null) return null;
    if (!zone) return 'unknown';
    if (zone.zoneNum === targetZoneNum) return 'on-target';
    if (zone.zoneNum > targetZoneNum) return 'above';
    return 'below';
}

// No arrows — trend arrow carries direction; badge carries settlement status
const COMPLIANCE_TEXT = { 'on-target': '✓ On Target', above: 'High', below: 'Low', unknown: '' };

function saveTileOrder() {
    tileOrder = [...grid.querySelectorAll('.tile[data-id]')].map((t) => t.dataset.id);
    localStorage.setItem('tileOrder', JSON.stringify(tileOrder));
}

function insertAtOrderedPosition(tile, deviceId) {
    // Ensure deviceId is in tileOrder; if not, append it
    if (!tileOrder.includes(deviceId)) {
        tileOrder.push(deviceId);
        localStorage.setItem('tileOrder', JSON.stringify(tileOrder));
    }
    const myIdx = tileOrder.indexOf(deviceId);
    // Find the first real tile already in the DOM whose order index comes after ours
    const realTiles = [...grid.querySelectorAll('.tile[data-id]')];
    const after = realTiles.find((t) => tileOrder.indexOf(t.dataset.id) > myIdx);
    if (after) {
        grid.insertBefore(tile, after);
    } else {
        // Place before the first empty slot, or append
        const firstEmpty = grid.querySelector('.tile--empty');
        if (firstEmpty) {
            grid.insertBefore(tile, firstEmpty);
        } else {
            grid.appendChild(tile);
        }
    }
}

// ── HR history (trend) ────────────────────────────────────────────────────────
const hrHistory = new Map(); // deviceId → [{ ts, hr }, ...]
const TREND_WINDOW_MS = 10000;

function recordHR(deviceId, hr) {
    if (hr == null) return;
    if (!hrHistory.has(deviceId)) hrHistory.set(deviceId, []);
    const buf = hrHistory.get(deviceId);
    buf.push({ ts: Date.now(), hr });
    const cutoff = Date.now() - TREND_WINDOW_MS;
    while (buf.length && buf[0].ts < cutoff) buf.shift();
}

function getTrend(deviceId) {
    const buf = hrHistory.get(deviceId);
    if (!buf || buf.length < 2) return 'unknown';
    const now = Date.now();
    const mid = now - 5000;
    const start = now - TREND_WINDOW_MS;
    const recent = buf.filter((r) => r.ts >= mid);
    const prior = buf.filter((r) => r.ts >= start && r.ts < mid);
    if (!recent.length || !prior.length) return 'unknown';
    const avg = (arr) => arr.reduce((s, r) => s + r.hr, 0) / arr.length;
    const delta = avg(recent) - avg(prior);
    if (delta >= 2) return 'rising';
    if (delta <= -2) return 'falling';
    return 'stable';
}

function trendHTML(deviceId) {
    const state = getTrend(deviceId);
    const ICONS = { rising: '↑', falling: '↓', stable: '→', unknown: '·' };
    return `<span class="tile-trend tile-trend--${state}">${ICONS[state]}</span>`;
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const grid = document.getElementById('grid');
const emptyState = document.getElementById('empty-state');
const dongleStatusEl = document.getElementById('dongle-status');

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWS() {
    const ws = new WebSocket(WS_URL);

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'update') {
            dongleConnected = msg.dongleConnected;
            devices = msg.devices;
            devices.forEach((d) => recordHR(d.deviceId, d.hr));
            render();
        } else if (msg.type === 'dongle') {
            dongleConnected = msg.dongleConnected;
            renderDongleStatus(msg.message);
        }
    };

    ws.onclose = () => {
        setTimeout(connectWS, 3000);
    };
}

// Initial REST fetch (snapshot before WS connects)
fetch('/api/devices')
    .then((r) => r.json())
    .then((data) => {
        devices = data;
        render();
    })
    .catch(() => { render(); });

document.body.dataset.zoneModel = zoneModel;
// Sync toggle button active state and render target zone picker once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.zone-toggle-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.model === zoneModel);
    });
    renderTargetZonePicker();
});
connectWS();
render(); // show empty slots immediately on load

// ── Signal helpers ────────────────────────────────────────────────────────────
// Use RSSI when available (ANT+ typical range: -40 strong → -90 weak dBm).
// Fall back to time-since-last-reading when RSSI hasn't arrived yet.
function signalStrength(lastSeen, rssi) {
    if (typeof rssi === 'number') {
        if (rssi >= -60) return 4;
        if (rssi >= -70) return 3;
        if (rssi >= -80) return 2;
        if (rssi >= -90) return 1;
        return 0;
    }
    const age = Date.now() - lastSeen;
    if (age < 3000) return 4;
    if (age < 6000) return 3;
    if (age < 10000) return 2;
    if (age < 20000) return 1;
    return 0;
}

function signalAgeText(lastSeen) {
    const s = Math.round((Date.now() - lastSeen) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
}

const SIGNAL_BARS = `<span class="signal-bar"></span><span class="signal-bar"></span><span class="signal-bar"></span><span class="signal-bar"></span>`;

function signalHTML(lastSeen, rssi) {
    return `<span class="signal" data-strength="${signalStrength(lastSeen, rssi)}">${SIGNAL_BARS}</span>`
        + `<span class="signal-age">${signalAgeText(lastSeen)}</span>`;
}

// ── Stale ticker ──────────────────────────────────────────────────────────────
setInterval(() => {
    document.querySelectorAll('.tile[data-id]').forEach((tile) => {
        const id = tile.dataset.id;
        const device = devices.find((d) => d.deviceId === id);
        if (!device) return;
        const isStale = Date.now() - device.lastSeen > STALE_MS;
        tile.classList.toggle('stale', isStale);

        const staleLabel = tile.querySelector('.tile-stale-label');
        if (staleLabel) staleLabel.textContent = isStale ? 'No signal' : '';

        const signalEl = tile.querySelector('.signal');
        if (signalEl) signalEl.dataset.strength = signalStrength(device.lastSeen, device.rssi);

        const ageEl = tile.querySelector('.signal-age');
        if (ageEl) ageEl.textContent = signalAgeText(device.lastSeen);
    });
}, 1000);

// ── Render ────────────────────────────────────────────────────────────────────
function renderDongleStatus(message) {
    if (!dongleConnected && message) {
        dongleStatusEl.textContent = message;
        dongleStatusEl.classList.remove('hidden');
    } else {
        dongleStatusEl.classList.add('hidden');
    }
}

function render() {
    renderDongleStatus();

    // Always show the grid with exactly 8 slots
    emptyState.classList.add('hidden');

    const TOTAL_SLOTS = 8;
    const currentIds = new Set(devices.map((d) => d.deviceId));

    // Remove tiles for devices no longer in state
    grid.querySelectorAll('.tile[data-id]').forEach((tile) => {
        if (!currentIds.has(tile.dataset.id)) tile.remove();
    });

    // Update or create real device tiles, keeping them before empty slots
    devices.forEach((device) => {
        let tile = grid.querySelector(`.tile[data-id="${device.deviceId}"]`);
        const isNew = !tile;
        if (isNew) {
            tile = createTile(device);
        } else {
            updateTile(tile, device);
        }
        // Only move tile in the DOM when newly created — moving an existing tile
        // removes and re-inserts it, which fires blur on any focused input inside it.
        if (isNew) {
            insertAtOrderedPosition(tile, device.deviceId);
        }
    });

    // Fill remaining slots with empty placeholder tiles
    const needed = TOTAL_SLOTS - devices.length;
    const existing = grid.querySelectorAll('.tile--empty').length;
    if (needed > existing) {
        for (let i = existing; i < needed; i++) {
            grid.appendChild(createEmptyTile());
        }
    } else if (needed < existing) {
        const extras = grid.querySelectorAll('.tile--empty');
        for (let i = needed; i < existing; i++) {
            extras[i].remove();
        }
    }
}

function createTile(device) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.id = device.deviceId;
    tile.innerHTML = tileHTML(device);
    updateTileZone(tile, getZone(device.hr, device.maxHr));
    bindTileEvents(tile, device);
    addDragHandlers(tile);
    return tile;
}

function createEmptyTile() {
    const tile = document.createElement('div');
    tile.className = 'tile tile--empty';
    tile.innerHTML = `
      <div class="empty-tile-hint">Waiting for athlete</div>
    `;
    addEmptyDragHandlers(tile);
    return tile;
}

// ── Drag-and-drop reordering ──────────────────────────────────────────────────
let draggedTile = null;

function addDragHandlers(tile) {
    tile.draggable = true;

    // Prevent child elements from being independently draggable (e.g. text spans)
    tile.querySelectorAll('*').forEach((el) => { el.draggable = false; });

    tile.addEventListener('dragstart', (e) => {
        // Ensure we're dragging the tile, not a child text node
        e.dataTransfer.setDragImage(tile, 0, 0);
        draggedTile = tile;
        // Defer adding class so the drag image is captured before opacity changes
        requestAnimationFrame(() => tile.classList.add('dragging'));
        e.dataTransfer.effectAllowed = 'move';
    });

    tile.addEventListener('dragend', () => {
        draggedTile = null;
        tile.classList.remove('dragging');
        grid.querySelectorAll('.drag-over').forEach((t) => t.classList.remove('drag-over'));
    });

    tile.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (tile !== draggedTile) tile.classList.add('drag-over');
    });

    tile.addEventListener('dragleave', () => {
        tile.classList.remove('drag-over');
    });

    tile.addEventListener('drop', (e) => {
        e.preventDefault();
        tile.classList.remove('drag-over');
        if (!draggedTile || draggedTile === tile) return;
        grid.insertBefore(draggedTile, tile);
        saveTileOrder();
    });
}

function addEmptyDragHandlers(tile) {
    tile.addEventListener('dragover', (e) => {
        e.preventDefault();
        tile.classList.add('drag-over');
    });

    tile.addEventListener('dragleave', () => {
        tile.classList.remove('drag-over');
    });

    tile.addEventListener('drop', (e) => {
        e.preventDefault();
        tile.classList.remove('drag-over');
        if (!draggedTile) return;
        grid.insertBefore(draggedTile, tile);
        saveTileOrder();
    });
}

function updateTile(tile, device) {
    const isStale = Date.now() - device.lastSeen > STALE_MS;
    tile.classList.toggle('stale', isStale);

    const zone = getZone(device.hr, device.maxHr);
    updateTileZone(tile, zone);

    // Guard name while editing
    if (editingDeviceId !== device.deviceId) {
        const nameEl = tile.querySelector('.tile-name');
        if (nameEl) nameEl.textContent = device.name || `Device ${device.deviceId}`;
    }

    const hrEl = tile.querySelector('.tile-hr-value');
    if (hrEl) hrEl.textContent = device.hr != null ? device.hr : '--';

    const trendEl = tile.querySelector('.tile-trend');
    if (trendEl) {
        const ICONS = { rising: '↑', falling: '↓', stable: '→', unknown: '·' };
        const state = getTrend(device.deviceId);
        trendEl.textContent = ICONS[state];
        trendEl.className = `tile-trend tile-trend--${state}`;
    }

    // Update compliance badge
    const badgeEl = tile.querySelector('.tile-compliance-badge');
    if (badgeEl) {
        const compliance = targetZoneNum !== null ? getCompliance(zone) : null;
        const show = compliance && compliance !== 'unknown';
        badgeEl.hidden = !show;
        badgeEl.textContent = show ? COMPLIANCE_TEXT[compliance] : '';
        badgeEl.className = compliance
            ? `tile-compliance-badge compliance-badge--${compliance}`
            : 'tile-compliance-badge';
    }

    // Zone label: zone name in identity mode, hidden in compliance mode
    const zoneLabelEl = tile.querySelector('.tile-zone-label');
    if (zoneLabelEl) {
        if (targetZoneNum === null && zone) {
            zoneLabelEl.textContent = zone.label;
            zoneLabelEl.className = `tile-zone-label zone-label--z${zone.cssIdx}`;
        } else {
            zoneLabelEl.textContent = '';
            zoneLabelEl.className = 'tile-zone-label';
        }
    }

    const staleLabel = tile.querySelector('.tile-stale-label');
    if (staleLabel) staleLabel.textContent = isStale ? 'No signal' : '';

    const metaBattery = tile.querySelector('.meta-battery');
    if (metaBattery) {
        const bt = batteryText(device);
        metaBattery.hidden = (bt === 'Unknown');
        if (!metaBattery.hidden) {
            metaBattery.innerHTML = `<span class="meta-label">Battery</span> ${escHtml(bt)}`;
        }
    }

    // Guard max HR field while it is being edited
    if (editingMaxHrDeviceId !== device.deviceId) {
        const maxHrVal = tile.querySelector('.meta-maxhr-value');
        if (maxHrVal) maxHrVal.textContent = device.maxHr ? String(device.maxHr) : 'Set';
    }

    updateMaxHrBanner(tile, device);
}

// ── Max HR exceedance banner ──────────────────────────────────────────────────
function updateMaxHrBanner(tile, device) {
    const banner = tile.querySelector('.tile-maxhr-alert');
    if (!banner) return;

    // Hide if: no maxHr set, no HR reading, within bounds, or currently editing
    if (!device.maxHr || !device.hr || device.hr <= device.maxHr
        || editingMaxHrDeviceId === device.deviceId) {
        banner.hidden = true;
        banner.innerHTML = '';
        delete banner.dataset.proposed;
        return;
    }

    // Already showing this exact proposed value — don't recreate the button
    if (parseInt(banner.dataset.proposed || '0', 10) === device.hr) return;

    banner.dataset.proposed = device.hr;
    banner.hidden = false;
    banner.innerHTML = `
        <span class="maxhr-alert-text">&#9888; ${escHtml(String(device.hr))} bpm exceeds max HR (${escHtml(String(device.maxHr))})</span>
        <button class="maxhr-alert-btn">Update to ${escHtml(String(device.hr))}</button>
    `;
    banner.querySelector('.maxhr-alert-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const newMax = device.hr;
        saveMaxHr(device.deviceId, newMax);
        banner.hidden = true;
        banner.innerHTML = '';
        delete banner.dataset.proposed;
        const maxHrVal = tile.querySelector('.meta-maxhr-value');
        if (maxHrVal) maxHrVal.textContent = String(newMax);
    });
}

function tileHTML(device) {
    const isStale = Date.now() - device.lastSeen > STALE_MS;
    const displayName = device.name || `Device ${device.deviceId}`;
    const hr = device.hr != null ? device.hr : '--';
    const zone = getZone(device.hr, device.maxHr);
    const maxHrDisplay = device.maxHr ? String(device.maxHr) : 'Set';

    // Compliance badge (shown when target zone active, hidden otherwise)
    const compliance = targetZoneNum !== null ? getCompliance(zone) : null;
    const badgeText = compliance ? COMPLIANCE_TEXT[compliance] : '';
    const badgeClass = compliance ? `tile-compliance-badge compliance-badge--${compliance}` : 'tile-compliance-badge';
    const badgeHidden = !compliance || compliance === 'unknown';

    // Zone label: zone name in identity mode, hidden in compliance mode (badge takes over)
    const zoneLabelText = targetZoneNum === null && zone !== null ? zone.label : '';
    const zoneLabelClass = targetZoneNum === null && zone !== null
        ? `tile-zone-label zone-label--z${zone.cssIdx}` : 'tile-zone-label';

    // C (Copywriting): only show battery if we have a real reading
    const bt = batteryText(device);
    const batteryHTML = bt !== 'Unknown'
        ? `<span class="meta-item meta-battery"><span class="meta-label">Battery</span> ${escHtml(bt)}</span>`
        : `<span class="meta-item meta-battery" hidden></span>`;

    return `
    <div class="tile-name-row">
      <span class="tile-name" title="Click to rename">${escHtml(displayName)}</span>
      <span class="tile-signal">${signalHTML(device.lastSeen, device.rssi)}</span>
    </div>
    <div class="${badgeClass}"${badgeHidden ? ' hidden' : ''}>${escHtml(badgeText)}</div>
    <div class="tile-hr">
      <div class="tile-hr-body">
        <span class="tile-hr-label">&#9829; bpm</span>
        <div class="tile-hr-row">
          <span class="tile-hr-value">${hr}</span>
          ${trendHTML(device.deviceId)}
        </div>
      </div>
    </div>
    <div class="${zoneLabelClass}">${escHtml(zoneLabelText)}</div>
    <span class="tile-stale-label">${isStale ? 'No signal' : ''}</span>
    <div class="tile-maxhr-alert" hidden></div>
    <div class="tile-meta">
      <span class="meta-item"><span class="meta-label">ID</span> ${escHtml(String(device.deviceId))}</span>
      ${batteryHTML}
      <span class="meta-item meta-maxhr"><span class="meta-label">Max HR</span> <span class="meta-maxhr-value" title="Click to set">${escHtml(maxHrDisplay)}</span></span>
    </div>
  `;
}

function bindTileEvents(tile, device) {
    tile.addEventListener('click', (e) => {
        if (e.target.closest('.tile-name')) {
            const nameEl = tile.querySelector('.tile-name');
            if (!nameEl) return;
            startNameEdit(tile, device.deviceId, nameEl.textContent);
        }
    });

    // Use mousedown for Max HR editing so we can preventDefault and avoid
    // the blur-before-focus race that happens with click + replaceWith.
    tile.addEventListener('mousedown', (e) => {
        const valueEl = e.target.closest('.meta-maxhr-value');
        if (!valueEl) return;
        e.preventDefault(); // prevents blur firing on currently-focused element
        if (editingMaxHrDeviceId === device.deviceId) return;
        const current = devices.find((d) => d.deviceId === device.deviceId);
        startMaxHrEdit(tile, device.deviceId, current ? current.maxHr : null);
    });
}

// ── Name editing ──────────────────────────────────────────────────────────────
function startNameEdit(tile, deviceId, currentName) {
    editingDeviceId = deviceId;
    const nameEl = tile.querySelector('.tile-name');
    if (!nameEl) return;

    const input = document.createElement('input');
    input.className = 'tile-name-input';
    const defaultName = currentName.startsWith('Device ') ? '' : currentName;
    input.value = defaultName;
    input.placeholder = `Device ${deviceId}`;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    function commit() {
        editingDeviceId = null;
        const newName = input.value.trim();
        saveName(deviceId, newName);
        // Replace input back with span immediately (server broadcast will update)
        const span = document.createElement('span');
        span.className = 'tile-name';
        span.title = 'Click to rename';
        span.textContent = newName || `Device ${deviceId}`;
        input.replaceWith(span);
        // Re-bind click
        tile.addEventListener('click', (e) => {
            if (!e.target.closest('.tile-name')) return;
            startNameEdit(tile, deviceId, span.textContent);
        });
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            editingDeviceId = null;
            const span = document.createElement('span');
            span.className = 'tile-name';
            span.title = 'Click to rename';
            span.textContent = currentName;
            input.replaceWith(span);
        }
    });
}

function saveName(deviceId, name) {
    fetch(`/api/devices/${encodeURIComponent(deviceId)}/name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
    }).catch(console.error);
}

// ── Max HR editing ───────────────────────────────────────────────────────────
function startMaxHrEdit(tile, deviceId, currentMaxHr) {
    editingMaxHrDeviceId = deviceId;
    const valueEl = tile.querySelector('.meta-maxhr-value');
    if (!valueEl) return;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'meta-maxhr-input';
    input.value = currentMaxHr || '';
    input.placeholder = '185';
    input.min = '100';
    input.max = '250';
    valueEl.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    function commit() {
        if (committed) return;
        committed = true;
        editingMaxHrDeviceId = null;
        const parsed = parseInt(input.value, 10);
        const newMaxHr = (parsed >= 100 && parsed <= 250) ? parsed : null;
        saveMaxHr(deviceId, newMaxHr);
        const span = document.createElement('span');
        span.className = 'meta-maxhr-value';
        span.title = 'Click to set';
        span.textContent = newMaxHr ? String(newMaxHr) : 'Set';
        if (input.isConnected) input.replaceWith(span);
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            committed = true; // prevent blur from committing
            editingMaxHrDeviceId = null;
            const span = document.createElement('span');
            span.className = 'meta-maxhr-value';
            span.title = 'Click to set';
            span.textContent = currentMaxHr ? String(currentMaxHr) : 'Set';
            if (input.isConnected) input.replaceWith(span);
        }
    });
}

function saveMaxHr(deviceId, maxHr) {
    fetch(`/api/devices/${encodeURIComponent(deviceId)}/maxhr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxHr }),
    }).catch(console.error);
}

// ── Battery display ───────────────────────────────────────────────────────────
// Show "85% · Good" if level is available, otherwise just the status, or "Unknown".
function batteryText(device) {
    const level = device.batteryLevel;
    const status = device.battery;
    if (level != null && status) return `${level}% · ${status}`;
    if (level != null) return `${level}%`;
    if (status) return status;
    return 'Unknown';
}

// ── Zone logic ────────────────────────────────────────────────────────────────
// Returns { cssIdx, zoneNum, label } or null.
// cssIdx maps to existing zone--zN CSS classes.
// zoneNum is the display-facing zone number for target comparison.
function getZone(hr, maxHr) {
    if (!hr || !maxHr) return null;
    const pct = hr / maxHr;
    if (zoneModel === 'phlex') {
        // Phlex 4-zone model (thresholds: Aerobic ~70%, Anaerobic ~90%; Z0 below 50%)
        if (pct >= 0.90) return { cssIdx: 5, zoneNum: 3, label: 'Zone 3 · High Intensity' };
        if (pct >= 0.70) return { cssIdx: 3, zoneNum: 2, label: 'Zone 2 · Threshold' };
        if (pct >= 0.50) return { cssIdx: 1, zoneNum: 1, label: 'Zone 1 · Aerobic Base' };
        return { cssIdx: 0, zoneNum: 0, label: 'Zone 0 · Rest' };
    } else {
        // Classic 6-zone model
        if (pct >= 0.90) return { cssIdx: 5, zoneNum: 5, label: 'Zone 5 · Max Effort' };
        if (pct >= 0.80) return { cssIdx: 4, zoneNum: 4, label: 'Zone 4 · Threshold' };
        if (pct >= 0.70) return { cssIdx: 3, zoneNum: 3, label: 'Zone 3 · Tempo' };
        if (pct >= 0.60) return { cssIdx: 2, zoneNum: 2, label: 'Zone 2 · Base' };
        if (pct >= 0.50) return { cssIdx: 1, zoneNum: 1, label: 'Zone 1 · Recovery' };
        return { cssIdx: 0, zoneNum: 0, label: 'Zone 0 · Rest' };
    }
}

function setZoneModel(model) {
    zoneModel = model;
    localStorage.setItem('zoneModel', model);
    document.body.dataset.zoneModel = model;
    document.querySelectorAll('.zone-toggle-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.model === model);
    });
    clearTargetZone();
    renderTargetZonePicker();
    render();
}

function renderTargetZonePicker() {
    const picker = document.getElementById('target-zone-picker');
    if (!picker) return;
    const zoneCount = zoneModel === 'phlex' ? 4 : 6; // Z0–Z3 or Z0–Z5
    const buttons = [];

    // Off button
    const offBtn = document.createElement('button');
    offBtn.className = 'zone-toggle-btn' + (targetZoneNum === null ? ' active' : '');
    offBtn.textContent = 'Off';
    offBtn.onclick = () => setTargetZone(null);
    buttons.push(offBtn);

    // One button per zone
    for (let i = 0; i < zoneCount; i++) {
        const btn = document.createElement('button');
        btn.className = 'zone-toggle-btn' + (targetZoneNum === i ? ' active' : '');
        btn.textContent = `Z${i}`;
        btn.onclick = () => setTargetZone(i);
        buttons.push(btn);
    }

    picker.replaceChildren(...buttons);
}

function updateTileZone(tile, zone) {
    tile.classList.remove('zone--z0', 'zone--z1', 'zone--z2', 'zone--z3', 'zone--z4', 'zone--z5');
    tile.classList.remove('compliance--on-target', 'compliance--above', 'compliance--below', 'compliance--unknown');
    if (targetZoneNum !== null) {
        const compliance = getCompliance(zone);
        if (compliance) tile.classList.add(`compliance--${compliance}`);
    } else if (zone !== null) {
        tile.classList.add(`zone--z${zone.cssIdx}`);
    }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
