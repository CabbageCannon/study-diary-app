import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { createDiaryDraft, rewriteDiaryDraft, saveDiary } from "../api/client";
import { DiaryDraftEditor } from "../components/DiaryDraftEditor";
import { DiaryForm } from "../components/DiaryForm";
import type { DiaryDraft, DiaryDraftContent } from "../types/diary";

function getToday() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function toDraftContent(draft: DiaryDraft): DiaryDraftContent {
  return {
    title: draft.title,
    polished_text: draft.polished_text,
    summary: draft.summary,
    tags: draft.tags,
  };
}

function validateDraft(draft: DiaryDraft) {
  if (!draft.title.trim()) {
    return "请补充草稿标题。";
  }
  if (!draft.polished_text.trim()) {
    return "请补充草稿正文。";
  }
  if (!draft.summary.trim()) {
    return "请补充草稿总结。";
  }
  if (draft.tags.length === 0) {
    return "请至少保留一个标签。";
  }
  return "";
}

export function WriteDiaryPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(getToday);
  const [rawText, setRawText] = useState("");
  const [draft, setDraft] = useState<DiaryDraft | null>(null);
  const [feedback, setFeedback] = useState("");
  const [inputError, setInputError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function handleDateChange(nextDate: string) {
    setDate(nextDate);
    setDraft((currentDraft) => (currentDraft ? { ...currentDraft, date: nextDate } : currentDraft));
  }

  function handleRawTextChange(nextText: string) {
    setRawText(nextText);
    setDraft((currentDraft) => (currentDraft ? { ...currentDraft, raw_text: nextText } : currentDraft));
  }

  async function handleGenerateDraft() {
    const text = rawText.trim();
    if (!text) {
      setInputError("请先输入或语音识别一段学习记录。");
      return;
    }

    setIsGenerating(true);
    setInputError("");
    setDraftError("");
    try {
      const nextDraft = await createDiaryDraft({ date, raw_text: text });
      setDraft(nextDraft);
      setFeedback("");
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "草稿生成失败，请稍后重试。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRewriteDraft() {
    if (!draft) {
      return;
    }

    const trimmedFeedback = feedback.trim();
    if (!trimmedFeedback) {
      setDraftError("请先输入修改意见。");
      return;
    }

    setIsRewriting(true);
    setDraftError("");
    try {
      const nextDraft = await rewriteDiaryDraft({
        date: draft.date,
        raw_text: draft.raw_text,
        current_draft: toDraftContent(draft),
        feedback: trimmedFeedback,
      });
      setDraft(nextDraft);
      setFeedback("");
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "重新生成失败，请稍后重试。");
    } finally {
      setIsRewriting(false);
    }
  }

  async function handleSaveDraft() {
    if (!draft) {
      return;
    }

    const validationError = validateDraft(draft);
    if (validationError) {
      setDraftError(validationError);
      return;
    }

    setIsSaving(true);
    setDraftError("");
    try {
      const saved = await saveDiary({
        ...draft,
        title: draft.title.trim(),
        raw_text: draft.raw_text.trim(),
        polished_text: draft.polished_text.trim(),
        summary: draft.summary.trim(),
        tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
      });
      navigate(`/history?diaryId=${saved.id}`);
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "保存失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-stack write-page">
      <header className="page-header">
        <div>
          <span className="page-kicker">Write</span>
          <h1>写一篇可以先检查的学习日记</h1>
        </div>
        <p>先把原始记录整理成草稿，确认、修改或重写后，再保存到历史归档。</p>
      </header>

      <DiaryForm
        date={date}
        rawText={rawText}
        isGenerating={isGenerating}
        error={inputError}
        onDateChange={handleDateChange}
        onRawTextChange={handleRawTextChange}
        onGenerateDraft={handleGenerateDraft}
      />

      {draft ? (
        <DiaryDraftEditor
          draft={draft}
          feedback={feedback}
          isRewriting={isRewriting}
          isSaving={isSaving}
          error={draftError}
          onDraftChange={setDraft}
          onFeedbackChange={setFeedback}
          onRewrite={handleRewriteDraft}
          onSave={handleSaveDraft}
        />
      ) : (
        <section className="quiet-note" aria-label="草稿状态">
          <p>草稿会在生成后出现在这里。当前内容只停留在编辑区，还没有保存进历史记录。</p>
        </section>
      )}
    </div>
  );
}
