# COGNIRS: technical documentation

Notes for the fNIRS streaming bridge, browser acquisition adapters, clock alignment, cognitive task parameters, metrics, and data exports. Basic setup and running the frontend are described in `README.md` in the repo root. This file covers how the system works internally.

## 1. Repository layout

```text
cognirs-dashboard/
├── docs/
│   └── TECHNICAL.md               # this file
├── scripts/
│   ├── lsl_bridge.py              # LSL-to-WebSocket bridge for CortiView 2
│   └── requirements.txt           # Python dependencies (pylsl, websockets)
├── src/
│   ├── core/
│   │   ├── EventBus.js            # pub/sub event bus
│   │   ├── Logger.js              # scoped console logger
│   │   └── StateManager.js        # reactive application state store
│   ├── fnirs/
│   │   ├── CortivisionAdapter.js  # WebSocket client + clock offset smoother
│   │   ├── FNIRSAdapter.js        # WebSerial reader + 50 Hz simulator
│   │   ├── FNIRSDevice.js         # transport controller + reconnect handling
│   │   ├── FNIRSParser.js         # 16-byte binary serial packet decoder
│   │   └── FNIRSRecorder.js       # monotonic timeline + event marker recorder
│   ├── session/
│   │   ├── SessionManager.js      # participant session & test queue runner
│   │   └── SessionExporter.js     # JSON, behavioral CSV, and fNIRS CSV builder
│   ├── tests/
│   │   ├── BaseTest.js            # 3-phase lifecycle (instructions, demo, test)
│   │   ├── ContinuousPerformanceTest.js
│   │   ├── DigitSpanTest.js
│   │   ├── GoNoGoTest.js
│   │   ├── NBackTest.js
│   │   ├── ReactionTimeTest.js
│   │   ├── StroopTest.js
│   │   └── TrailMakingTest.js
│   ├── ui/
│   │   ├── components/            # Header, StatusBar, Toast
│   │   └── pages/                 # HomePage, SetupPage, ResultsPage
│   ├── utils/
│   │   ├── DataUtils.js           # mean, std, median, movingAverage, normalize
│   │   ├── Random.js              # seeded Park-Miller LCG
│   │   └── Timer.js               # performance.now() wrapper
│   ├── main.js                    # bootstrap
│   └── router.js                  # view router + active-session abort guard
├── index.html
├── package.json
└── vite.config.js
```

## 2. LSL-to-WebSocket bridge (`scripts/lsl_bridge.py`)

Browsers cannot open Lab Streaming Layer (LSL) sockets directly because `liblsl` is a native C/C++ library. `scripts/lsl_bridge.py` resolves the LSL concentration stream published by **CortiView 2** (Cortivision PHOTON Cap C20) and forwards normalized JSON channel frames to the browser over a local WebSocket (`ws://127.0.0.1:5732` by default).

```text
Cortivision Cap C20 --(BT / Wi-Fi)--> CortiView 2 --(LSL)--> lsl_bridge.py --(ws://127.0.0.1:5732)--> Browser
```

### Python environment (needed when using LSL)

Python 3.10–3.12 is used (`pylsl` wheels are required).

**Windows (PowerShell):**

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r scripts/requirements.txt
python scripts/lsl_bridge.py
```

**Linux (Bash):**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r scripts/requirements.txt
python scripts/lsl_bridge.py
```

### CLI flags

| flag | default | description |
|---|---|---|
| `--host` | `127.0.0.1` | WebSocket bind address |
| `--port` | `5732` | WebSocket port |
| `--stream-name` | `None` | Exact LSL stream name; if omitted, searches by `--stream-type` first, then falls back to stream names containing `corti`, `fnirs`, `nirs`, or `photon` |
| `--stream-type` | `NIRS` | LSL stream type passed to `resolve_byprop` |
| `--simulate` | `False` | Streams synthetic $50\text{ Hz}$ 8-channel $\text{HbO}/\text{HbR}$ frames over WebSocket without `pylsl` or hardware |

### Channel layout & stream behavior

