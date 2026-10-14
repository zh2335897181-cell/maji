"""Run with Python 3.11: python speech/install.py --runtime <userData>/speech-runtime."""
import argparse, hashlib, os, subprocess, sys, tarfile, urllib.request, venv
from pathlib import Path
NAME='sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
URL='https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/'+NAME+'.tar.bz2'
parser=argparse.ArgumentParser();parser.add_argument('--runtime',required=True);args=parser.parse_args()
root=Path(args.runtime).resolve();root.mkdir(parents=True,exist_ok=True)
python=root/'venv'/'Scripts'/'python.exe'
if not python.exists():venv.create(root/'venv',with_pip=True)
subprocess.run([str(python),'-m','pip','install','--disable-pip-version-check','sherpa-onnx==1.13.8','soundfile==0.14.0','numpy==2.4.6','PyAudioWPatch==0.2.12.9'],check=True)
target=root/'models'/NAME
if not (target/'model.int8.onnx').exists():
    archive=root/(NAME+'.tar.bz2');partial=archive.with_suffix('.part')
    print('Downloading SenseVoice INT8 model...',flush=True)
    with urllib.request.urlopen(URL,timeout=60) as response,partial.open('wb') as out:
        size=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk:break
            size+=len(chunk)
            if size>1024*1024*1024:raise RuntimeError('Model archive exceeds limit')
            out.write(chunk)
    partial.replace(archive)
    models=root/'models';models.mkdir(exist_ok=True)
    with tarfile.open(archive,'r:bz2') as bundle:
        for member in bundle.getmembers():
            path=(models/member.name).resolve()
            if not path.is_relative_to(models.resolve()) or member.issym() or member.islnk() or not (member.isdir() or member.isfile()):raise RuntimeError('Unsafe model archive')
        bundle.extractall(models,filter='data')
    archive.unlink()
if not (target/'tokens.txt').exists():raise RuntimeError('Model tokens missing')
print('Ready: '+str(target),flush=True)
