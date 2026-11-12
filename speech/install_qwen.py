"""Install the optional Qwen ASR backend in an isolated Windows environment."""
import argparse
import subprocess
import venv
from pathlib import Path

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", required=True)
    args = parser.parse_args()
    root = Path(args.runtime).resolve()
    root.mkdir(parents=True, exist_ok=True)
    environment = root / "venv-qwen"
    python = environment / "Scripts" / "python.exe"
    if not python.exists():
        venv.create(environment, with_pip=True)
    marker = root / "models" / "Qwen3-ASR-0.6B" / ".maji-ready"
    marker.unlink(missing_ok=True)
    def pip(*packages):
        subprocess.run([str(python), "-m", "pip", "install",
                        "--disable-pip-version-check", *packages], check=True)
    pip("torch==2.10.0", "--index-url", "https://download.pytorch.org/whl/cu128")
    pip("qwen-asr==0.0.6", "PyAudioWPatch==0.2.12.9", "numpy==2.4.6",
        "soundfile==0.14.0")
    # Download with the isolated environment. The app checks decoding before activation.
    code = """
from pathlib import Path
from huggingface_hub import snapshot_download
from qwen_asr import Qwen3ASRModel
target = Path(__import__('sys').argv[1])
snapshot_download('Qwen/Qwen3-ASR-0.6B', revision='5eb1441',
                  local_dir=str(target),
                  allow_patterns=['*.json', '*.txt', '*.safetensors'])
required = ['config.json', 'model.safetensors', 'tokenizer_config.json',
            'preprocessor_config.json', 'vocab.json', 'merges.txt']
if not all((target / name).is_file() for name in required):
    raise RuntimeError('Qwen model download is incomplete')
(target / '.maji-ready').write_text('qwen-asr==0.0.6;revision=5eb1441', encoding='utf-8')
print('Qwen3-ASR-0.6B downloaded. Run the local decoder check before selecting it.', flush=True)
"""
    subprocess.run([str(python), "-c", code, str(root / "models" / "Qwen3-ASR-0.6B")], check=True)

if __name__ == "__main__":
    main()
