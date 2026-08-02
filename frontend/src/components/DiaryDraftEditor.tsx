import { useEffect, useState } from "react";

import type { DiaryDraft } from "../types/diary";

interface DiaryDraftEditorProps {
  draft: DiaryDraft;
  feedback: string;
  isRewriting: boolean;
  isSaving: boolean;
  error: string;
  onDraftChange: (draft: DiaryDraft) => void;
  onFeedbackChange: (feedback: string) => void;
  onRewrite: () => void;
  onSave: () => void;
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function DiaryDraftEditor({
  draft,
  feedback,
  isRewriting,
  isSaving,
  error,
  onDraftChange,
  onFeedbackChange,
  onRewrite,
  onSave,
}: DiaryDraftEditorProps) {
  const [tagText, setTagText] = useState(draft.tags.join(", "));

  useEffect(() => {
    setTagText(draft.tags.join(", "));
  }, [draft.tags]);

  function updateDraft(nextPatch: Partial<DiaryDraft>) {
    onDraftChange({ ...draft, ...nextPatch });
  }

  return (
    <section className="draft-pane" aria-labelledby="draft-title" aria-busy={isRewriting || isSaving}>
      <div className="pane-header">
        <div>
          <span className="pane-label">草稿检查</span>
          <h2 id="draft-title">确认后再归档</h2>
        </div>
        <time className="draft-date" dateTime={draft.date}>
          {draft.date}
        </time>
      </div>

      <label className="editor-field editor-field-title">
        <span>标题</span>
        <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} aria-label="草稿标题" />
      </label>

      <label className="editor-field">
        <span className="field-label-row">
          <span>正文</span>
          <span className="character-count">{draft.polished_text.length} 字</span>
        </span>
        <textarea
          className="draft-body"
          value={draft.polished_text}
          onChange={(event) => updateDraft({ polished_text: event.target.value })}
          rows={12}
        />
      </label>

      <div className="draft-meta-grid">
        <label className="editor-field">
          <span>总结</span>
          <textarea value={draft.summary} onChange={(event) => updateDraft({ summary: event.target.value })} rows={4} />
        </label>

        <label className="editor-field">
          <span>标签</span>
          <input
            value={tagText}
            onBlur={() => updateDraft({ tags: parseTags(tagText) })}
            onChange={(event) => {
              const nextTagText = event.target.value;
              setTagText(nextTagText);
              updateDraft({ tags: parseTags(nextTagText) });
            }}
            placeholder="React, FastAPI, 前后端交互"
          />
          <small>用英文逗号分隔，保存时会转成标签列表。</small>
        </label>
      </div>

      <div className="rewrite-block">
        <label className="editor-field">
          <span>修改意见</span>
          <textarea
            value={feedback}
            onChange={(event) => onFeedbackChange(event.target.value)}
            placeholder="例如：这段太正式了，写得更像学生自己的日记。"
            rows={4}
          />
        </label>
        <div className="rewrite-actions">
          <p>重新生成只会更新当前草稿，不会写入历史记录。</p>
          <button className="button button-secondary" disabled={isRewriting || isSaving} onClick={onRewrite} type="button">
            {isRewriting ? "正在重新整理..." : "重新生成"}
          </button>
        </div>
      </div>

      {error ? <p className="field-error">{error}</p> : null}

      <div className="draft-actions">
        <button className="button button-primary" disabled={isRewriting || isSaving} onClick={onSave} type="button">
          {isSaving ? "保存中..." : "保存日记"}
        </button>
      </div>
    </section>
  );
}
