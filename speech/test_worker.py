"""Protocol and backend wiring checks using fake model packages; no downloads."""
import importlib.util
import io
import sys
import types
import unittest
sys.dont_write_bytecode = True
from pathlib import Path
from unittest.mock import patch

class Samples(list):
    ndim = 1

class Audio:
    samplerate = 16000
    frames = 16000
    def __init__(self, path): self.position = 0
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def tell(self): return self.position
    def read(self, count, **kwargs):
        if self.position: return Samples()
        self.position = 16000
        return Samples([0.1] * 16000)

class WorkerTests(unittest.TestCase):
    def run_worker(self, engine):
        calls = {}
        numpy = types.SimpleNamespace(float32='float32', asarray=lambda samples, **kwargs: samples)
        soundfile = types.SimpleNamespace(SoundFile=Audio)
        torch = types.SimpleNamespace(
            float16='float16', float32='float32', set_num_threads=lambda count: None,
            cuda=types.SimpleNamespace(is_available=lambda: True, max_memory_allocated=lambda: 123 * 1024**2))
        class Qwen:
            @classmethod
            def from_pretrained(cls, directory, **kwargs):
                calls['load'] = kwargs
                return cls()
            def transcribe(self, **kwargs):
                calls['audio'] = kwargs
                print('library log must not corrupt the protocol')
                return [types.SimpleNamespace(text=' Spring Boot ')]
        class Sense:
            @classmethod
            def from_sense_voice(cls, **kwargs):
                calls['sense'] = kwargs
                return cls()
            def create_stream(self):
                return types.SimpleNamespace(accept_waveform=lambda rate, samples: None,
                                             result=types.SimpleNamespace(text='轻量模型'))
            def decode_stream(self, stream): pass
        modules = {'numpy': numpy, 'soundfile': soundfile, 'torch': torch,
                   'qwen_asr': types.SimpleNamespace(Qwen3ASRModel=Qwen),
                   'sherpa_onnx': types.SimpleNamespace(OfflineRecognizer=Sense)}
        path = Path(__file__).with_name('worker.py')
        spec = importlib.util.spec_from_file_location('maji_worker', path)
        worker = importlib.util.module_from_spec(spec)
        output = io.StringIO()
        args = ['worker.py', '--model', 'local-model', '--source', 'file',
                '--file', 'short.wav', '--self-test', '--engine', engine]
        with patch.dict(sys.modules, modules), patch.object(sys, 'argv', args), patch.object(sys, 'stdin', io.StringIO()):
            spec.loader.exec_module(worker)
            worker.protocol_output = output
            worker.main()
        import json
        rows = [json.loads(line) for line in output.getvalue().splitlines()]
        return calls, rows

    def test_qwen_uses_offline_gpu_and_single_batch(self):
        calls, rows = self.run_worker('qwen3-asr')
        self.assertEqual(calls['load']['device_map'], 'cuda:0')
        self.assertTrue(calls['load']['local_files_only'])
        self.assertEqual(calls['load']['max_inference_batch_size'], 1)
        self.assertEqual(rows[1]['text'], 'Spring Boot')
        benchmark = next(row for row in rows if row['type'] == 'benchmark')
        self.assertEqual(benchmark['audioSeconds'], 1)
        self.assertEqual(benchmark['peakAllocatedMB'], 123)
        self.assertEqual(rows[-1]['type'], 'done')

    def test_sensevoice_keeps_existing_cpu_backend(self):
        calls, rows = self.run_worker('sensevoice')
        self.assertEqual(calls['sense']['provider'], 'cpu')
        self.assertEqual(rows[1]['text'], '轻量模型')
        self.assertNotIn('load', calls)

if __name__ == '__main__':
    unittest.main()
