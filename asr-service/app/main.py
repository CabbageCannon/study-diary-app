import io
import os
import re
import threading
import wave
from contextlib import asynccontextmanager
from hmac import compare_digest
from time import perf_counter

import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from funasr_onnx import SenseVoiceSmall


MODEL_PATH = os.getenv("SENSEVOICE_MODEL_PATH", "/models/sensevoice")
MODEL_THREADS = max(1, int(os.getenv("SENSEVOICE_THREADS", "2")))
SHARED_SECRET = os.getenv("ASR_SHARED_SECRET", "").strip()
MAX_AUDIO_BYTES = 12 * 1024 * 1024
MAX_AUDIO_SECONDS = 180
CHUNK_SECONDS = 25
OVERLAP_SECONDS = 0.6
TAG_PATTERN = re.compile(r"<\|[^|]+\|>")

model: SenseVoiceSmall | None = None
model_lock = threading.Lock()


def read_pcm_wav(content: bytes) -> tuple[np.ndarray, int]:
    try:
        with wave.open(io.BytesIO(content), "rb") as audio:
            if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
                raise ValueError("WAV 必须是单声道 16-bit PCM。")
            sample_rate = audio.getframerate()
            samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
    except wave.Error as exc:
        raise ValueError("WAV 文件无效。") from exc
    if sample_rate != 16_000:
        raise ValueError("WAV 采样率必须是 16000 Hz。")
    if samples.size / sample_rate > MAX_AUDIO_SECONDS:
        raise ValueError("单次录音不能超过 3 分钟。")
    return samples, sample_rate


def merge_transcripts(parts: list[str]) -> str:
    merged = ""
    for part in (item.strip() for item in parts if item.strip()):
        if not merged:
            merged = part
            continue
        overlap = 0
        for size in range(min(80, len(merged), len(part)), 1, -1):
            if merged[-size:].casefold() == part[:size].casefold():
                overlap = size
                break
        if overlap:
            merged += part[overlap:]
        else:
            separator = " " if merged[-1:].isascii() and part[:1].isascii() else ""
            merged += separator + part
    return merged


def transcribe_samples(samples: np.ndarray, sample_rate: int) -> str:
    if model is None:
        raise RuntimeError("模型尚未载入。")
    chunk_size = CHUNK_SECONDS * sample_rate
    step = int((CHUNK_SECONDS - OVERLAP_SECONDS) * sample_rate)
    parts: list[str] = []
    with model_lock:
        for start in range(0, samples.size, step):
            chunk = samples[start:start + chunk_size]
            if chunk.size < sample_rate // 4:
                break
            raw = model(chunk, language="auto", textnorm="withitn")[0]
            parts.append(TAG_PATTERN.sub("", raw).strip())
            if start + chunk_size >= samples.size:
                break
    return merge_transcripts(parts)


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model
    model = await run_in_threadpool(
        SenseVoiceSmall,
        MODEL_PATH,
        batch_size=1,
        quantize=True,
        intra_op_num_threads=MODEL_THREADS,
    )
    yield
    model = None


app = FastAPI(title="Study Diary SenseVoice API", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok" if model is not None else "loading"}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model_name: str = Form(default="sensevoice", alias="model"),
    response_format: str = Form(default="json"),
    prompt: str = Form(default=""),
    authorization: str = Header(default=""),
) -> dict[str, object] | str:
    del model_name, prompt
    if SHARED_SECRET and not compare_digest(authorization, f"Bearer {SHARED_SECRET}"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    content = await file.read(MAX_AUDIO_BYTES + 1)
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Audio is too large")
    try:
        samples, sample_rate = read_pcm_wav(content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    started_at = perf_counter()
    text = await run_in_threadpool(transcribe_samples, samples, sample_rate)
    processing_ms = round((perf_counter() - started_at) * 1000)
    if response_format == "text":
        return text
    return {"text": text, "model": "sensevoice-int8", "processing_ms": processing_ms}
