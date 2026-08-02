import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { deleteDiary, getDiary, listDiaries } from "../api/client";
import { ConfirmDeleteDialog } from "../components/ConfirmDeleteDialog";
import { DiaryDetail } from "../components/DiaryDetail";
import { DiaryList } from "../components/DiaryList";
import type { Diary } from "../types/diary";

export function HistoryPage() {
  const [searchParams] = useSearchParams();
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [selectedDiary, setSelectedDiary] = useState<Diary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Diary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const preferredDiaryId = Number(searchParams.get("diaryId"));

  const loadDiaries = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await listDiaries();
      setDiaries(data);
      const preferred = Number.isFinite(preferredDiaryId)
        ? data.find((diary) => diary.id === preferredDiaryId)
        : undefined;
      setSelectedDiary(preferred ?? data[0] ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "历史记录加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [preferredDiaryId]);

  useEffect(() => {
    void loadDiaries();
  }, [loadDiaries]);

  async function handleViewDiary(diary: Diary) {
    setError("");
    try {
      const detail = await getDiary(diary.id);
      setSelectedDiary(detail);
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : "学习日记详情加载失败");
    }
  }

  async function handleDeleteDiary() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setError("");
    try {
      await deleteDiary(deleteTarget.id);
      const nextDiaries = diaries.filter((diary) => diary.id !== deleteTarget.id);
      setDiaries(nextDiaries);
      if (selectedDiary?.id === deleteTarget.id) {
        setSelectedDiary(nextDiaries[0] ?? null);
      }
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="page-kicker">Archive</span>
          <h1>安静地回看学过的内容</h1>
        </div>
        <p>历史日记只展示已经确认保存的内容，草稿不会出现在这里。</p>
      </header>

      <div className="history-layout">
        <DiaryList
          diaries={diaries}
          selectedId={selectedDiary?.id}
          isLoading={isLoading}
          onView={handleViewDiary}
          onDelete={setDeleteTarget}
          emptyAction={
            <Link className="button button-primary" to="/write">
              写第一篇
            </Link>
          }
        />

        <DiaryDetail diary={selectedDiary} title="详情" emptyText="选择左侧的一篇日记，完整内容会在这里展开。" />
      </div>

      {error ? <p className="field-error page-error">{error}</p> : null}

      <ConfirmDeleteDialog
        diary={deleteTarget}
        isDeleting={isDeleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteDiary}
      />
    </div>
  );
}