* `parse_channel_layout()` inspects the LSL XML descriptor (`info.desc().child("channels")`) and matches `hbo`/`oxy` and `hbr`/`deoxy` tokens in each channel's `label` and `type` fields to group them into logical channels $0 \dots N-1$. If XML descriptors are absent, it falls back to interleaved pairs `[HbO_0, HbR_0, HbO_1, HbR_1, ...]`.
* `inlet.pull_chunk(timeout=0.0)` is polled every $10\text{ ms}$ ($100\text{ Hz}$). LSL timestamps (`pylsl.local_clock()`) are anchored once at startup to Unix epoch milliseconds via `clock_offset_s = time.time() - local_clock()` to avoid OS wall-clock NTP step jumps mid-run.
* Non-finite values (`NaN`, `Inf`) are filtered out in `build_sample_frames()` before broadcasting.
* If no LSL stream is found, the bridge retries every $2.0\text{ s}$. If an active stream drops, it closes the inlet and retries after $1.0\text{ s}$ while keeping connected browser WebSocket clients open.

## 3. Browser fNIRS layer (`src/fnirs/`)

All three transports feed into `FNIRSDevice` (`src/fnirs/FNIRSDevice.js`), which owns the active adapter and forwards samples into `FNIRSRecorder` (`src/fnirs/FNIRSRecorder.js`).

| mode | adapter | transport | sample rate | channels |
|---|---|---|---|---|
| `cortivision` | `CortivisionAdapter.js` | WebSocket (`ws://127.0.0.1:5732`) | Device / LSL rate | Dynamic (C20 montage) |
| `simulator` | `FNIRSAdapter.js` | In-browser `setInterval` ($20\text{ ms}$) | $50\text{ Hz}$ | 8 ($0\text{--}7$) |
| `serial` | `FNIRSAdapter.js` + `FNIRSParser.js` | WebSerial ($115200\text{ baud}$) | Device rate | 8 ($0\text{--}7$) |

### Clock synchronization (`CortivisionAdapter.js`)

Behavioral trial events and fNIRS samples share a single monotonic clock without OS wall-clock jumps or WebSocket batching jitter:

1. When a WebSocket message arrives, `batchReceivedAt = performance.now()` is recorded immediately.
2. `CortivisionAdapter` computes `candidateOffset = batchReceivedAt - maxDeviceTs` and updates `_streamOffsetMs` with an exponential moving average ($\alpha = 0.1$, resetting immediately if $|\Delta| > 1000\text{ ms}$).
3. Each sample's arrival time is computed as `rawTs + _streamOffsetMs` and clamped with `Math.max(estimatedPerf, _lastReceivedAt)` so timestamps remain strictly non-decreasing across batched chunks.
4. Frames with missing or non-finite `hbo`, `hbr`, or non-integer `channel` fields are discarded.
5. `connect()` enforces a $5000\text{ ms}$ handshake timeout (`DEFAULT_CONNECT_TIMEOUT_MS`) and guards socket callbacks against stale socket instances if `disconnect()` and `connect()` are called back-to-back.

### Binary WebSerial packet format (`FNIRSParser.js`)

Used in `serial` mode when reading raw bytes from `navigator.serial`. Fixed **16-byte** little-endian packets:

| byte offset | size | field | notes |
|---|---|---|---|
| `0` | $1\text{ B}$ | Sync byte | Must be `0xAA` |
| `1` | $1\text{ B}$ | Packet length | Must be `16` (`0x10`) |
| `2..5` | $4\text{ B}$ | `timestamp` | `uint32` little-endian, device $\text{ms}$ |
| `6..9` | $4\text{ B}$ | `hbo` | `float32` little-endian ($\mu\text{mol/L}$) |
| `10..13` | $4\text{ B}$ | `hbr` | `float32` little-endian ($\mu\text{mol/L}$) |
| `14` | $1\text{ B}$ | `channel` | `uint8` channel index ($0\text{--}7$) |
| `15` | $1\text{ B}$ | Checksum | $(\sum_{i=0}^{14} \text{byte}_i) \bmod 256$ |

On a length or checksum mismatch, `FNIRSParser` discards 1 byte and scans forward for the next `0xAA`. Its internal accumulation buffer is capped at **65,536 bytes ($64\text{ KB}$)**.

### Timeline recording & reconnect handling (`FNIRSRecorder.js`)

