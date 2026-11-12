"""Install SenseVoice with resumable downloads and stage progress."""
import argparse
import json
import subprocess
import tarfile
import urllib.request
import urllib.error
import venv
from pathlib import Path

NAME='sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17'
URL='https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/'+NAME+'.tar.bz2'

def progress(message, percent):
    print(json.dumps(dict(type='install-progress',message=message,percent=percent),ensure_ascii=True),flush=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--runtime',required=True)
    args=parser.parse_args()
    root=Path(args.runtime).resolve()
    root.mkdir(parents=True,exist_ok=True)
    python=root/'venv'/'Scripts'/'python.exe'
    progress('准备独立 Python 环境',2)
    if not python.exists():
        venv.create(root/'venv',with_pip=True)
    progress('安装转写依赖，已有下载缓存会复用',10)
    subprocess.run([str(python),'-m','pip','install','--disable-pip-version-check',
                    'sherpa-onnx==1.13.8','soundfile==0.14.0','numpy==2.4.6',
                    'PyAudioWPatch==0.2.12.9'],check=True)
    target=root/'models'/NAME
    archive=root/(NAME+'.tar.bz2')
    partial=archive.with_suffix('.part')
    if not all((target/file).exists() for file in ['model.int8.onnx','tokens.txt']):
        if not archive.exists():
            existing=partial.stat().st_size if partial.exists() else 0
            request=urllib.request.Request(URL,headers={'Range':'bytes=%d-'%existing} if existing else {})
            try:
                response=urllib.request.urlopen(request,timeout=60)
            except urllib.error.HTTPError as error:
                if error.code!=416:
                    raise
                response=urllib.request.urlopen(URL,timeout=60)
            with response:
                append=existing>0 and response.status==206
                if append and not response.headers.get('Content-Range','').startswith('bytes %d-'%existing):
                    raise RuntimeError('服务器返回的下载位置不匹配，请重试')
                size=existing if append else 0
                total=int(response.headers.get('Content-Length',0))+size
                with partial.open('ab' if append else 'wb') as out:
                    while True:
                        chunk=response.read(1024*1024)
                        if not chunk:
                            break
                        size+=len(chunk)
                        if size>1024*1024*1024:
                            raise RuntimeError('Model archive exceeds expected size')
                        out.write(chunk)
                        progress('下载 SenseVoice 模型 %.1f MB'%(size/1024**2),
                                 min(90,40+50*size/total) if total else 40)
            partial.replace(archive)
        progress('解压和校验模型',92)
        models=root/'models'
        models.mkdir(exist_ok=True)
        with tarfile.open(archive,'r:bz2') as bundle:
            for member in bundle.getmembers():
                path=(models/member.name).resolve()
                if not path.is_relative_to(models.resolve()) or member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
                    raise RuntimeError('Unsafe model archive')
            bundle.extractall(models,filter='data')
        archive.unlink()
    if not (target/'tokens.txt').exists():
        raise RuntimeError('Model tokens missing')
    progress('下载和安装完成，请运行自检后选择模型',100)

if __name__=='__main__':
    main()
