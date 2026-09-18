# SenseVoice speech service

This service exposes the quantized `iic/SenseVoiceSmall-onnx` model through an OpenAI-compatible transcription endpoint.

```bash
docker build -t study-diary-asr .
docker run --rm -p 8001:8000 -e ASR_SHARED_SECRET=change-me study-diary-asr
```

Configure the main backend with:

```env
ASR_BASE_URL=http://127.0.0.1:8001
ASR_API_KEY=change-me
ASR_MODEL=sensevoice
```

The measured process peak is close to 500 MB for a 15-second recording. Use a separate service with at least 1 GB RAM; do not load it into the existing 512 MB Render API instance.
