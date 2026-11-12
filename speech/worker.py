"""Local-only SenseVoice or Qwen3-ASR transcription. JSON lines on stdout; stop via stdin."""
import argparse, json, sys, threading, queue, time, os
from contextlib import redirect_stdout
from pathlib import Path
import numpy as np
import soundfile as sf

output_lock=threading.Lock()
protocol_output=sys.stdout
def emit(kind, **data):
    with output_lock:
        print(json.dumps(dict(type=kind, **data), ensure_ascii=False), flush=True, file=protocol_output)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--model',required=True)
    parser.add_argument('--engine',choices=['sensevoice','qwen3-asr'],default='sensevoice')
    parser.add_argument('--device',choices=['auto','cpu','cuda'],default='auto')
    parser.add_argument('--benchmark',action='store_true')
    parser.add_argument('--source',choices=['system','microphone','file'],required=True)
    parser.add_argument('--file')
    parser.add_argument('--self-test',action='store_true')
    args=parser.parse_args()
    if args.benchmark:
        with sf.SoundFile(args.file) as sample:
            if not 1 <= sample.frames / sample.samplerate <= 30:
                raise RuntimeError('请选择 1～30 秒的短录音进行测试')
    stop=threading.Event()
    paused=threading.Event()
    def read_control():
        for line in sys.stdin:
            command=line.strip()
            if command=='stop':stop.set();return
            if command=='pause':paused.set();emit('paused')
            if command=='resume':paused.clear();emit('resumed')
        # EOF is allowed for one-shot file transcription.
        if args.source!='file':stop.set()
    threading.Thread(target=read_control,daemon=True).start()
    model=Path(args.model)

    device = 'cpu'
    torch = None
    with redirect_stdout(sys.stderr):
        if args.engine == 'qwen3-asr':
            os.environ['HF_HUB_OFFLINE'] = '1'
            os.environ['TRANSFORMERS_OFFLINE'] = '1'
            import torch
            from qwen_asr import Qwen3ASRModel
            device = 'cuda:0' if args.device == 'cuda' or (args.device == 'auto' and torch.cuda.is_available()) else 'cpu'
            if device.startswith('cuda') and not torch.cuda.is_available():
                raise RuntimeError('CUDA 不可用，请检查 NVIDIA 驱动或选择 CPU')
            torch.set_num_threads(4)
            recognizer = Qwen3ASRModel.from_pretrained(
                str(model), dtype=torch.float16 if device.startswith('cuda') else torch.float32,
                device_map=device, attn_implementation='sdpa', local_files_only=True,
                max_inference_batch_size=1, max_new_tokens=512)
        else:
            import sherpa_onnx
            recognizer=sherpa_onnx.OfflineRecognizer.from_sense_voice(model=str(model/'model.int8.onnx'),tokens=str(model/'tokens.txt'),num_threads=4,use_itn=True,provider='cpu')
    chunk_seconds = 10 if args.engine == 'qwen3-asr' else 20
    inference_seconds = 0
    audio_seconds = 0

    def transcribe(samples,rate,start):
        nonlocal inference_seconds,audio_seconds
        samples=np.asarray(samples,dtype=np.float32)
        if samples.ndim>1:samples=samples.mean(axis=1)
        end=start+len(samples)/rate
        text=''
        # Skip silence before recognition; original timeline is preserved.
        if len(samples) and (args.self_test or float(np.sqrt(np.mean(samples*samples)))>0.002):
            started = time.perf_counter()
            with redirect_stdout(sys.stderr):
                if args.engine == 'qwen3-asr':
                    text = recognizer.transcribe(audio=(samples, rate), language=None)[0].text.strip()
                else:
                    stream=recognizer.create_stream();stream.accept_waveform(rate,samples);recognizer.decode_stream(stream);text=stream.result.text.strip()
            inference_seconds += time.perf_counter() - started
            audio_seconds += len(samples) / rate
        emit('chunk',start=round(start,3),end=round(end,3),text=text)
    if args.source=='file':
        with sf.SoundFile(args.file) as audio:
            emit('ready',device=Path(args.file).name + ' · ' + device)
            while True:
                while paused.is_set() and not stop.is_set():stop.wait(0.1)
                if stop.is_set():break
                start=audio.tell()/audio.samplerate
                samples=audio.read(audio.samplerate*chunk_seconds,dtype='float32',always_2d=True)
                if not len(samples):break
                transcribe(samples,audio.samplerate,start)
        if args.benchmark or args.self_test:
            emit('benchmark', device=device, audioSeconds=round(audio_seconds,3),
                 inferenceSeconds=round(inference_seconds,3),
                 realTimeFactor=round(inference_seconds/audio_seconds,3) if audio_seconds else None,
                 peakAllocatedMB=round(torch.cuda.max_memory_allocated()/1024**2) if torch is not None and device.startswith('cuda') else 0)
        emit('done');return
    import pyaudiowpatch as pa
    pending=queue.Queue(maxsize=12 if args.engine == 'qwen3-asr' else 100)
    with pa.PyAudio() as audio:
        capture_device=audio.get_default_wasapi_loopback() if args.source=='system' else audio.get_default_input_device_info()
        rate=int(capture_device['defaultSampleRate']);channels=int(capture_device['maxInputChannels'])
        if channels<1:raise RuntimeError('未找到可录音设备')
        block=[];frames=0;cursor=0;fatal=[]
        def callback(data,count,time_info,status):
            nonlocal frames,block,cursor
            if status:fatal.append('音频缓冲异常，请关闭其他高负载程序后重试');stop.set()
            # Discard paused audio, keeping the captured-audio timeline contiguous.
            if data and not paused.is_set():block.append(data);frames+=count
            if frames>=rate*chunk_seconds or stop.is_set():
                if frames:
                    try:pending.put_nowait((b''.join(block),cursor))
                    except queue.Full:fatal.append('转写速度跟不上录音，已停止以避免静默丢失');stop.set()
                    cursor+=frames/rate;block=[];frames=0
            return (None,pa.paComplete if stop.is_set() else pa.paContinue)
        stream=audio.open(format=pa.paFloat32,channels=channels,rate=rate,input=True,input_device_index=int(capture_device['index']),frames_per_buffer=2048,stream_callback=callback)
        emit('ready',device=capture_device['name'] + ' · ' + device + ' · ' + ('Qwen3-ASR-0.6B' if args.engine == 'qwen3-asr' else 'SenseVoice INT8'))
        try:
            while stream.is_active() or not pending.empty():
                try:data,start=pending.get(timeout=0.2)
                except queue.Empty:continue
                transcribe(np.frombuffer(data,dtype=np.float32).reshape(-1,channels),rate,start)
            if frames:transcribe(np.frombuffer(b''.join(block),dtype=np.float32).reshape(-1,channels),rate,cursor)
        finally:stream.close()
        if fatal:raise RuntimeError(fatal[0])
    emit('done')

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8');sys.stderr.reconfigure(encoding='utf-8')
    try:main()
    except Exception as error:emit('error',message=str(error));sys.exit(1)
