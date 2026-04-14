'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const deviceState = require('./state/deviceState');
const apiRoutes = require('./routes/api');
const antReceiver = require('./receiver/antReceiver');

const PORT = process.env.PORT || 3000;
const app = express();

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', apiRoutes);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Track dongle status
let dongleConnected = false;

function broadcast(payload) {
    const msg = JSON.stringify(payload);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// When device state changes, push full update to all clients
deviceState.onchange(() => {
    broadcast({
        type: 'update',
        dongleConnected,
        devices: deviceState.getAll(),
    });
});

// Send current state when a new client connects
wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
        type: 'update',
        dongleConnected,
        devices: deviceState.getAll(),
    }));
});

// Start ANT+ receiver
antReceiver.start((connected, message) => {
    dongleConnected = connected;
    broadcast({
        type: 'dongle',
        dongleConnected,
        message: message || null,
    });
    if (!connected) {
        console.warn('[ANT+]', message || 'Dongle disconnected');
    } else {
        console.log('[ANT+] Dongle connected, scanning for HR devices...');
    }
});

server.listen(PORT, () => {
    console.log(`Multi-Athlete HR Monitor running at http://localhost:${PORT}`);
});
