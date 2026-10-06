import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { MicrophoneIcon } from "@phosphor-icons/react/Microphone";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { StopCircleIcon } from "@phosphor-icons/react/StopCircle";

import { transcribeSpeech } from "../api/speech";


type VoiceStatus = "idle" | "listening" | "transcribing" | "ended" | "unsupported" | "error";

interface VoiceInputProps {
  text: string;
  onTextChange: (nextText: string) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  context?: string;
  disabled?: boolean;
}

interface ActiveRecorder {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  sink: GainNode;
  chunks: Float32Array[];
  startedAt: number;
  lastVoiceAt: number;
  speechDetected: boolean;
  stopping: boolean;
}

const SERVER_ASR_ENABLED = import.meta.env.VITE_SERVER_ASR_ENABLED === "true";
const OUTPUT_SAMPLE_RATE = 16_000;
const SILENCE_MS = 1_800;
const NO_SPEECH_TIMEOUT_MS = 8_000;
const MAX_RECORDING_MS = 180_000;
const VOICE_RMS_THRESHOLD = 0.015;

const statusText: Record<VoiceStatus, string> = {
  idle: "未开始",
  listening: "正在聆听",
  transcribing: "正在转成文字",
  ended: "已写入",
  unsupported: "当前浏览器不支持语音输入",
  error: "语音输入出错",
};

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function supportsServerRecording() {
  return Boolean(window.AudioContext && navigator.mediaDevices?.getUserMedia);
}

