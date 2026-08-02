import type { Diary } from "../types/diary";
import { TagList } from "./TagList";

interface DiaryDetailProps {
  diary: Diary | null;
  title: string;
  emptyText: string;
}

export function DiaryDetail({ diary, title, emptyText }: DiaryDetailProps) {
  return (
    <section className="detail-panel" aria-label={title}>
      {diary ? (
        <article className="diary-detail">
          <header className="detail-header">
            <time dateTime={diary.date}>{diary.date}</time>
            <h2>{diary.title}</h2>
          </header>
          <div className="polished-text">{diary.polished_text}</div>
          <div className="summary-box">
            <span>总结</span>
            <p>{diary.summary}</p>
          </div>
          <TagList tags={diary.tags} />
        </article>
      ) : (
        <div className="empty-state">
          <p>{emptyText}</p>
        </div>
      )}
    </section>
  );
}
