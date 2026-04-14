'use strict';

const fs = require('fs');
const path = require('path');

const MAPPINGS_FILE = path.join(__dirname, '../../device-mappings.json');

function load() {
    try {
        const raw = fs.readFileSync(MAPPINGS_FILE, 'utf8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function save(map) {
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(map, null, 2), 'utf8');
}

// Normalize an entry to { name, maxHr } regardless of whether it was stored as
// a plain string (legacy) or an object (current format).
function _entry(raw) {
    if (!raw) return { name: null, maxHr: null };
    if (typeof raw === 'string') return { name: raw, maxHr: null };
    return {
        name: raw.name || null,
        maxHr: (typeof raw.maxHr === 'number' && raw.maxHr >= 100 && raw.maxHr <= 250) ? raw.maxHr : null,
    };
}

function setName(deviceId, name) {
    const map = load();
    const key = String(deviceId);
    const existing = _entry(map[key]);
    const trimmed = name && name.trim() ? name.trim() : null;
    if (!trimmed && !existing.maxHr) {
        delete map[key];
    } else {
        map[key] = { ...existing, name: trimmed };
    }
    save(map);
    return map;
}

function setMaxHr(deviceId, maxHr) {
    const map = load();
    const key = String(deviceId);
    const existing = _entry(map[key]);
    const validated = (typeof maxHr === 'number' && maxHr >= 100 && maxHr <= 250) ? maxHr : null;
    if (!existing.name && !validated) {
        delete map[key];
    } else {
        map[key] = { ...existing, maxHr: validated };
    }
    save(map);
    return map;
}

function getName(deviceId) {
    const map = load();
    return _entry(map[String(deviceId)]).name;
}

function getMaxHr(deviceId) {
    const map = load();
    return _entry(map[String(deviceId)]).maxHr;
}

module.exports = { load, save, setName, setMaxHr, getName, getMaxHr };