function downsample(input: Float32Array, inputRate: number) {
  if (inputRate === OUTPUT_SAMPLE_RATE) return Float32Array.from(input);
  const ratio = inputRate / OUTPUT_SAMPLE_RATE;
  const output = new Float32Array(Math.max(1, Math.floor(input.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) sum += input[sourceIndex];
    output[index] = sum / (end - start);
  }
  return output;
}

function encodeWav(chunks: Float32Array[]) {
  const sampleCount = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, OUTPUT_SAMPLE_RATE, true);
  view.setUint32(28, OUTPUT_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (const value of chunk) {
      const sample = Math.max(-1, Math.min(1, value));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function browserErrorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") return "请允许麦克风权限后再试。";
  if (error === "no-speech") return "没有识别到语音，可以再试一次。";
  return "语音识别暂时不可用，请直接手动输入。";
}

export function VoiceInput({ text, onTextChange, inputRef, context = "", disabled = false }: VoiceInputProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recorderRef = useRef<ActiveRecorder | null>(null);
  const textRef = useRef(text);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<VoiceStatus>(() => {
    const supported = SERVER_ASR_ENABLED ? supportsServerRecording() : Boolean(getSpeechRecognitionConstructor());
    return supported ? "idle" : "unsupported";
  });
  const [error, setError] = useState("");

  const isListening = status === "listening";
  const isTranscribing = status === "transcribing";
  const isSupported = useMemo(
    () => SERVER_ASR_ENABLED ? supportsServerRecording() : Boolean(getSpeechRecognitionConstructor()),
    [],
  );

  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => () => {
    mountedRef.current = false;
    recognitionRef.current?.abort();
    const active = recorderRef.current;
    if (active) {
      active.stopping = true;
      active.processor.disconnect();
      active.source.disconnect();
      active.sink.disconnect();
      active.stream.getTracks().forEach((track) => track.stop());
      void active.context.close();
      recorderRef.current = null;
    }
  }, []);

  function appendTranscript(transcript: string) {
    const current = textRef.current.trim();
    const nextText = current ? `${current}\n${transcript}` : transcript;
    textRef.current = nextText;
    onTextChange(nextText);
    inputRef?.current?.focus({ preventScroll: true });
  }

  async function finishServerRecording() {
    const active = recorderRef.current;
    if (!active || active.stopping) return;
    active.stopping = true;
    recorderRef.current = null;
    active.processor.onaudioprocess = null;
    active.processor.disconnect();
    active.source.disconnect();
    active.sink.disconnect();
    active.stream.getTracks().forEach((track) => track.stop());
    await active.context.close().catch(() => undefined);

    if (!active.speechDetected) {
      if (mountedRef.current) {
        setStatus("error");
        setError("没有听到清晰语音，可以靠近麦克风再试一次。");
      }
      return;
    }

    if (mountedRef.current) setStatus("transcribing");
    try {
      const result = await transcribeSpeech(encodeWav(active.chunks), context);
      if (!result.text.trim()) throw new Error("没有识别出文字，可以再说一次。");
      if (!mountedRef.current) return;
      appendTranscript(result.text.trim());
      setStatus("ended");
    } catch (transcriptionError) {
      if (!mountedRef.current) return;
      setStatus("error");
      setError(transcriptionError instanceof Error ? transcriptionError.message : "语音转写失败，请稍后再试。");
    }
  }

  async function startServerRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const audioContext = new AudioContext({ latencyHint: "interactive" });
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const sink = audioContext.createGain();
      sink.gain.value = 0;
      source.connect(processor);
      processor.connect(sink);
      sink.connect(audioContext.destination);
      const now = performance.now();
      const active: ActiveRecorder = {
        context: audioContext,
        stream,
        source,
        processor,
        sink,
        chunks: [],
        startedAt: now,
        lastVoiceAt: now,
        speechDetected: false,
        stopping: false,
      };
      recorderRef.current = active;
      processor.onaudioprocess = (event) => {
        if (active.stopping) return;
        const samples = event.inputBuffer.getChannelData(0);
        active.chunks.push(downsample(samples, audioContext.sampleRate));
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        const currentTime = performance.now();
        if (Math.sqrt(energy / samples.length) >= VOICE_RMS_THRESHOLD) {
          active.speechDetected = true;
          active.lastVoiceAt = currentTime;
        }
        if (
          (active.speechDetected && currentTime - active.lastVoiceAt >= SILENCE_MS)
          || (!active.speechDetected && currentTime - active.startedAt >= NO_SPEECH_TIMEOUT_MS)
          || currentTime - active.startedAt >= MAX_RECORDING_MS
        ) void finishServerRecording();
      };
      setStatus("listening");
    } catch {
      setStatus("error");
      setError("请允许麦克风权限后再试。");
    }
  }

  function startBrowserRecognition() {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setStatus("unsupported");
      return;
    }
    setError("");
    const baseText = textRef.current.trim();
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => setStatus("listening");
    recognition.onresult = (event) => {
      const pieces: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) pieces.push(event.results[index][0].transcript);
      const transcript = pieces.join("").trim();
      const nextText = baseText ? `${baseText}\n${transcript}` : transcript;
      textRef.current = nextText;
      onTextChange(nextText);
    };
    recognition.onspeechend = () => recognition.stop();
    recognition.onerror = (event) => {
      setError(browserErrorMessage(event.error));
      setStatus("error");
    };
    recognition.onend = () => {
      setStatus((currentStatus) => currentStatus === "error" ? "error" : "ended");
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function startListening() {
    if (SERVER_ASR_ENABLED) void startServerRecording();
    else startBrowserRecognition();
  }

  function stopListening() {
    if (SERVER_ASR_ENABLED) void finishServerRecording();
    else recognitionRef.current?.stop();
  }

  return (
    <div className="voice-input" data-listening={isListening || undefined} data-transcribing={isTranscribing || undefined}>
      <button
        className="voice-button"
        disabled={disabled || !isSupported || isTranscribing}
        onClick={isListening ? stopListening : startListening}
        type="button"
        aria-pressed={isListening}
        aria-label={isListening ? "结束语音输入" : isTranscribing ? "正在转写语音" : "开始语音输入"}
        title={isListening ? "结束语音输入" : "开始语音输入"}
      >
        {isTranscribing ? <SpinnerGapIcon aria-hidden="true" className="action-spinner" size={20} /> : isListening ? <StopCircleIcon aria-hidden="true" size={21} weight="fill" /> : <MicrophoneIcon aria-hidden="true" size={21} weight="regular" />}
      </button>
      {status !== "idle" ? <span className="voice-status" aria-live="polite">{statusText[status]}</span> : null}
      {status === "unsupported" ? <p className="field-error">当前浏览器不支持语音输入，可以继续手动输入。</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
