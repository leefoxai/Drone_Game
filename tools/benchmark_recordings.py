#!/usr/bin/env python3
"""Measure local recording size, gzip/JSON decode time and Python peak memory.

Standard-library only. Results are written under local_data/.
"""
from __future__ import annotations
import argparse
import gzip
import json
import statistics
import time
import tracemalloc
from pathlib import Path

ROOT=Path.cwd().resolve();LOCAL_DATA=(ROOT/'local_data').resolve()
def inside(path:Path)->bool:path=path.resolve();return path==LOCAL_DATA or LOCAL_DATA in path.parents

def measure(path:Path)->dict:
    times=[];peak=0;raw=b'';records=[]
    for _ in range(3):
        tracemalloc.start();start=time.perf_counter();raw=gzip.open(path,'rb').read();records=[json.loads(line) for line in raw.decode('utf-8').splitlines() if line];elapsed=time.perf_counter()-start;_,p=tracemalloc.get_traced_memory();tracemalloc.stop();times.append(elapsed);peak=max(peak,p)
    meta=records[0];seconds=meta.get('outcome',{}).get('seconds')
    compressed=path.stat().st_size
    return {'file':str(path.relative_to(ROOT)).replace('\\','/'),'recordingId':meta.get('recordingId'),'schemaVersion':meta.get('schemaVersion'),'seconds':seconds,'compressedBytes':compressed,'uncompressedBytes':len(raw),'compressedBytesPerSecond':compressed/seconds if seconds else None,'projected60sBytes':compressed/seconds*60 if seconds else None,'decodeMedianSeconds':statistics.median(times),'pythonPeakBytes':peak}

def main()->int:
    parser=argparse.ArgumentParser();parser.add_argument('files',nargs='+',type=Path);parser.add_argument('--out',type=Path,default=Path('local_data/m3/benchmarks/recordings.json'));args=parser.parse_args();out=args.out.resolve()
    if not inside(out):raise SystemExit('output must be under local_data/')
    results=[]
    for value in args.files:
        path=value.resolve()
        if not inside(path):raise SystemExit(f'{path}: recording must be under local_data/')
        results.append(measure(path))
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({'recordings':results},indent=2,ensure_ascii=False)+'\n',encoding='utf-8');print(json.dumps({'recordings':results},indent=2,ensure_ascii=False));return 0
if __name__=='__main__':raise SystemExit(main())
