from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.services.speech_service import SpeechTranscriptionError, transcribe_audio


router = APIRouter(prefix="/api/speech", tags=["speech"])
MAX_AUDIO_BYTES = 12 * 1024 * 1024


@router.post("/transcriptions")
async def create_transcription(
    file: UploadFile = File(...),
    context: str = Form(default=""),
) -> dict[str, object]:
    content = await file.read(MAX_AUDIO_BYTES + 1)
    if len(content) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="单次录音不能超过 12 MB。")
    if not content.startswith(b"RIFF") or content[8:12] != b"WAVE":
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="仅支持 WAV 录音。")

    try:
        return await transcribe_audio(
            filename=file.filename or "answer.wav",
            content=content,
            content_type="audio/wav",
            context=context.strip(),
        )
    except SpeechTranscriptionError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
