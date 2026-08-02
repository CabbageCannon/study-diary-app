import type { Diary } from "../types/diary";
import { TagList } from "./TagList";

interface DiaryListProps {
  diaries: Diary[];
  selectedId?: number;
  isLoading: boolean;
  onView: (diary: Diary) => void;
  onDelete: (diary: Diary) => void;
}

export function DiaryList({ diaries, selectedId, isLoading, onView, onDelete }: DiaryListProps) {
  return (
    <section className="history-panel" aria-labelledby="history-title">
      <div className="section-heading">
        <p className="eyebrow">历史</p>
        <h2 id="history-title">学习日记列表</h2>
      </div>

      {isLoading ? <p className="muted">正在加载历史记录...</p> : null}

      {!isLoading && diaries.length === 0 ? (
        <div className="empty-state">
          <p>还没有学习日记，先生成第一篇吧。</p>
        </div>
      ) : null}

      <div className="diary-list">
        {diaries.map((diary) => (
          <article className={selectedId === diary.id ? "diary-item diary-item-active" : "diary-item"} key={diary.id}>
            <div className="diary-item-main">
              <time dateTime={diary.date}>{diary.date}</time>
              <h3>{diary.title}</h3>
              <p>{diary.summary}</p>
              <TagList tags={diary.tags} />
            </div>
            <div className="diary-item-actions">
              <button className="button button-ghost" onClick={() => onView(diary)} type="button">
                查看
              </button>
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
