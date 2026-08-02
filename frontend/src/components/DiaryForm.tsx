import { VoiceInput } from "./VoiceInput";

interface DiaryFormProps {
  date: string;
  rawText: string;
  isSubmitting: boolean;
  error: string;
  onDateChange: (date: string) => void;
  onRawTextChange: (text: string) => void;
  onSubmit: () => void;
}

export function DiaryForm({
  date,
  rawText,
  isSubmitting,
  error,
  onDateChange,
  onRawTextChange,
  onSubmit,
}: DiaryFormProps) {
  return (
    <section className="tool-panel" aria-labelledby="composer-title">
      <div className="section-heading">
        <p className="eyebrow">输入</p>
        <h2 id="composer-title">记录今天学到的内容</h2>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>学习日期</span>
          <input value={date} onChange={(event) => onDateChange(event.target.value)} type="date" />
        </label>

        <VoiceInput text={rawText} onTextChange={onRawTextChange} />
      </div>

      <label className="field">
        <span>原始学习记录</span>
        <textarea
          value={rawText}
          onChange={(event) => onRawTextChange(event.target.value)}
          placeholder="我今天学了 React 的 useState，还看了一点 FastAPI，感觉对前后端交互更熟悉了。"
          rows={9}
        />
      </label>

      {error ? <p className="field-error">{error}</p> : null}

      <button className="button button-primary submit-button" disabled={isSubmitting} onClick={onSubmit} type="button">
        {isSubmitting ? "正在生成..." : "生成学习日记"}
      </button>
    </section>
  );
}
