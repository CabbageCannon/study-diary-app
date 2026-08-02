import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getInterviewQuestionSet, listInterviewQuestionSets } from "../api/interviews";
import type { InterviewQuestionSet, InterviewQuestionSetSummary } from "../types/interview";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));
}

export function InterviewHistoryPage() {
  const [sets, setSets] = useState<InterviewQuestionSetSummary[]>([]);
  const [selected, setSelected] = useState<InterviewQuestionSet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await listInterviewQuestionSets();
        setSets(data);
        if (data[0]) {
          setSelected(await getInterviewQuestionSet(data[0].id));
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "训练历史加载失败。");
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  async function selectSet(summary: InterviewQuestionSetSummary) {
    setError("");
    try {
      setSelected(await getInterviewQuestionSet(summary.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练详情加载失败。");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header"><div><span className="page-kicker">训练历史</span><h1>回看每一次表达</h1></div><p>答案版本、结构化评分和下一次复习时间会保存在对应题集中。</p></header>
      <div className="history-workbench interview-history-workbench">
        <section className="archive-list" aria-labelledby="training-history-title">
          <div className="archive-list-header"><h2 id="training-history-title">训练题集</h2><span>{isLoading ? "读取中" : `${sets.length} 组`}</span></div>
          {!isLoading && sets.length === 0 ? <div className="empty-state"><p>还没有训练记录，先开始第一组题吧。</p><Link className="button button-primary" to="/interview">开始训练</Link></div> : null}
          <div className="training-set-list">
            {sets.map((item) => <button className={selected?.id === item.id ? "training-set-item training-set-item-active" : "training-set-item"} key={item.id} onClick={() => void selectSet(item)} type="button"><time>{formatDate(item.date)}</time><strong>{item.domain ?? "综合"} · {item.topic ?? "不限主题"}</strong><span className="tabular-number">{item.answered_count}/{item.question_count} 题 · {item.average_score ?? "—"} 分</span><small>{item.status}</small></button>)}
          </div>
        </section>
        <section className="detail-panel interview-history-detail" aria-label="训练详情">
          {selected ? <div className="history-answer-list">{selected.items.map((item) => <article className="history-answer-item" key={item.id}><div><span className="pane-label">{item.order_index + 1} · {item.status}</span><h2>{item.question.question}</h2></div>{item.latest_answer ? <><p className="history-answer-text">{item.latest_answer.answer_text}</p>{item.latest_evaluation ? <p className="history-score">总分 <strong className="tabular-number">{item.latest_evaluation.total_score}</strong> · 下次复习 {item.next_review_at ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(item.next_review_at)) : "待安排"}</p> : <p className="field-error">评分未完成，可重新进入该题集评价。</p>}</> : <p className="history-answer-empty">本题尚未作答。</p>}</article>)}</div> : <div className="empty-state"><p>选择左侧题集后查看逐题记录。</p></div>}
        </section>
      </div>
      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
    </div>
  );
}
