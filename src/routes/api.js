'use strict';

const express = require('express');
const router = express.Router();
const deviceState = require('../state/deviceState');

// GET /api/devices — return current snapshot of all known devices
router.get('/devices', (req, res) => {
    res.json(deviceState.getAll());
});

// POST /api/devices/:id/name — assign or update athlete name for a device
router.post('/devices/:id/name', express.json(), (req, res) => {
    const deviceId = req.params.id;
    const { name } = req.body;

    if (typeof name !== 'string') {
        return res.status(400).json({ error: 'name must be a string' });
    }

    deviceState.setName(deviceId, name);
    res.json({ ok: true, deviceId, name: name.trim() || null });
});

// POST /api/devices/:id/maxhr — set max heart rate for zone calculations
router.post('/devices/:id/maxhr', express.json(), (req, res) => {
    const deviceId = req.params.id;
    const { maxHr } = req.body;

    if (maxHr !== null && maxHr !== undefined && (typeof maxHr !== 'number' || maxHr < 100 || maxHr > 250)) {
        return res.status(400).json({ error: 'maxHr must be a number between 100 and 250, or null' });
    }

    deviceState.setMaxHr(deviceId, maxHr ?? null);
    res.json({ ok: true, deviceId, maxHr: maxHr || null });
});

module.exports = router;
