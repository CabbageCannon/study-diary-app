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
        <h2>暂时没有核对结果。</h2>
        <p>{result.evaluation_error ?? "可以稍后重新核对，这次回答不会丢失。"}</p>
      </section>
    );
  }

  const evaluation = result.evaluation;
  const headline = evaluation.total_score >= 82 ? "思路成立。" : evaluation.total_score >= 62 ? "还差一步。" : "需要再补一轮。";
  const strongestPoints = evaluation.matched_points.slice(0, 3);
  const missingPoints = [...evaluation.incorrect_points, ...evaluation.missing_points].slice(0, 3);

  return (
    <section className="evaluation-result" aria-live="polite" aria-labelledby="evaluation-title">
      <div className="evaluation-header">
        <div>
          <span className="pane-label">这次核对</span>
          <h2 id="evaluation-title">{headline}</h2>
        </div>
        <span className="review-time">下次复习：{formatLocalTime(result.next_review_at)}</span>
      </div>

      {strongestPoints.length ? <section className="feedback-block feedback-block-good"><h3>你已说对</h3><ul>{strongestPoints.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
      {missingPoints.length ? <section className="feedback-block"><h3>最值得补充</h3><ul>{missingPoints.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}

      <details className="feedback-details">
        <summary>查看完整评分与参考表达</summary>
        <div className="score-grid" aria-label="评分明细">
          <span><b className="tabular-number">{evaluation.correctness_score}</b>正确性</span>
          <span><b className="tabular-number">{evaluation.completeness_score}</b>完整性</span>
          <span><b className="tabular-number">{evaluation.structure_score}</b>表达结构</span>
          <span><b className="tabular-number">{evaluation.oral_clarity_score}</b>口述清晰度</span>
        </div>
        <section className="improved-answer"><h3>优化后的口述回答</h3><p>{evaluation.improved_answer}</p></section>
        {evaluation.follow_up_questions.length ? (
          <section className="evaluation-followups"><h3>可能的追问</h3><ul>{evaluation.follow_up_questions.map((item) => <li key={item}>{item}</li>)}</ul></section>
        ) : null}
      </details>
    </section>
  );
}
