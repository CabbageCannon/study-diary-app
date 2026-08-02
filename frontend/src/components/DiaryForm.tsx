import { VoiceInput } from "./VoiceInput";

interface DiaryFormProps {
  date: string;
  rawText: string;
  isGenerating: boolean;
  error: string;
  onDateChange: (date: string) => void;
  onRawTextChange: (text: string) => void;
  onGenerateDraft: () => void;
}

export function DiaryForm({
  date,
  rawText,
  isGenerating,
  error,
  onDateChange,
  onRawTextChange,
  onGenerateDraft,
}: DiaryFormProps) {
  return (
    <section className="workspace-section input-section" aria-labelledby="composer-title">
      <div className="section-heading">
        <span>原始输入</span>
        <h2 id="composer-title">先把今天学到的事写下来</h2>
        <p>可以语音识别，也可以直接输入。草稿生成前不会写入历史记录。</p>
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

      <button className="button button-primary submit-button" disabled={isGenerating} onClick={onGenerateDraft} type="button">
        {isGenerating ? "正在生成草稿..." : "生成草稿"}
      </button>
    </section>
  );
}
