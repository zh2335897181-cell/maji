"""Resumable SenseVoice installer checks with an in-memory HTTP response."""
import importlib.util
import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class Response(io.BytesIO):
    status = 206
    headers = {'Content-Length': '3', 'Content-Range': 'bytes 3-5/6'}

class InstallTests(unittest.TestCase):
    def prepare(self, root):
        python = root / 'venv' / 'Scripts' / 'python.exe'
        python.parent.mkdir(parents=True)
        python.touch()
        partial = (root / (installer.NAME + '.tar.bz2')).with_suffix('.part')
        partial.write_bytes(b'abc')
        return partial

    def test_continues_partial_archive_instead_of_restarting(self):
        with tempfile.TemporaryDirectory(prefix='maji-install-test-') as temporary:
            root = Path(temporary)
            self.prepare(root)
            bundle = MagicMock()
            bundle.__enter__.return_value = bundle
            bundle.getmembers.return_value = []
            def extract(models, **kwargs):
                archive = root / (installer.NAME + '.tar.bz2')
                self.assertEqual(archive.read_bytes(), b'abcdef')
                target = models / installer.NAME
                target.mkdir()
                (target / 'model.int8.onnx').touch()
                (target / 'tokens.txt').touch()
            bundle.extractall.side_effect = extract
            with patch.object(sys, 'argv', ['install.py', '--runtime', str(root)]), patch.object(installer.subprocess, 'run'), patch.object(installer.urllib.request, 'urlopen', return_value=Response(b'def')) as request, patch.object(installer.tarfile, 'open', return_value=bundle):
                installer.main()
            self.assertEqual(request.call_args[0][0].get_header('Range'), 'bytes=3-')

    def test_rejects_a_mismatched_resume_position_without_corrupting_partial_file(self):
        with tempfile.TemporaryDirectory(prefix='maji-install-test-') as temporary:
            root = Path(temporary)
            partial = self.prepare(root)
            response = Response(b'def')
            response.headers = {'Content-Length': '3', 'Content-Range': 'bytes 9-11/12'}
            with patch.object(sys, 'argv', ['install.py', '--runtime', str(root)]), patch.object(installer.subprocess, 'run'), patch.object(installer.urllib.request, 'urlopen', return_value=response):
                with self.assertRaisesRegex(RuntimeError, '位置不匹配'):
                    installer.main()
            self.assertEqual(partial.read_bytes(), b'abc')

if __name__ == '__main__':
    unittest.main()
