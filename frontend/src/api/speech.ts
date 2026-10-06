import { request } from "./client";


interface SpeechTranscription {
  text: string;
  model: string;
  processing_ms: number;
}


export function transcribeSpeech(audio: Blob, context = "") {
  const form = new FormData();
  form.append("file", audio, "answer.wav");
  if (context.trim()) form.append("context", context.trim());
  return request<SpeechTranscription>("/api/speech/transcriptions", {
    method: "POST",
    body: form,
  });
}
