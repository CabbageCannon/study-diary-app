import { useRef } from "react";
import { VoiceInput } from "./VoiceInput";
import { HoverDatePicker } from "./HoverDatePicker";

interface DiaryFormProps {
  date: string;
  rawText: string;
  isGenerating: boolean;
  draftStorageStatus: string;
  error: string;
  onDateChange: (date: string) => void;
  onRawTextChange: (text: string) => void;
  onGenerateDraft: () => void;
}

export function DiaryForm({
  date,
  rawText,
  isGenerating,
  draftStorageStatus,
  error,
  onDateChange,
  onRawTextChange,
  onGenerateDraft,
}: DiaryFormProps) {
  const rawTextRef = useRef<HTMLTextAreaElement | null>(null);
  return (
    <section className="input-pane" aria-labelledby="composer-title" aria-busy={isGenerating}>
      <div className="pane-header">
        <div>
          <span className="pane-label">原始记录</span>
          <h2 id="composer-title">把今天学到的事写下来</h2>
        </div>
        <div className="date-field">
          <span>学习日期</span>
          <HoverDatePicker value={date} onChange={onDateChange} />
        </div>
      </div>

      <div className="composer-toolbar">
        <p>可以直接输入，也可以点输入框里的麦克风补充。生成前不会写入历史记录。</p>
      </div>

      <div className="editor-field raw-editor-field">
        <label className="visually-hidden" htmlFor="diary-raw-text">原始学习记录</label>
        <div className="voice-textarea-shell">
          <textarea
            className="raw-editor"
            id="diary-raw-text"
            ref={rawTextRef}
            value={rawText}
            onChange={(event) => onRawTextChange(event.target.value)}
            placeholder="记录今天学到的内容、遇到的问题，以及还没有想明白的地方..."
            rows={18}
          />
          <VoiceInput inputRef={rawTextRef} text={rawText} onTextChange={onRawTextChange} />
        </div>
      </div>

      <div className="composer-footer">
        <div>
          <span className="character-count" aria-live="polite">
            {rawText.length} 字
          </span>
          {draftStorageStatus ? <span className="draft-storage-status" aria-live="polite">{draftStorageStatus}</span> : null}
          {error ? <p className="field-error">{error}</p> : null}
        </div>
        <button className="button button-primary" disabled={isGenerating} onClick={onGenerateDraft} type="button">
          {isGenerating ? "正在整理..." : "生成草稿"}
        </button>
      </div>
    </section>
  );
}
