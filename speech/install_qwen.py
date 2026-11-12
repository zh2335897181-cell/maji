"""Install the optional Qwen ASR backend in an isolated Windows environment."""
import argparse
import json
import subprocess
import venv
from pathlib import Path

def progress(message, percent):
    print(json.dumps(dict(type='install-progress', message=message, percent=percent), ensure_ascii=True), flush=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", required=True)
    args = parser.parse_args()
    root = Path(args.runtime).resolve()
    root.mkdir(parents=True, exist_ok=True)
    progress('准备独立 Python 环境', 2)
    environment = root / "venv-qwen"
    python = environment / "Scripts" / "python.exe"
    if not python.exists():
        venv.create(environment, with_pip=True)
    marker = root / "models" / "Qwen3-ASR-0.6B" / ".maji-ready"
    marker.unlink(missing_ok=True)
    def pip(*packages):
        subprocess.run([str(python), "-m", "pip", "install",
                        "--disable-pip-version-check", *packages], check=True)
    progress('安装 CUDA 与 PyTorch，已有下载缓存会复用', 8)
    pip("torch==2.10.0", "--index-url", "https://download.pytorch.org/whl/cu128")
    progress('安装语音识别依赖', 35)
    pip("qwen-asr==0.0.6", "PyAudioWPatch==0.2.12.9", "numpy==2.4.6",
        "soundfile==0.14.0")
    # Download with the isolated environment. The app checks decoding before activation.
    progress('下载 Qwen 模型，自动继续未完成的文件', 50)
    code = """
from pathlib import Path
from huggingface_hub import snapshot_download
from qwen_asr import Qwen3ASRModel
from tqdm.auto import tqdm
import json
class DownloadProgress(tqdm):
    def update(self, n=1):
        result = super().update(n)
        if self.total:
            print(json.dumps(dict(type='install-progress',
                message='下载模型文件 %s / %s' % (self.n, self.total),
                percent=min(94, 50 + 44 * self.n / self.total)), ensure_ascii=True), flush=True)
        return result
target = Path(__import__('sys').argv[1])
snapshot_download('Qwen/Qwen3-ASR-0.6B', revision='5eb1441',
                  local_dir=str(target), tqdm_class=DownloadProgress,
                  allow_patterns=['*.json', '*.txt', '*.safetensors'])
print(json.dumps(dict(type='install-progress', message='校验模型文件', percent=95)), flush=True)
required = ['config.json', 'model.safetensors', 'tokenizer_config.json',
            'preprocessor_config.json', 'vocab.json', 'merges.txt']
if not all((target / name).is_file() for name in required):
    raise RuntimeError('Qwen model download is incomplete')
(target / '.maji-ready').write_text('qwen-asr==0.0.6;revision=5eb1441', encoding='utf-8')
print('Qwen3-ASR-0.6B downloaded. Run the local decoder check before selecting it.', flush=True)
"""
    subprocess.run([str(python), "-c", code, str(root / "models" / "Qwen3-ASR-0.6B")], check=True)
    progress('下载和安装完成，请运行自检后选择模型', 100)

if __name__ == "__main__":
    main()
