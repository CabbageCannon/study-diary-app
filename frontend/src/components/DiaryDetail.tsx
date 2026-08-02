import type { Diary } from "../types/diary";
import { TagList } from "./TagList";

interface DiaryDetailProps {
  diary: Diary | null;
  title: string;
  emptyText: string;
}

export function DiaryDetail({ diary, title, emptyText }: DiaryDetailProps) {
  return (
    <section className="detail-panel" aria-labelledby={`${title}-title`}>
      <div className="section-heading">
        <span>{title}</span>
        <h2 id={`${title}-title`}>{diary ? diary.title : "暂无日记"}</h2>
      </div>

      {diary ? (
        <article className="diary-detail">
          <div className="detail-meta">
            <time dateTime={diary.date}>{diary.date}</time>
            <TagList tags={diary.tags} />
          </div>
          <p className="polished-text">{diary.polished_text}</p>
          <div className="summary-box">
            <span>总结</span>
            <p>{diary.summary}</p>
          </div>
        </article>
      ) : (
        <div className="empty-state">
          <p>{emptyText}</p>
        </div>
      )}
    </section>
  );
}
