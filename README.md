<p align="center">
<img width="536" height="84" alt="obraz" src="https://github.com/user-attachments/assets/ef099d79-3296-41ed-827a-5446145d99ae" />
  <br>
  <em>Synchronous cognitive testing and real-time prefrontal blood oxygenation monitoring.</em>
</p>

---

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-ES2022-646CFF.svg)](https://vitejs.dev/)
[![fNIRS](https://img.shields.io/badge/fNIRS-Cortivision_C20-blue.svg)](https://cortivision.com/)

This repository contains **COGNIRS**, a browser-based software application designed for synchronous cognitive testing and **functional near-infrared spectroscopy (fNIRS)** recording. Built using Vanilla JavaScript (ES2022 modules) and Vite, the platform delivers a battery of standardized executive function tests while streaming time-locked optical brain oxygenation data from a **Cortivision PHOTON Cap C20** device.

---

## Getting Started

### Requirements
Ensure your environment meets the following specifications:
- **Node.js**: `v18.0.0` or higher
- **Browser**: Google Chrome, Microsoft Edge, or Chromium-based equivalent
- **Device setup**: Cortivision PHOTON Cap C20 connected via Bluetooth with **CortiView 2** streaming locally

### Installation & Local Setup

```bash
# Clone repository
git clone https://github.com/BinaryWiz4rd/cognirs-dashboard.git
cd cognirs

# Install dependencies
npm install

# Start local development server
npm run dev
