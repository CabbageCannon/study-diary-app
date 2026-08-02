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
        <VoiceInput text={answerText} onTextChange={(text) => { onAnswerSourceChange("voice"); onAnswerChange(text); }} />
        <span className="character-count tabular-number">已作答 {durationSeconds} 秒</span>
      </div>

      <label className="editor-field interview-answer-field">
        <span>确认后的回答</span>
        <textarea
          disabled={disabled}
          value={answerText}
          onChange={(event) => { onAnswerSourceChange("text"); onAnswerChange(event.target.value); }}
          placeholder="可以边说边看转写，也可以直接输入。确认内容后再提交评分。"
          rows={11}
        />
      </label>
      <span className="character-count">{answerSource === "voice" ? "来源：语音转写，可继续修改" : "来源：手动输入"}</span>
    </section>
  );
}
