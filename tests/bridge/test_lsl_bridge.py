import asyncio
import json
import math
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[2]
for candidate in (ROOT, ROOT / "bridge"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from scripts.lsl_bridge import (  # noqa: E402
    LSLWebSocketBridge,
    build_sample_frames,
    parse_channel_layout,
)


class _FakeXmlNode:
    def __init__(self, children=None, values=None, siblings=None):
        self._children = children or {}
        self._values = values or {}
        self._siblings = siblings or []
        self._idx = 0

    def empty(self) -> bool:
        return self._idx >= len(self._siblings) and not self._values and not self._children

    def child(self, name: str):
        return self._children.get(name, _FakeXmlNode())

    def child_value(self, name: str) -> str:
        if self._siblings:
            return self._siblings[self._idx].get(name, "")
        return self._values.get(name, "")

    def next_sibling(self, _name: str):
        next_node = _FakeXmlNode(siblings=self._siblings)
        next_node._idx = self._idx + 1
        return next_node


def _make_mock_stream_info(channel_count: int, channel_specs: list[dict[str, str]] | None = None):
    info = MagicMock()
    info.channel_count.return_value = channel_count
    if channel_specs is None:
        info.desc.side_effect = RuntimeError("No XML metadata")
    else:
        first_ch = _FakeXmlNode(siblings=channel_specs)
        channels_node = _FakeXmlNode(children={"channel": first_ch})
        desc_node = _FakeXmlNode(children={"channels": channels_node})
        info.desc.return_value = desc_node
    return info


class TestParseChannelLayout:
    def test_parses_xml_hbo_and_hbr_labels(self):
        specs = [
            {"label": "S1-D1 HbO", "type": "NIRS"},
            {"label": "S1-D1 HbR", "type": "NIRS"},
            {"label": "S2-D1 oxy", "type": "NIRS"},
            {"label": "S2-D1 deoxy", "type": "NIRS"},
        ]
        info = _make_mock_stream_info(4, specs)
        layout = parse_channel_layout(info)

        assert layout == [
            (0, 0, "hbo"),
            (1, 0, "hbr"),
            (2, 1, "hbo"),
            (3, 1, "hbr"),
        ]

    def test_ignores_auxiliary_channels_in_xml(self):
        specs = [
            {"label": "ACC_X", "type": "AUX"},
            {"label": "Ch1 HbO", "type": "NIRS"},
            {"label": "Ch1 HbR", "type": "NIRS"},
        ]
        info = _make_mock_stream_info(3, specs)
        layout = parse_channel_layout(info)

        assert layout == [(1, 0, "hbo"), (2, 0, "hbr")]

    def test_falls_back_to_interleaved_pairs_without_xml(self):
        info = _make_mock_stream_info(6, channel_specs=None)
        layout = parse_channel_layout(info)

        assert layout == [
            (0, 0, "hbo"),
            (1, 0, "hbr"),
            (2, 1, "hbo"),
            (3, 1, "hbr"),
            (4, 2, "hbo"),
            (5, 2, "hbr"),
        ]


class TestBuildSampleFrames:
    def test_builds_normalized_channel_frames(self):
        layout = [(0, 0, "hbo"), (1, 0, "hbr"), (2, 1, "hbo"), (3, 1, "hbr")]
        raw = [0.512, 0.298, 0.610, 0.245]

        frames = build_sample_frames(raw, 1234.5, layout)

        assert frames == [
            {"timestamp": 1234.5, "channel": 0, "hbo": 0.512, "hbr": 0.298},
            {"timestamp": 1234.5, "channel": 1, "hbo": 0.610, "hbr": 0.245},
        ]

    def test_drops_channels_with_nan_or_missing_chromophore(self):
        layout = [(0, 0, "hbo"), (1, 0, "hbr"), (2, 1, "hbo"), (3, 1, "hbr")]
        raw = [0.50, math.nan, 0.60, 0.25]

        frames = build_sample_frames(raw, 500.0, layout)

        assert len(frames) == 1
        assert frames[0]["channel"] == 1
        assert frames[0]["hbo"] == 0.60


class TestLSLWebSocketBridge:
    def test_broadcast_serializes_json_and_prunes_stale_clients(self):
        bridge = LSLWebSocketBridge()
        healthy_ws = MagicMock()
        healthy_ws.send = AsyncMock()

        stale_ws = MagicMock()
        stale_ws.send = AsyncMock(side_effect=RuntimeError("Broken pipe"))

        bridge.clients = {healthy_ws, stale_ws}
        payload = [{"timestamp": 100.0, "channel": 0, "hbo": 0.5, "hbr": 0.3}]

        asyncio.run(bridge.broadcast(payload))

        healthy_ws.send.assert_awaited_once_with(json.dumps(payload))
        assert healthy_ws in bridge.clients
        assert stale_ws not in bridge.clients

    def test_broadcast_is_noop_when_no_clients_or_empty_payload(self):
        bridge = LSLWebSocketBridge()
        ws = MagicMock()
        ws.send = AsyncMock()

        asyncio.run(bridge.broadcast([{"timestamp": 1.0, "channel": 0, "hbo": 0.5, "hbr": 0.3}]))
        ws.send.assert_not_awaited()

        bridge.clients = {ws}
        asyncio.run(bridge.broadcast([]))
        ws.send.assert_not_awaited()