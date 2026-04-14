'use strict';

const EventEmitter = require('events');
const mappings = require('../storage/mappings');

// Map of deviceId (string) → { deviceId, name, hr, deviceType, battery, lastSeen }
const devices = new Map();
const emitter = new EventEmitter();

function upsert(deviceId, data) {
    const key = String(deviceId);
    const existing = devices.get(key) || { deviceId: key };
    const name = mappings.getName(key) || existing.name || null;
    const maxHr = mappings.getMaxHr(key) || existing.maxHr || null;

    const updated = {
        ...existing,
        ...data,
        deviceId: key,
        name,
        maxHr,
        lastSeen: Date.now(),
    };

    devices.set(key, updated);
    emitter.emit('change');
}

function getAll() {
    return Array.from(devices.values()).map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        hr: d.hr ?? null,
        deviceType: d.deviceType || 'Heart Rate',
        battery: d.battery || null,
        batteryLevel: d.batteryLevel ?? null,
        rssi: d.rssi ?? null,
        lastSeen: d.lastSeen,
        maxHr: d.maxHr || null,
    }));
}

function setName(deviceId, name) {
    const key = String(deviceId);
    mappings.setName(key, name);
    if (devices.has(key)) {
        const d = devices.get(key);
        devices.set(key, { ...d, name: name && name.trim() ? name.trim() : null });
        emitter.emit('change');
    }
}

function setMaxHr(deviceId, maxHr) {
    const key = String(deviceId);
    mappings.setMaxHr(key, maxHr);
    const validated = (typeof maxHr === 'number' && maxHr >= 100 && maxHr <= 250) ? maxHr : null;
    if (devices.has(key)) {
        const d = devices.get(key);
        devices.set(key, { ...d, maxHr: validated });
        emitter.emit('change');
    }
}

function onchange(fn) {
    emitter.on('change', fn);
}

module.exports = { upsert, getAll, setName, setMaxHr, onchange };
