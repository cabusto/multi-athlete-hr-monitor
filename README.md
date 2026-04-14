# Multi-Athlete HR Monitor

A coach-facing web dashboard that receives live heart rate broadcasts from ANT+ devices via a USB ANT+ dongle and displays them in real time.

Up to 8 athletes are displayed simultaneously with zone coloring, HR trend arrows, signal strength, and a compliance mode for targeting a specific training zone.

---

## Requirements

- **Node.js** v18 or later (tested on v22)
- **A USB ANT+ dongle** — Garmin USB stick (mini or standard). Both GarminStick3 (PID 0x1009) and GarminStick2 (PID 0x1008) are supported.
- **Athletes wearing ANT+ heart rate monitors** with broadcast mode enabled (standard for Garmin HRM straps)

### macOS USB access

On macOS, `libusb` (used by the `ant-plus` library) requires access to the USB device. No additional drivers are needed but you may need to grant your terminal full disk access, or run with `sudo` if the dongle is not detected.

If the server starts but shows "Stick startup timed out", **unplug and replug the dongle** while the server is running.

---

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/cabusto/multi-athlete-hr-monitor
cd multi-athlete-hr-monitor

# 2. Install dependencies
npm install

# 3. Plug in your ANT+ USB dongle

# 4. Start the server
npm start
```

Then open **http://localhost:3000** in a browser.

---

## Usage

### Dashboard

- Each connected ANT+ HR device appears as a tile automatically — no pairing required
- **Click an athlete's name** to rename them (persisted across restarts)
- **Click "Set"** next to Max HR to enter an athlete's max heart rate — enables zone coloring and % max HR display

### Zone model

Use the **Zone Model** toggle in the header to switch between:

| Model | Zones | Thresholds |
|---|---|---|
| **6-Zone** | Z0 (Rest) → Z5 (Max Effort) | 50 / 60 / 70 / 80 / 90% max HR |
| **Phlex 4-Zone** | Z0 (Rest) → Z3 (High Intensity) | 50 / 70 / 90% max HR |

### Target Zone (compliance mode)

Select a zone with the **Target Zone** picker to switch all tiles into compliance mode:

| Color | Meaning |
|---|---|
| 🟢 Green | Athlete is in the target zone |
| 🔴 Red + "↑ Too High" | Athlete is above the target zone |
| 🔵 Blue + "↓ Too Low" | Athlete is below the target zone |

Select **Off** to return to standard zone identity coloring.

### Tile reordering

Tiles can be **dragged and dropped** to rearrange the grid. Order is saved and restored on page reload.

### HR trend

The arrow next to the BPM reading shows the 10-second HR trend:

| Arrow | Meaning |
|---|---|
| ↑ | Rising (avg HR increased ≥ 2 bpm in last 5s vs prior 5s) |
| → | Stable |
| ↓ | Falling |
| · | Not enough data yet |

---

## Configuration

| Option | How to change |
|---|---|
| Port | Set the `PORT` environment variable (default: `3000`) |
| Athlete names & max HR | Click to edit in the UI — saved to `device-mappings.json` |

The `device-mappings.json` file is created automatically at the project root on first use. It is gitignored and safe to delete to reset all athlete assignments.

---

## Troubleshooting

**Dongle not detected at startup**
- Ensure the dongle is plugged in before running `npm start`
- If prompted, try running with `sudo npm start` on macOS to allow USB access

**"Stick startup timed out"**
- Unplug and replug the dongle — macOS sometimes holds a libusb lock from a previous process

**No athletes appearing**
- Ensure athletes have their Garmin HRM strap powered on and in broadcast mode (standard behavior when worn)
- The dongle passively scans — no pairing or configuration required on the device side

**Tiles not updating**
- Check the browser console for WebSocket errors
- Confirm the server is still running in the terminal

---

## Project structure

```
src/
  index.js              Express + WebSocket server entry point
  receiver/
    antReceiver.js      ANT+ USB dongle interface (ant-plus)
  state/
    deviceState.js      In-memory device state, emits change events
  storage/
    mappings.js         Persists athlete name + max HR to device-mappings.json
  routes/
    api.js              REST API (/api/devices, /api/devices/:id/name, /api/devices/:id/maxhr)
public/
  index.html            Single-page shell
  app.js                Frontend — WebSocket client, tile rendering, zone logic
  style.css             All styles
```
