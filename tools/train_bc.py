#!/usr/bin/env python3
"""Train the M3 flight_method behavior-cloning model on rendered FPV videos.

Requires PyTorch CPU (`torch`). Uses ffmpeg for video decoding. Outputs stay under local_data/.
BC labels are ONLY assist_targets; applied_input is never used as a label.
"""
from __future__ import annotations
import argparse
import csv
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

try:
    import torch
    from torch import nn
except ImportError:
    print("ERROR: PyTorch is required. Install a CPU build of 'torch' before running this script.", file=sys.stderr)
    raise SystemExit(2)

ROOT = Path.cwd().resolve()
LOCAL_DATA = (ROOT / "local_data").resolve()
WIDTH, HEIGHT = 64, 36
TARGET_SCALES = torch.tensor([4.0, 4.0, 2.0, math.pi / 3], dtype=torch.float32)


def inside_local_data(path: Path) -> bool:
    path = path.resolve()
    return path == LOCAL_DATA or LOCAL_DATA in path.parents


def fail(message: str) -> None:
    raise RuntimeError(message)


def load_labels(path: Path) -> torch.Tensor:
    rows = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        required = ["assist_target_vx", "assist_target_vz", "assist_target_vertical", "assist_target_yaw_rate"]
        if not reader.fieldnames or any(name not in reader.fieldnames for name in required):
            fail(f"{path}: assist_targets columns missing")
        if any(name.startswith("applied_") for name in reader.fieldnames):
            fail(f"{path}: applied_input columns are forbidden BC labels")
        for line, row in enumerate(reader, 2):
            values = [row[name] for name in required]
            if any(value == "" for value in values): fail(f"{path}:{line}: null assist target")
            rows.append([float(value) for value in values])
    if not rows: fail(f"{path}: no labels")
    labels = torch.tensor(rows, dtype=torch.float32)
    if torch.any(torch.abs(labels) > TARGET_SCALES * 1.001): fail(f"{path}: assist target outside expected Easy range")
    return labels


