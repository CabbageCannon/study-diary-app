import type { ReactNode } from "react";

import type { Diary } from "../types/diary";
import { TagList } from "./TagList";

interface DiaryListProps {
  diaries: Diary[];
  selectedId?: number;
  isLoading: boolean;
  onView: (diary: Diary) => void;
  onDelete: (diary: Diary) => void;
  emptyAction?: ReactNode;
}

export function DiaryList({ diaries, selectedId, isLoading, onView, onDelete, emptyAction }: DiaryListProps) {
  return (
    <section className="archive-list" aria-labelledby="history-title">
      <div className="archive-list-header">
        <h2 id="history-title">日记目录</h2>
        <span>{isLoading ? "读取中" : `${diaries.length} 篇`}</span>
      </div>

      {isLoading ? (
        <div className="list-skeleton" aria-label="正在加载历史记录" aria-live="polite">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      {!isLoading && diaries.length === 0 ? (
        <div className="empty-state">
          <p>还没有学习日记，先生成第一篇吧。</p>
          {emptyAction ? <div>{emptyAction}</div> : null}
        </div>
      ) : null}

      <div className="diary-list">
        {diaries.map((diary) => (
          <article className={selectedId === diary.id ? "diary-item diary-item-active" : "diary-item"} key={diary.id}>
            <button
              className="diary-item-main"
              onClick={() => onView(diary)}
              type="button"
              aria-pressed={selectedId === diary.id}
            >
              <time dateTime={diary.date}>{diary.date}</time>
              <h3>{diary.title}</h3>
              <p>{diary.summary}</p>
              <TagList tags={diary.tags} />
            </button>
            <div className="diary-item-actions">
              <button
                className="delete-link"
                onClick={() => onDelete(diary)}
                type="button"
                aria-label={`删除《${diary.title}》`}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