* `FNIRSRecorder.start()` records `_startPerfTime = performance.now()` and subscribes to `TEST_STARTED`, `TEST_ENDED`, `TEST_TRIAL_START`, and `TEST_TRIAL_END` on `eventBus`.
* Every ingested sample is stamped with `relativeTime = +(sample.receivedAt - _startPerfTime).toFixed(3)` ($\text{ms}$ since recording start).
* Every task/trial event is stored as a marker with `relativeTime` on the same timeline.
* If the fNIRS connection drops unexpectedly while a session is recording (`code !== 1000`), `FNIRSDevice._onClose()` inserts a `MANUAL` marker (`STREAM_INTERRUPTED`), emits `EVENTS.FNIRS_STREAM_INTERRUPTED`, and keeps `FNIRSRecorder` armed. Reconnecting inserts `STREAM_RECONNECTED` and continues appending samples onto the same session timeline.

## 4. Core architecture & session lifecycle (`src/core/`, `src/session/`)

* **`EventBus.js`**: Pub/sub bus (`on`, `once`, `off`, `emit`, `clear`). `once()` returns an unsubscribe closure; `emit()` iterates over a shallow snapshot of listeners (`[...set]`) inside a `try/catch` block so handlers that subscribe or unsubscribe mid-dispatch do not alter the active delivery pass.
* **`StateManager.js`**: Reactive store holding `{ participant, session, fnirsStatus, fnirsMode, fnirsUrl, currentTest, currentPage }`. `getState()` returns a shallow `Object.freeze()` copy; `reset()` restores initial defaults and notifies subscribers.
* **`router.js`**: Listens to `EVENTS.NAVIGATE` and `EVENTS.SESSION_ENDED`, syncs `currentPage` in `StateManager`, and prompts `window.confirm` before aborting an active session if the user navigates away from `'test'` while `sessionManager.isActive()`.
* **`SessionManager.js`**:
  * Generates UUIDs via `crypto.randomUUID()`, with a `Math.random()` UUIDv4 fallback when opened over plain HTTP on a LAN IP.
  * Aborts any existing active session if `begin()` is invoked while one is already running.
  * Executes queued tests sequentially with a $1200\text{ ms}$ pause between tests, starts `fnirsDevice` recording on session start, stops it on session end, and emits `SESSION_ENDED`.

## 5. Cognitive tasks (`src/tests/`)

All 7 tasks extend `BaseTest.js` and run through three stages:

1. **Instructions** — task rules and key legend.
2. **Preview (`_renderDemo`)** — looping animated example.
3. **Test** — 3-second countdown (`Get ready`), followed by trials with all instructional text removed from the screen.

`BaseTest.unmount()` sets `_unmounted = true` and clears active demo/countdown timers so aborted tests do not mutate detached DOM nodes or fire stale callbacks.

All stimulus generators use `SeededRandom` (`src/utils/Random.js`, Park-Miller LCG $s_{k+1} = (16807 \cdot s_k) \bmod (2^{31} - 1)$) with fixed default seeds so trial sequences are deterministic.

| `testId` | class | default config | seed | input | notes |
|---|---|---|---|---|---|
| `stroop` | `StroopTest` | 24 trials, $33\%$ congruent, $3000\text{ ms}$ display, $500\text{ ms}$ ITI | `42` | Mouse click (5 color buttons) | Colors: `RED`, `BLUE`, `GREEN`, `YELLOW`, `PURPLE` |
| `go-no-go` | `GoNoGoTest` | 60 trials, $80\%$ Go, $500\text{ ms}$ stim, $1000\text{ ms}$ resp window, $800\text{--}1400\text{ ms}$ jittered ISI | `31` | `Space` (filled circle) | Withhold on outline circle |
| `cpt` | `ContinuousPerformanceTest` | 100 trials, $22\%$ `A -> X` targets (capped at $\lfloor \text{trials}/2 \rfloor$), $500\text{ ms}$ stim, $1000\text{ ms}$ ISI | `53` | `Space` (on `X` after `A`) | Sequence generator swaps accidental standalone `A -> X` pairs |
| `n-back` | `NBackTest` | 30 scored trials (+ $n$ prime trials), $33\%$ targets, $1500\text{ ms}$ stim, $500\text{ ms}$ ISI | `17` | `Space` (match $n$ steps back) | $n = 0$ matches `'X'`; supports fallback rule text for $n \ge 3$ |
| `digit-span` | `DigitSpanTest` | `forward` or `backward`, max 14 trials, start span 3, $800\text{ ms}$ digit, $400\text{ ms}$ ISI | `61` | `0-9`, `Backspace`, `Enter` | 2-up / 1-down adaptive staircase (span range $2\text{--}9$) |
| `trail-making` | `TrailMakingTest` | Part `A` ($1 \dots 15$) or Part `B` (`1-A-2-B...`, 15 nodes) | `99` | Mouse click on nodes | Minimum Euclidean node spacing $> 13\%$ on $100 \times 100$ canvas |
| `reaction-time` | `ReactionTimeTest` | `simple` or `choice`, 20 trials, $1000\text{--}2800\text{ ms}$ random ITI, $3000\text{ ms}$ max stim | `7` | `Space` (simple) / `ArrowLeft` `ArrowRight` (choice) | Ignores `e.repeat`; early presses during ITI log `falseStart: true` and `reactionTime: null` without consuming a trial |

