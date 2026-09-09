import { useRef } from "react";
import { VoiceInput } from "../VoiceInput";
import type { AnswerSource, InterviewQuestionForTraining } from "../../types/interview";

interface InterviewQuestionPanelProps {
  question: InterviewQuestionForTraining;
  answerText: string;
  answerSource: AnswerSource;
  durationSeconds: number;
  disabled: boolean;
  onAnswerChange: (value: string) => void;
  onAnswerSourceChange: (value: AnswerSource) => void;
}

const difficultyLabel = { easy: "简单", medium: "中等", hard: "困难" };

export function InterviewQuestionPanel({
  question,
  answerText,
  answerSource,
  durationSeconds,
  disabled,
  onAnswerChange,
  onAnswerSourceChange,
}: InterviewQuestionPanelProps) {
  const answerRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <section className="interview-question-panel" aria-labelledby="interview-question-title">
      <div className="question-meta">
        <span>{question.domain}</span>
        <span>{question.topic}</span>
        <span>{difficultyLabel[question.difficulty]}</span>
        <span>建议 {question.expected_duration_seconds} 秒</span>
      </div>
      <h1 id="interview-question-title">{question.question}</h1>
      <div className="question-tags" aria-label="题目标签">
        {question.tags.map((tag) => <span key={tag}>#{tag}</span>)}
      </div>

      <div className="answer-toolbar">
        <span className="character-count tabular-number">已作答 {durationSeconds} 秒</span>
      </div>

      <div className="editor-field interview-answer-field">
        <label htmlFor="interview-answer">我的回答</label>
        <div className="voice-textarea-shell">
          <textarea
            disabled={disabled}
            id="interview-answer"
            ref={answerRef}
            value={answerText}
            onChange={(event) => { onAnswerSourceChange("text"); onAnswerChange(event.target.value); }}
            placeholder="直接讲出你的思路，说完会自动结束并写入这里。"
            rows={11}
          />
          <VoiceInput inputRef={answerRef} text={answerText} onTextChange={(text) => { onAnswerSourceChange("voice"); onAnswerChange(text); }} />
        </div>
      </div>
      <span className="character-count">{answerSource === "voice" ? "来源：语音转写，可继续修改" : "本机草稿会自动保留"}</span>
    </section>
  );
}
