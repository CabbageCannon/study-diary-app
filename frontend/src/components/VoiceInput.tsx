import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { MicrophoneIcon } from "@phosphor-icons/react/Microphone";
import { StopCircleIcon } from "@phosphor-icons/react/StopCircle";

type VoiceStatus = "idle" | "listening" | "ended" | "unsupported" | "error";

interface VoiceInputProps {
  text: string;
  onTextChange: (nextText: string) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

const statusText: Record<VoiceStatus, string> = {
  idle: "未开始",
  listening: "正在聆听",
  ended: "已结束",
  unsupported: "当前浏览器不支持语音识别",
  error: "语音识别出错",
};

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function getErrorMessage(error: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "浏览器没有麦克风权限，请允许访问后再试，或直接手动输入。";
  }
  if (error === "no-speech") {
    return "没有识别到语音，可以再试一次，或直接手动输入。";
  }
  return "语音识别暂时不可用，请直接手动输入。";
}

export function VoiceInput({ text, onTextChange, inputRef }: VoiceInputProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseTextRef = useRef("");
  const [status, setStatus] = useState<VoiceStatus>(() =>
    getSpeechRecognitionConstructor() ? "idle" : "unsupported",
  );
  const [error, setError] = useState("");

  const isListening = status === "listening";
  const isSupported = useMemo(() => Boolean(getSpeechRecognitionConstructor()), []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  function startListening() {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setStatus("unsupported");
      return;
    }

    setError("");
    baseTextRef.current = text.trim();

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setStatus("listening");
    };

    recognition.onresult = (event) => {
      const pieces: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        pieces.push(event.results[index][0].transcript);
      }

      const transcript = pieces.join("").trim();
      const baseText = baseTextRef.current;
      const nextText = baseText ? `${baseText}\n${transcript}` : transcript;
      onTextChange(nextText);
    };

    recognition.onspeechend = () => recognition.stop();

    recognition.onerror = (event) => {
      setError(getErrorMessage(event.error));
      setStatus("error");
    };

    recognition.onend = () => {
      setStatus((currentStatus) => (currentStatus === "error" ? "error" : "ended"));
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    inputRef?.current?.focus({ preventScroll: true });
  }

  function stopListening() {
    recognitionRef.current?.stop();
  }

  return (
    <div className="voice-input" data-listening={isListening || undefined}>
      <button
        className="voice-button"
        disabled={!isSupported}
        onClick={isListening ? stopListening : startListening}
        type="button"
        aria-pressed={isListening}
        aria-label={isListening ? "结束语音输入" : "开始语音输入"}
        title={isListening ? "结束语音输入" : "开始语音输入"}
      >
        {isListening ? <StopCircleIcon aria-hidden="true" size={21} weight="fill" /> : <MicrophoneIcon aria-hidden="true" size={21} weight="regular" />}
      </button>
      {status !== "idle" ? <span className="voice-status" aria-live="polite">{statusText[status]}</span> : null}
      {status === "unsupported" ? <p className="field-error">当前浏览器不支持语音识别，可以继续手动输入。</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}
