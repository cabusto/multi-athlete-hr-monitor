'use strict';

const Ant = require('ant-plus');
const deviceState = require('../state/deviceState');

const STARTUP_TIMEOUT_MS = 5000;

function attachScanner(stick, onDongleStatus) {
    const scanner = new Ant.HeartRateScanner(stick);

    scanner.on('hbData', (data) => {
        deviceState.upsert(data.DeviceID, {
            hr: data.ComputedHeartRate,
            deviceType: 'Heart Rate',
            battery: data.BatteryStatus || null,
            batteryLevel: (typeof data.BatteryLevel === 'number') ? data.BatteryLevel : null,
            rssi: (typeof data.Rssi === 'number') ? data.Rssi : null,
        });
    });

    // If startup doesn't fire within the timeout, the USB device is likely
    // held by a previous process (common on macOS). Report and advise replug.
    const startupTimer = setTimeout(() => {
        console.warn('[ANT+] Stick opened but startup timed out. Try unplugging and replugging the dongle.');
        onDongleStatus(false, 'ANT+ dongle not responding. Unplug, replug, and restart.');
    }, STARTUP_TIMEOUT_MS);

    stick.on('startup', () => {
        clearTimeout(startupTimer);
        console.log('[ANT+] Stick startup OK — scanning...');
        onDongleStatus(true);
        scanner.scan();
    });

    stick.on('shutdown', () => {
        clearTimeout(startupTimer);
        onDongleStatus(false, 'ANT+ dongle disconnected');
    });
}

function tryOpen(StickClass, onDongleStatus) {
    let stick;
    try {
        stick = new StickClass();
    } catch (err) {
        console.warn(`[ANT+] Could not construct ${StickClass.name}:`, err.message);
        return false;
    }

    const opened = stick.open();
    console.log(`[ANT+] ${StickClass.name}.open() →`, opened);
    if (!opened) return false;

    attachScanner(stick, onDongleStatus);
    return true;
}

function start(onDongleStatus) {
    // Try GarminStick3 (mini, USB PID 0x1009) first, then GarminStick2 (0x1008)
    if (tryOpen(Ant.GarminStick3, onDongleStatus)) return;
    if (tryOpen(Ant.GarminStick2, onDongleStatus)) return;

    onDongleStatus(false, 'ANT+ dongle not found. Plug in the USB dongle and restart.');
}

module.exports = { start };
