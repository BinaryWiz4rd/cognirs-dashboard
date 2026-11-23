<p align="center">
  <img width="536" height="84" alt="COGNIRS" src="assets/cognirs-banner.svg" />
  <br>
  <em>Synchronous cognitive testing and real-time prefrontal blood oxygenation monitoring.</em>
</p>

<p align="center">
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript"><img src="https://img.shields.io/badge/JavaScript_ES2022-0d1117?style=flat-square&logo=javascript&logoColor=93c5fd" alt="JavaScript ES2022" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite-0d1117?style=flat-square&logo=vite&logoColor=93c5fd" alt="Vite" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-0d1117?style=flat-square&logo=python&logoColor=93c5fd" alt="Python" /></a>
  <a href="https://cortivision.com/"><img src="https://img.shields.io/badge/fNIRS-Cortivision_C20-0d1117?style=flat-square" alt="Cortivision C20" /></a>
</p>

**COGNIRS** is a browser-based cognitive testing platform paired with real-time **fNIRS** recording. It runs a battery of executive function tasks while streaming time-locked `HbO` and `HbR` concentration data from a Cortivision PHOTON Cap C20 or a built-in 50 Hz simulator.

> This project is still in development.

## Getting started

You need **Node.js 18+** and a Chromium-based browser (Chrome, Edge, or Brave).

1. Clone the repository and open the folder:
   ```bash
   git clone https://github.com/BinaryWiz4rd/cognirs-dashboard.git
   cd cognirs-dashboard
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser (Vite usually opens it automatically).

> **Linux USB serial note:** If you connect a device via WebSerial and get a permission error on `/dev/ttyUSB0` or `/dev/ttyACM0`, add your user to the serial group (`sudo usermod -aG dialout $USER` on Debian/Ubuntu, or `uucp` on Arch/Fedora) and log back in.

### Production build

To build and preview the static bundle locally:

```bash
npm run build
npm run preview
```

## Running a session

1. Open **New session** from the top bar or home screen.
2. Fill in the participant ID, age, and group (`Neurotypical control` or `ADHD`).
3. Under **fNIRS device**, pick a source and click **Connect stream**:
   - **Cortivision (WebSocket)** — connects to `ws://127.0.0.1:5732` when the headset stream is active.
   - **50 Hz Simulator (Offline)** — generates synthetic 8-channel `HbO`/`HbR` data so you can run and test everything without hardware.
   - **WebSerial COM Port** — connects directly to a serial fNIRS device over USB.
4. Check the tasks you want to include in the battery and click **Begin session**.
5. When the battery finishes, the **Results** page shows per-task metrics and lets you download:
   - Behavioral trial data (`.csv`)
   - Timestamped `HbO`/`HbR` samples with task markers (`.csv`)
   - Full session dump (`.json`)

## Included tasks

- **Attention & inhibition:** Stroop Color–Word, Go / No-Go, Continuous Performance Test (`CPT-AX`)
- **Working memory:** N-Back (`0-Back`, `1-Back`, `2-Back`), Digit Span (`Forward`, `Backward`)
- **Executive function:** Trail Making Test (`Part A`, `Part B`), Reaction Time (`Simple`, `Choice`)

## Documentation

For the LSL-to-WebSocket bridge setup, clock synchronization, binary packet format, and export schemas, see [docs/TECHNICAL.md](docs/TECHNICAL.md).

---

