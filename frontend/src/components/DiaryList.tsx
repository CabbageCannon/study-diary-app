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
      <div className="section-heading">
        <span>历史</span>
        <h2 id="history-title">学习日记列表</h2>
        <p>按创建时间倒序排列。</p>
      </div>

      {isLoading ? (
        <div className="list-skeleton" aria-label="正在加载历史记录">
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
            <button className="diary-item-main" onClick={() => onView(diary)} type="button">
              <time dateTime={diary.date}>{diary.date}</time>
              <h3>{diary.title}</h3>
              <p>{diary.summary}</p>
              <TagList tags={diary.tags} />
            </button>
            <div className="diary-item-actions">
              <button className="button button-danger" onClick={() => onDelete(diary)} type="button">
                删除
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
