import { useCallback, useEffect, useMemo, useState } from "react";

import { createDiary, deleteDiary, getDiary, listDiaries } from "../api/client";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { DiaryDetail } from "../components/DiaryDetail";
import { DiaryForm } from "../components/DiaryForm";
import { DiaryList } from "../components/DiaryList";
import type { Diary } from "../types/diary";

function getToday() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function HomePage() {
  const [date, setDate] = useState(getToday);
  const [rawText, setRawText] = useState("");
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [latestDiary, setLatestDiary] = useState<Diary | null>(null);
  const [selectedDiary, setSelectedDiary] = useState<Diary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Diary | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState("");
  const [listError, setListError] = useState("");

  const selectedId = useMemo(() => selectedDiary?.id, [selectedDiary]);

  const loadDiaries = useCallback(async () => {
    setIsLoadingList(true);
    setListError("");
    try {
      const data = await listDiaries();
      setDiaries(data);
      setSelectedDiary((current) => {
        if (!current) {
          return data[0] ?? null;
        }
        return data.find((diary) => diary.id === current.id) ?? data[0] ?? null;
      });
    } catch (error) {
      setListError(error instanceof Error ? error.message : "历史记录加载失败");
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadDiaries();
  }, [loadDiaries]);

  async function handleCreateDiary() {
    const text = rawText.trim();
    if (!text) {
      setFormError("请先输入或语音识别一段学习记录。");
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    try {
      const created = await createDiary({ date, raw_text: text });
      setLatestDiary(created);
      setSelectedDiary(created);
      setDiaries((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "学习日记生成失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleViewDiary(diary: Diary) {
    setListError("");
    try {
      const detail = await getDiary(diary.id);
      setSelectedDiary(detail);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "学习日记详情加载失败");
    }
  }

  async function handleDeleteDiary() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setListError("");
    try {
      await deleteDiary(deleteTarget.id);
      setDiaries((current) => current.filter((diary) => diary.id !== deleteTarget.id));
      if (selectedDiary?.id === deleteTarget.id) {
        setSelectedDiary(null);
      }
      if (latestDiary?.id === deleteTarget.id) {
        setLatestDiary(null);
      }
      setDeleteTarget(null);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Study Diary</p>
          <h1>学习日记记录系统</h1>
          <p>用语音记录每天学到的知识，让 AI 帮你整理成学习日记。</p>
        </div>
      </header>

      <div className="workspace-grid">
        <div className="workspace-column">
          <DiaryForm
            date={date}
            rawText={rawText}
            isSubmitting={isSubmitting}
            error={formError}
            onDateChange={setDate}
            onRawTextChange={setRawText}
            onSubmit={handleCreateDiary}
          />
          <DiaryDetail diary={latestDiary} title="结果" emptyText="生成成功后，会在这里看到刚刚整理好的学习日记。" />
        </div>

        <div className="workspace-column">
          <DiaryList
            diaries={diaries}
            selectedId={selectedId}
            isLoading={isLoadingList}
            onView={handleViewDiary}
            onDelete={setDeleteTarget}
          />
          {listError ? <p className="field-error">{listError}</p> : null}
          <DiaryDetail diary={selectedDiary} title="详情" emptyText="选择一篇历史记录后，会在这里查看完整内容。" />
        </div>
      </div>

      <ConfirmDeleteDialog
        diary={deleteTarget}
        isDeleting={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteDiary}
      />
    </main>
  );
}
