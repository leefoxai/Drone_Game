#!/usr/bin/env python3
"""Convert Drone_Game schema 0.1.6 lap recordings to compact schema 0.2.0.

Standard-library only. The source file is not modified.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
from pathlib import Path

LEGACY_SCHEMA = "0.1.6"
SCHEMA_VERSION = "0.2.0"
LEGACY_FORMAT = "drone-lap-jsonl-gzip-v1"
RECORDING_FORMAT = "drone-lap-jsonl-gzip-v2"
INPUT_CHUNK_SIZE = 256
STATE_CHECKPOINT_INTERVAL_TICKS = 24


def compact_input(row: dict) -> list:
    p, a, t = row["pilotInput"], row["appliedInput"], row.get("assistTargets")
    target = [None, None, None, None] if t is None else [
        t["horizontalVelocityWorldMps"][0], t["horizontalVelocityWorldMps"][1],
        t["verticalVelocityMps"], t["yawRateRadPerSec"],
    ]
    return [row["tick"],p["throttle"],p["roll"],p["pitch"],p["yaw"],a["throttle"],a["roll"],a["pitch"],a["yaw"],*target]


def compact_frame(row: dict) -> dict:
    return {key: row[key] for key in [
        "frameSequence","simulationTick","physicsAlpha","inputReadMonotonicMs","rafTimestampMs",
        "inputDeviceKind","keysDown","rawAxes","rawButtons","normalizedPilotInput"
    ]}


def convert(source: Path, destination: Path) -> dict:
    raw = gzip.open(source, "rb").read().decode("utf-8")
    records = [json.loads(line) for line in raw.splitlines() if line]
    if not records or records[0].get("channel") != "metadata": raise ValueError("missing metadata line")
    meta = dict(records[0]); meta.pop("channel", None)
    if meta.get("schemaVersion") != LEGACY_SCHEMA or meta.get("recordingFormat") != LEGACY_FORMAT:
        raise ValueError("source must be schema 0.1.6 / drone-lap-jsonl-gzip-v1")

    grouped = {name: [] for name in ["frames","inputs","states","controller_states","events","camera_changes"]}
    for record in records[1:]:
        ch = record.get("channel")
        if ch not in grouped: raise ValueError(f"unexpected channel {ch}")
        row = dict(record); row.pop("channel", None); grouped[ch].append(row)

    inputs, states, events = grouped["inputs"], grouped["states"], grouped["events"]
    if len(states) != len(inputs) + 1: raise ValueError("legacy states/input count mismatch")
    first_tick, final_tick = states[0]["tick"], states[-1]["tick"]
    required_ticks = {first_tick, final_tick, *(e["tick"] for e in events)}
    required_ticks.update(range(first_tick, final_tick + 1, STATE_CHECKPOINT_INTERVAL_TICKS))

    payload: list[str] = []
    for frame in grouped["frames"]:
        payload.append(json.dumps({"channel":"frames",**compact_frame(frame)},separators=(",",":"),ensure_ascii=False))
    for start in range(0, len(inputs), INPUT_CHUNK_SIZE):
        block = inputs[start:start+INPUT_CHUNK_SIZE]
        payload.append(json.dumps({"channel":"input_chunks","startTick":block[0]["tick"],"rows":[compact_input(v) for v in block]},separators=(",",":"),ensure_ascii=False))
    for state in states:
        if state["tick"] in required_ticks:
            payload.append(json.dumps({"channel":"state_checkpoints",**state},separators=(",",":"),ensure_ascii=False))
    for event in events:
        payload.append(json.dumps({"channel":"events",**event},separators=(",",":"),ensure_ascii=False))
    for camera in grouped["camera_changes"]:
        payload.append(json.dumps({"channel":"camera_changes",**camera},separators=(",",":"),ensure_ascii=False))

    payload_text = "\n".join(payload) + ("\n" if payload else "")
    meta.update({
        "schemaVersion": SCHEMA_VERSION,
        "recordingFormat": RECORDING_FORMAT,
        "inputChunkSize": INPUT_CHUNK_SIZE,
        "stateCheckpointIntervalTicks": STATE_CHECKPOINT_INTERVAL_TICKS,
        "payloadSha256": hashlib.sha256(payload_text.encode("utf-8")).hexdigest(),
    })
    text = json.dumps({"channel":"metadata",**meta},separators=(",",":"),ensure_ascii=False) + "\n" + payload_text
    destination.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(destination, "wb", compresslevel=9) as out: out.write(text.encode("utf-8"))
    return {
        "recording_id": meta["recordingId"],
        "seconds": meta["outcome"].get("seconds"),
        "source_bytes": source.stat().st_size,
        "compact_bytes": destination.stat().st_size,
        "checkpoints": sum(1 for s in states if s["tick"] in required_ticks),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path, nargs="?")
    args = parser.parse_args()
    destination = args.destination or args.source.with_name(args.source.name.replace(".jsonl.gz", ".v2.jsonl.gz"))
    result = convert(args.source, destination)
    print(json.dumps({**result,"destination":str(destination)},ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
