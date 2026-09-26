#!/usr/bin/env python3
"""Validate exported Drone_Game lap .jsonl.gz files against data_spec 0.1.6."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
import math
import sys
from pathlib import Path

SCHEMA_VERSION = "0.1.6"
CHANNELS = {"frames", "inputs", "states", "controller_states", "events", "camera_changes"}
DEVICE_KINDS = {"keyboard", "gamepad", "rc_joystick"}
TRAINING_USES = {"stick_pattern", "flight_method"}
OUTCOMES = {"complete", "invalid", "aborted"}

class ValidationError(Exception):
    pass

def fail(message: str) -> None:
    raise ValidationError(message)

def canonical(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)

def hash_value(value) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()

def finite(value, path="value") -> None:
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            fail(f"{path}: non-finite number")
        return
    if isinstance(value, list):
        for i, item in enumerate(value): finite(item, f"{path}[{i}]")
    elif isinstance(value, dict):
        for key, item in value.items(): finite(item, f"{path}.{key}")

def expected_partition(meta: dict) -> str:
    assist = meta.get("assistVersion")
    return "|".join([
        meta["trackId"], meta["controlMode"], f"device-{meta['inputDeviceKind']}",
        f"physics-{meta['physicsVersion']}", f"profile-{meta['aircraftProfileVersion']}",
        f"assist-{assist if assist is not None else 'none'}", f"camera-{meta['cameraMode']}",
        f"horizon-{'on' if meta['artificialHorizonEnabled'] else 'off'}",
        f"height-assist-{'on' if meta['heightAssistEnabled'] else 'off'}",
        f"tester-{'on' if meta['testerMode'] else 'off'}",
    ])

def classify(meta: dict, inputs: list[dict]) -> str:
    direct_device = meta["inputDeviceKind"] in {"gamepad", "rc_joystick"}
    direct_acro = meta["controlMode"] == "acro" and meta.get("assistVersion") is None and direct_device
    direct_samples = bool(inputs) and all(row["pilotInput"] == row["appliedInput"] for row in inputs)
    return "stick_pattern" if direct_acro and direct_samples else "flight_method"

def require(meta: dict, keys: list[str]) -> None:
    for key in keys:
        if key not in meta: fail(f"metadata missing required field: {key}")

def validate(path: Path) -> dict:
    try:
        raw = gzip.open(path, "rb").read()
    except Exception as exc:
        fail(f"gzip read failed: {exc}")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        fail(f"UTF-8 decode failed: {exc}")
    raw_lines = [line for line in text.splitlines() if line]
    if not raw_lines: fail("empty JSONL")
    try:
        records = [json.loads(line) for line in raw_lines]
    except json.JSONDecodeError as exc:
        fail(f"JSON decode failed at line {exc.lineno}: {exc.msg}")
    if records[0].get("channel") != "metadata": fail("line 1 must be metadata")
    meta = dict(records[0]); meta.pop("channel", None)
    require(meta, [
        "schemaVersion","recordingFormat","recordingId","sessionId","createdAtUtc","partitionKey","trainingUse",
        "publicLeaderboardEligible","physicsHz","trackId","controlMode","aircraftProfileVersion","assistVersion",
        "physicsVersion","inputDeviceKind","testerMode","cameraMode","artificialHorizonEnabled","heightAssistEnabled",
        "track","ruleset","aircraftProfile","rates","inputDevice","display","controlProfile","seed","prng","initialState",
        "environment","camera","practiceAssist","clientBuild","runtime","consent","outcome","payloadSha256"
    ])
    if meta["schemaVersion"] != SCHEMA_VERSION: fail(f"unsupported schemaVersion {meta['schemaVersion']}")
    if meta["physicsHz"] != 240: fail("physicsHz must be 240 for schema 0.1.6")
    if meta["inputDeviceKind"] not in DEVICE_KINDS: fail("invalid inputDeviceKind")
    if meta["trainingUse"] not in TRAINING_USES: fail("invalid trainingUse")
    if meta["outcome"].get("status") not in OUTCOMES: fail("invalid outcome.status")
    if meta["testerMode"] and meta["publicLeaderboardEligible"]: fail("tester recording cannot be public leaderboard eligible")
    if meta["partitionKey"] != expected_partition(meta): fail("partitionKey does not match metadata")
    if meta["track"]["id"] != meta["trackId"]: fail("track.id != trackId")
    if meta["track"]["sha256"] != hash_value(meta["track"]["snapshot"]): fail("track SHA-256 mismatch")
    if meta["ruleset"]["sha256"] != hash_value(meta["ruleset"]["snapshot"]): fail("ruleset SHA-256 mismatch")
    if meta["aircraftProfile"]["sha256"] != hash_value(meta["aircraftProfile"]["snapshot"]): fail("aircraftProfile SHA-256 mismatch")
    payload_text = "\n".join(raw_lines[1:]) + ("\n" if len(raw_lines) > 1 else "")
    if hashlib.sha256(payload_text.encode("utf-8")).hexdigest() != meta["payloadSha256"]: fail("payload SHA-256 mismatch")

    grouped = {channel: [] for channel in CHANNELS}
    for line_no, record in enumerate(records[1:], 2):
        channel = record.get("channel")
        if channel not in CHANNELS: fail(f"line {line_no}: unknown channel {channel}")
        row = dict(record); row.pop("channel", None); finite(row, f"line {line_no}"); grouped[channel].append(row)
    inputs, states, controllers, frames, events = grouped["inputs"], grouped["states"], grouped["controller_states"], grouped["frames"], grouped["events"]
    if not inputs: fail("inputs is empty")
    if len(states) != len(inputs) + 1: fail(f"states must equal inputs+1 ({len(states)} vs {len(inputs)+1})")
    if len(controllers) != len(states): fail("controller_states count must equal states count")
    first_tick = states[0]["tick"]
    if states[0]["state"]["tick"] != first_tick: fail("initial state tick mismatch")
    for i, row in enumerate(inputs):
        expected_tick = first_tick + i
        if row["tick"] != expected_tick: fail(f"inputs[{i}] tick expected {expected_tick}, got {row['tick']}")
        if states[i+1]["tick"] != expected_tick + 1 or states[i+1]["state"]["tick"] != expected_tick + 1: fail(f"states[{i+1}] tick mismatch")
        if controllers[i+1]["tick"] != expected_tick + 1: fail(f"controller_states[{i+1}] tick mismatch")
        if meta["controlMode"] == "assisted" and row.get("assistTargets") is None: fail(f"inputs[{i}] Easy missing assistTargets")
        if meta["controlMode"] == "acro" and row.get("assistTargets") is not None: fail(f"inputs[{i}] Acro must not have assistTargets")
    if classify(meta, inputs) != meta["trainingUse"]: fail("trainingUse does not match classification rule")
    for i, frame in enumerate(frames):
        if frame["frameSequence"] != i: fail(f"frames[{i}] frameSequence mismatch")
        if i and frame["rafTimestampMs"] < frames[i-1]["rafTimestampMs"]: fail("rAF timestamps are not monotonic")
        if i and frame["inputReadMonotonicMs"] < frames[i-1]["inputReadMonotonicMs"]: fail("input-read timestamps are not monotonic")
        if meta["inputDeviceKind"] == "keyboard" and frame.get("keysDown") is None: fail(f"frames[{i}] keyboard keysDown missing")
        if meta["inputDeviceKind"] != "keyboard" and frame.get("rawAxes") is None: fail(f"frames[{i}] joystick rawAxes missing")
    for i, event in enumerate(events):
        if event["sequence"] != i: fail(f"events[{i}] sequence mismatch")
    if not any(e["type"] == "lap_start" for e in events): fail("lap_start event missing")
    status = meta["outcome"]["status"]
    terminal = "lap_complete" if status == "complete" else "lap_abort"
    if not any(e["type"] == terminal for e in events): fail(f"{terminal} event missing")
    if status == "invalid" and not any(e["type"] == "collision" for e in events): fail("invalid collision recording missing collision event")
    finite(meta, "metadata")
    return {"recording_id": meta["recordingId"], "inputs": len(inputs), "states": len(states), "frames": len(frames), "events": len(events), "training_use": meta["trainingUse"], "compressed_bytes": path.stat().st_size, "uncompressed_bytes": len(raw)}

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()
    ok = True
    for path in args.files:
        try:
            result = validate(path)
            print(f"OK {path}: {json.dumps(result, ensure_ascii=False)}")
        except (ValidationError, OSError) as exc:
            ok = False; print(f"ERROR {path}: {exc}", file=sys.stderr)
    return 0 if ok else 1

if __name__ == "__main__":
    raise SystemExit(main())