## 6. Metrics & data exports (`ResultsPage.js`, `SessionExporter.js`)

### Summary metrics (`ResultsPage.js`)

* **Stroop:** overall accuracy, congruent accuracy, incongruent accuracy, mean congruent/incongruent RT, interference effect ($\text{RT}_{\text{incongruent}} - \text{RT}_{\text{congruent}}$).
* **Go / No-Go:** Go accuracy, commission errors (No-Go presses), omission errors (missed Go), correct rejections, mean Go RT, Go RT SD.
* **CPT-AX:** hit rate, false alarm rate, mean hit RT, accuracy across early / middle / late thirds (vigilance decrement).
* **N-Back:** hit rate, false alarm rate, misses, sensitivity $d' = z(\text{HR}) - z(\text{FAR})$ (Abramowitz & Stegun rational inverse normal approximation, rates clamped to $[0.01, 0.99]$), mean hit RT, hit RT SD.
* **Digit Span:** max span reached, trials correct, mean span.
* **Reaction Time:** accuracy, mean RT, median RT, RT SD, timeout count.
* **Trail Making:** total completion time ($\text{s}$), sequence error count.

### Exported files (`SessionExporter.js`)

1. **`cognirs_session_<id8>.json`** — full session object (`id`, `startTime`, `endTime`, `participant`, `tests`, `fnirs`).
2. **`cognirs_behavioral_<id8>.csv`** — one row per trial across all completed tasks:

   ```text
   sessionId,participantId,group,sex,age,testId,testName,variant,nLevel,trialIndex,correct,reactionTime_ms,timedOut,falseStart,itiElapsedMs,errors,isTarget,isGo,congruent,span,hit,miss,falseAlarm,commission,omission,correctRejection,key,side,letter,response
   ```

   Inapplicable boolean fields export as empty cells (`''`), booleans as `1`/`0`, and unresponded/false-start reaction times as `-1`.
3. **`cognirs_fnirs_<id8>.csv`** — time-sorted stream of samples and interleaved event markers:

   ```text
   relativeTime_ms,deviceTimestamp_ms,channel,hbo,hbr
   104.210,1732384120104.200,0,0.512340,0.298110
   # MARKER,TRIAL_START,105.000,"{""testId"":""stroop"",""trial"":{...}}"
   ```

`SessionExporter` defers `URL.revokeObjectURL()` by $1000\text{ ms}$ after clicking the download anchor so slower disks finish reading the Blob before revocation. `DataUtils.normalize()` computes min/max in a single `for` loop rather than `Math.min(...arr)` so long recordings ($150\text{k}+$ samples) do not overflow the JS argument stack.

## 7. Verification & diagnostics

Module checks can be run directly in Chromium DevTools Console against `npm run dev`, and the Python bridge frame builder can be checked from the repo root:

```bash
python -c "from scripts.lsl_bridge import build_sample_frames; res = build_sample_frames([0.5, 0.3, float('nan'), 0.2], 12.345, [(0,0,'hbo'),(1,0,'hbr'),(2,1,'hbo'),(3,1,'hbr')]); assert len(res) == 1 and res[0]['channel'] == 0; print('PASS:', res)"
```