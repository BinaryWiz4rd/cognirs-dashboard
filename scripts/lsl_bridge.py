"""
LSL-to-WebSocket bridge for Cortivision PHOTON Cap / CortiView.

Resolves an active fNIRS LSL concentration stream (HbO / HbR), normalizes
channel frames into JSON, and broadcasts them to the COGNIRS web dashboard
over WebSocket (default: ws://127.0.0.1:5732).
"""

import argparse
import asyncio
import json
import logging
import math
import time
from typing import Any

import websockets

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [LSLBridge] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("LSLBridge")


def parse_channel_layout(info: Any) -> list[tuple[int, int, str]]:
    """
    Extracts (raw_index, logical_channel, chromophore) mappings from LSL XML metadata.
    Falls back to interleaved [HbO_0, HbR_0, HbO_1, HbR_1, ...] pairs when labels
    are absent.
    """
    n_channels = info.channel_count()
    mappings: list[tuple[int, int, str]] = []

    try:
        channels_node = info.desc().child("channels")
        ch_node = channels_node.child("channel")
        raw_idx = 0
        hbo_count = 0
        hbr_count = 0

        while not ch_node.empty():
            label = (ch_node.child_value("label") or "").lower()
            ch_type = (ch_node.child_value("type") or "").lower()
            descriptor = f"{label} {ch_type}"

            if "hbo" in descriptor or "oxy" in descriptor:
                mappings.append((raw_idx, hbo_count, "hbo"))
                hbo_count += 1
            elif "hbr" in descriptor or "deoxy" in descriptor:
                mappings.append((raw_idx, hbr_count, "hbr"))
                hbr_count += 1

            raw_idx += 1
            ch_node = ch_node.next_sibling("channel")
    except Exception as exc:
        log.debug("Could not parse XML channel descriptors: %s", exc)
        mappings = []

    if mappings:
        return mappings

    # Default fallback: paired interleaved channels [HbO_0, HbR_0, HbO_1, HbR_1, ...]
    pair_count = n_channels // 2
    fallback: list[tuple[int, int, str]] = []
    for ch_idx in range(pair_count):
        fallback.append((ch_idx * 2, ch_idx, "hbo"))
        fallback.append((ch_idx * 2 + 1, ch_idx, "hbr"))
    return fallback


def build_sample_frames(
    raw_vector: list[float],
    device_timestamp_ms: int,
    layout: list[tuple[int, int, str]],
) -> list[dict[str, Any]]:
    """Converts a raw LSL float vector into normalized COGNIRS channel objects."""
    grouped: dict[int, dict[str, Any]] = {}

    for raw_idx, logical_ch, chromophore in layout:
        if raw_idx >= len(raw_vector):
            continue
        entry = grouped.setdefault(
            logical_ch,
            {
                "timestamp": device_timestamp_ms,
                "channel": logical_ch,
                "hbo": None,
                "hbr": None,
            },
        )
        entry[chromophore] = float(raw_vector[raw_idx])

    return [
        frame
        for _, frame in sorted(grouped.items())
        if frame["hbo"] is not None and frame["hbr"] is not None
    ]