def decode_video(path: Path, expected_frames: int) -> torch.Tensor:
    command = ["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"scale={WIDTH}:{HEIGHT},format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0: fail(f"ffmpeg decode failed for {path}: {result.stderr.decode(errors='replace')}")
    frame_bytes = WIDTH * HEIGHT
    if len(result.stdout) % frame_bytes: fail(f"{path}: raw video byte count is not frame aligned")
    frames = len(result.stdout) // frame_bytes
    if frames != expected_frames: fail(f"{path}: video/label frame mismatch {frames} != {expected_frames}")
    return torch.frombuffer(bytearray(result.stdout), dtype=torch.uint8).reshape(frames, frame_bytes).float().div_(255.0)


def discover(render_root: Path):
    items = []
    for manifest_path in sorted(render_root.glob("*/render_manifest.json")):
        folder = manifest_path.parent
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        video, labels = folder / "flight.mp4", folder / "frame_labels.csv"
        if not video.exists() or not labels.exists(): fail(f"{folder}: flight.mp4/frame_labels.csv missing")
        consent = manifest.get("consent", {})
        if manifest.get("trainingUse") != "flight_method": fail(f"{folder}: trainingUse is not flight_method")
        if consent.get("granted") is not True or "local_bc_training" not in consent.get("scope", []): fail(f"{folder}: local_bc_training consent missing")
        items.append((manifest, video, labels))
    if len(items) < 2: fail("at least two complete rendered laps are required")
    partitions = {item[0].get("partitionKey") for item in items}
    if len(partitions) != 1: fail(f"rendered laps must share one partition, got {len(partitions)}")
    return items


class BcNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(WIDTH * HEIGHT, 32)
        self.fc2 = nn.Linear(32, 16)
        self.fc3 = nn.Linear(16, 4)
    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return torch.tanh(self.fc3(x))


def metrics(model: nn.Module, x: torch.Tensor, y: torch.Tensor):
    model.eval()
    with torch.no_grad():
        pred_norm = model(x)
        y_norm = y / TARGET_SCALES
        pred = pred_norm * TARGET_SCALES
        mse = torch.mean((pred_norm - y_norm) ** 2).item()
        mae = torch.mean(torch.abs(pred - y), dim=0).tolist()
    return {"normalized_mse": mse, "mae": {"vx":mae[0],"vz":mae[1],"vertical_velocity":mae[2],"yaw_rate":mae[3]}}


def layer_json(layer: nn.Linear, activation: str):
    return {"activation":activation,"weight":layer.weight.detach().cpu().tolist(),"bias":layer.bias.detach().cpu().tolist()}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--renders", type=Path, default=Path("local_data/m3/renders"))
    parser.add_argument("--out", type=Path, default=Path("local_data/m3/models"))
    parser.add_argument("--val-id", help="recording_id to hold out as the complete validation lap")
    parser.add_argument("--epochs", type=int, default=30)
    args = parser.parse_args()
    render_root, output = args.renders.resolve(), args.out.resolve()
    if not inside_local_data(render_root) or not inside_local_data(output): fail("renders and model outputs must be under local_data/")
    if shutil.which("ffmpeg") is None: fail("ffmpeg is required to decode rendered MP4 files")

    items = discover(render_root)
    ids = [item[0]["recordingId"] for item in items]
    val_id = args.val_id or ids[-1]
    if val_id not in ids: fail(f"validation recording {val_id} not found")
    train_ids = [value for value in ids if value != val_id]
    if not train_ids: fail("training set is empty")

    train_x, train_y, val_x, val_y = [], [], [], []
    for manifest, video, labels_path in items:
        labels = load_labels(labels_path)
        frames = decode_video(video, labels.shape[0])
        target_x, target_y = (val_x, val_y) if manifest["recordingId"] == val_id else (train_x, train_y)
        target_x.append(frames); target_y.append(labels)
    x_train, y_train = torch.cat(train_x), torch.cat(train_y)
    x_val, y_val = torch.cat(val_x), torch.cat(val_y)

    torch.manual_seed(0); torch.set_num_threads(max(1, min(4, torch.get_num_threads())))
    model = BcNet().cpu(); optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    batch_size = 64
    for epoch in range(args.epochs):
        model.train(); order = torch.randperm(x_train.shape[0])
        for start in range(0, len(order), batch_size):
            idx = order[start:start+batch_size]
            pred = model(x_train[idx]); target = y_train[idx] / TARGET_SCALES
            loss = torch.mean((pred - target) ** 2)
            optimizer.zero_grad(); loss.backward(); optimizer.step()
        if epoch in {0,args.epochs-1} or (epoch+1)%10==0:
            print(f"epoch {epoch+1}/{args.epochs} loss={loss.item():.6f}")

    result = {"train":metrics(model,x_train,y_train),"validation":metrics(model,x_val,y_val)}
    output.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), output / "bc_model.pt")
    first = items[0][0]
    model_json = {
        "format":"drone-bc-mlp-v1",
        "input":{"width":WIDTH,"height":HEIGHT,"grayscale":True},
        "output":{"kind":"assist_targets","scales":TARGET_SCALES.tolist()},
        "layers":[layer_json(model.fc1,"relu"),layer_json(model.fc2,"relu"),layer_json(model.fc3,"tanh")],
        "training":{"trackId":first.get("trackId"),"partitionKey":first.get("partitionKey"),"trainingUse":"flight_method","label":"assist_targets","appliedInputLabel":False,"trainRecordingIds":train_ids,"validationRecordingId":val_id,"epochs":args.epochs,"seed":0},
    }
    (output / "bc_model.json").write_text(json.dumps(model_json,separators=(",",":")),encoding="utf-8")
    (output / "metrics.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    training_manifest = {"modelFormat":"drone-bc-mlp-v1","label":"assist_targets","appliedInputLabel":False,"partitionKey":first.get("partitionKey"),"trainRecordingIds":train_ids,"validationRecordingId":val_id,"trainFrames":int(x_train.shape[0]),"validationFrames":int(x_val.shape[0]),"epochs":args.epochs,"seed":0}
    (output / "training_manifest.json").write_text(json.dumps(training_manifest,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"output":str(output.relative_to(ROOT)),**training_manifest,"metrics":result},indent=2))
    return 0

if __name__ == "__main__":
    try: raise SystemExit(main())
    except RuntimeError as exc:
        print(f"ERROR: {exc}",file=sys.stderr);raise SystemExit(1)
