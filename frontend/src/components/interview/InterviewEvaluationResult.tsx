import type { InterviewAnswerSubmission } from "../../types/interview";

interface InterviewEvaluationResultProps {
  result: InterviewAnswerSubmission;
}

function formatLocalTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "待重新评价后安排";
}

export function InterviewEvaluationResult({ result }: InterviewEvaluationResultProps) {
  if (result.evaluation_status === "failed" || !result.evaluation) {
    return (
      <section className="evaluation-result evaluation-result-error" aria-live="polite">
        <span className="pane-label">回答已保存</span>
        <h2>评分暂时没有完成</h2>
        <p>{result.evaluation_error ?? "可以稍后重新评价，这次回答不会丢失。"}</p>
      </section>
    );
  }

  const evaluation = result.evaluation;
  return (
    <section className="evaluation-result" aria-live="polite" aria-labelledby="evaluation-title">
      <div className="evaluation-header">
        <div>
          <span className="pane-label">结构化评价</span>
          <h2 id="evaluation-title">总分 <strong className="tabular-number">{evaluation.total_score}</strong></h2>
        </div>
        <span className="review-time">下次复习：{formatLocalTime(result.next_review_at)}</span>
      </div>

      <div className="score-grid" aria-label="评分明细">
        <span><b className="tabular-number">{evaluation.correctness_score}</b>正确性</span>
        <span><b className="tabular-number">{evaluation.completeness_score}</b>完整性</span>
        <span><b className="tabular-number">{evaluation.structure_score}</b>表达结构</span>
        <span><b className="tabular-number">{evaluation.oral_clarity_score}</b>口述清晰度</span>
      </div>

      <div className="evaluation-grid">
        <section><h3>答对的部分</h3><ul>{evaluation.matched_points.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><h3>需要纠正</h3><ul>{evaluation.incorrect_points.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <section><h3>遗漏要点</h3><ul>{evaluation.missing_points.map((item) => <li key={item}>{item}</li>)}</ul></section>
      </div>
      <section className="improved-answer"><h3>优化后的口述回答</h3><p>{evaluation.improved_answer}</p></section>
      {evaluation.follow_up_questions.length ? (
        <section className="evaluation-followups"><h3>可能的追问</h3><ul>{evaluation.follow_up_questions.map((item) => <li key={item}>{item}</li>)}</ul></section>
      ) : null}
    </section>
  );
}