class LSLWebSocketBridge:
    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 5732,
        stream_name: str | None = None,
        stream_type: str = "NIRS",
        simulate: bool = False,
    ) -> None:
        self.host = host
        self.port = port
        self.stream_name = stream_name
        self.stream_type = stream_type
        self.simulate = simulate
        self.clients: set[Any] = set()

    async def handle_client(self, websocket: Any, *_: Any) -> None:
        self.clients.add(websocket)
        remote = getattr(websocket, "remote_address", "unknown")
        log.info("Browser client connected (%s) — active clients: %d", remote, len(self.clients))
        try:
            async for message in websocket:
                log.debug("Received client message: %s", message)
        except websockets.ConnectionClosed:
            pass
        finally:
            self.clients.discard(websocket)
            log.info("Browser client disconnected (%s) — active clients: %d", remote, len(self.clients))

    async def broadcast(self, payload: list[dict[str, Any]]) -> None:
        if not self.clients or not payload:
            return
        serialized = json.dumps(payload)
        stale: list[Any] = []
        for ws in list(self.clients):
            try:
                await ws.send(serialized)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.clients.discard(ws)

    async def _run_simulator_loop(self) -> None:
        log.info("Running built-in 50 Hz LSL bridge simulator (8 channels)...")
        sample_rate_hz = 50.0
        dt = 1.0 / sample_rate_hz
        t = 0.0

        while True:
            ts_ms = round(time.time() * 1000)
            frames = [
                {
                    "timestamp": ts_ms,
                    "channel": ch,
                    "hbo": round(0.50 + 0.15 * math.sin(2 * math.pi * 0.1 * t + ch * 0.4), 6),
                    "hbr": round(0.30 - 0.10 * math.sin(2 * math.pi * 0.1 * t + ch * 0.4), 6),
                }
                for ch in range(8)
            ]
            await self.broadcast(frames)
            t += dt
            await asyncio.sleep(dt)

    def _resolve_inlet(self) -> tuple[Any, list[tuple[int, int, str]]]:
        from pylsl import StreamInlet, resolve_byprop, resolve_streams

        if self.stream_name:
            log.info("Searching for LSL stream with name='%s'...", self.stream_name)
            streams = resolve_byprop("name", self.stream_name, timeout=2.0)
        else:
            log.info("Searching for LSL stream with type='%s'...", self.stream_type)
            streams = resolve_byprop("type", self.stream_type, timeout=2.0)
            if not streams:
                # Fallback: look for any stream containing 'corti' or 'fnirs' in its name
                all_streams = resolve_streams(wait_time=1.5)
                streams = [
                    s
                    for s in all_streams
                    if any(
                        token in (s.name() or "").lower()
                        for token in ("corti", "fnirs", "nirs", "photon")
                    )
                ]

        if not streams:
            return None, []

        target = streams[0]
        inlet = StreamInlet(target, max_buflen=60)
        info = inlet.info()
        layout = parse_channel_layout(info)
        log.info(
            "Connected to LSL stream '%s' (type=%s, raw_channels=%d, mapped_pairs=%d, srate=%.1f Hz)",
            info.name(),
            info.type(),
            info.channel_count(),
            len(layout) // 2,
            info.nominal_srate(),
        )
        return inlet, layout

    async def _run_lsl_loop(self) -> None:
        inlet = None
        layout: list[tuple[int, int, str]] = []

        while True:
            if inlet is None:
                inlet, layout = await asyncio.to_thread(self._resolve_inlet)
                if inlet is None:
                    log.warning(
                        "No Cortivision/fNIRS LSL stream found. Ensure CortiView LSL streaming is enabled. Retrying in 2s..."
                    )
                    await asyncio.sleep(2.0)
                    continue

            try:
                samples, timestamps = inlet.pull_chunk(timeout=0.0)
                if timestamps:
                    batch: list[dict[str, Any]] = []
                    for vec, lsl_ts in zip(samples, timestamps):
                        ts_ms = round(lsl_ts * 1000)
                        batch.extend(build_sample_frames(vec, ts_ms, layout))
                    await self.broadcast(batch)
                await asyncio.sleep(0.01)
            except Exception as exc:
                log.error("LSL stream interrupted (%s). Reconnecting...", exc)
                try:
                    inlet.close_stream()
                except Exception:
                    pass
                inlet = None
                layout = []
                await asyncio.sleep(1.0)

    async def start(self) -> None:
        log.info("Starting WebSocket server on ws://%s:%d", self.host, self.port)
        async with websockets.serve(self.handle_client, self.host, self.port):
            if self.simulate:
                await self._run_simulator_loop()
            else:
                await self._run_lsl_loop()


def main() -> None:
    parser = argparse.ArgumentParser(description="Cortivision LSL to WebSocket bridge for COGNIRS")
    parser.add_argument("--host", default="127.0.0.1", help="WebSocket bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=5732, help="WebSocket port (default: 5732)")
    parser.add_argument("--stream-name", default=None, help="Exact LSL stream name to connect to")
    parser.add_argument("--stream-type", default="NIRS", help="LSL stream type to resolve (default: NIRS)")
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="Stream synthetic 50 Hz HbO/HbR frames over WebSocket without hardware",
    )
    args = parser.parse_args()

    bridge = LSLWebSocketBridge(
        host=args.host,
        port=args.port,
        stream_name=args.stream_name,
        stream_type=args.stream_type,
        simulate=args.simulate,
    )

    try:
        asyncio.run(bridge.start())
    except KeyboardInterrupt:
        log.info("Bridge stopped by user.")


if __name__ == "__main__":
    main()