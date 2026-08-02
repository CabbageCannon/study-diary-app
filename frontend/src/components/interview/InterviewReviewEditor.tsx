import type { InterviewQuestion, InterviewQuestionReviewUpdate, ReviewStatus } from "../../types/interview";

interface InterviewReviewEditorProps {
  draft: InterviewQuestion;
  isSaving: boolean;
  error: string;
  onChange: (next: InterviewQuestion) => void;
  onSave: () => void;
  onRequestStatus: (status: ReviewStatus) => void;
}

function toLines(values: string[]) {
  return values.join("\n");
}

function fromLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function toReviewPayload(question: InterviewQuestion, reviewStatus?: ReviewStatus): InterviewQuestionReviewUpdate {
  return {
    question: question.question,
    difficulty: question.difficulty,
    expected_duration_seconds: question.expected_duration_seconds,
    tags: question.tags,
    reference_points: question.reference_points,
    evaluation_rubric: question.evaluation_rubric,
    common_mistakes: question.common_mistakes,
    oral_answer_outline: question.oral_answer_outline,
    reference_answer: question.reference_answer,
    follow_up_questions: question.follow_up_questions,
    quality_score: question.quality_score,
    review_status: reviewStatus ?? question.review_status,
  };
}

export function InterviewReviewEditor({ draft, isSaving, error, onChange, onSave, onRequestStatus }: InterviewReviewEditorProps) {
  function update(next: Partial<InterviewQuestion>) {
    onChange({ ...draft, ...next });
  }

  function updateRubric(index: number, patch: Partial<InterviewQuestion["evaluation_rubric"][number]>) {
    update({ evaluation_rubric: draft.evaluation_rubric.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  }

  const rubricWeight = draft.evaluation_rubric.reduce((total, item) => total + Number(item.weight || 0), 0);

  return (
    <section className="review-editor" aria-labelledby="review-editor-title" aria-busy={isSaving}>
      <div className="pane-header">
        <div>
          <span className="pane-label">逐题审核</span>
          <h2 id="review-editor-title">{draft.id}</h2>
        </div>
        <span className={`review-status review-status-${draft.review_status}`}>{draft.review_status}</span>
      </div>

      <label className="editor-field">
        <span>题目正文</span>
        <textarea value={draft.question} onChange={(event) => update({ question: event.target.value })} rows={4} />
      </label>

      <div className="interview-form-grid">
        <label className="editor-field"><span>难度</span><select value={draft.difficulty} onChange={(event) => update({ difficulty: event.target.value as InterviewQuestion["difficulty"] })}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></label>
        <label className="editor-field"><span>预计回答时间（秒）</span><input min={30} max={600} value={draft.expected_duration_seconds} onChange={(event) => update({ expected_duration_seconds: Number(event.target.value) || 30 })} type="number" /></label>
        <label className="editor-field"><span>质量评分</span><input min={0} max={100} value={draft.quality_score ?? ""} onChange={(event) => update({ quality_score: event.target.value === "" ? null : Number(event.target.value) })} type="number" /></label>
        <label className="editor-field"><span>标签（逗号分隔）</span><input value={draft.tags.join(", ")} onChange={(event) => update({ tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
      </div>

      <label className="editor-field"><span>参考要点（每行一条）</span><textarea value={toLines(draft.reference_points)} onChange={(event) => update({ reference_points: fromLines(event.target.value) })} rows={5} /></label>

      <section className="rubric-editor" aria-labelledby="rubric-title">
        <div className="field-label-row"><span id="rubric-title">评分 Rubric</span><span className={rubricWeight === 100 ? "rubric-total" : "rubric-total rubric-total-invalid"}>权重 {rubricWeight} / 100</span></div>
        {draft.evaluation_rubric.map((item, index) => (
          <div className="rubric-row" key={`${index}-${item.point}`}>
            <input value={item.point} onChange={(event) => updateRubric(index, { point: event.target.value })} aria-label={`第 ${index + 1} 条评分要点`} />
            <input value={item.weight} min={1} max={100} onChange={(event) => updateRubric(index, { weight: Number(event.target.value) || 0 })} aria-label={`第 ${index + 1} 条权重`} type="number" />
            <label><input checked={item.mandatory} onChange={(event) => updateRubric(index, { mandatory: event.target.checked })} type="checkbox" />必答</label>
            <button className="delete-link" onClick={() => update({ evaluation_rubric: draft.evaluation_rubric.filter((_, itemIndex) => itemIndex !== index) })} type="button">删除</button>
          </div>
        ))}
        <button className="button button-secondary" onClick={() => update({ evaluation_rubric: [...draft.evaluation_rubric, { point: "", weight: 0, mandatory: false }] })} type="button">新增规则</button>
      </section>

      <label className="editor-field"><span>常见错误（每行一条）</span><textarea value={toLines(draft.common_mistakes)} onChange={(event) => update({ common_mistakes: fromLines(event.target.value) })} rows={4} /></label>
      <label className="editor-field"><span>口述回答结构（每行一条）</span><textarea value={toLines(draft.oral_answer_outline)} onChange={(event) => update({ oral_answer_outline: fromLines(event.target.value) })} rows={4} /></label>
      <label className="editor-field"><span>参考回答</span><textarea value={draft.reference_answer} onChange={(event) => update({ reference_answer: event.target.value })} rows={8} /></label>
      <label className="editor-field"><span>追问（每行一条）</span><textarea value={toLines(draft.follow_up_questions)} onChange={(event) => update({ follow_up_questions: fromLines(event.target.value) })} rows={3} /></label>

      <section className="review-sources" aria-labelledby="sources-title">
        <span id="sources-title">来源（只读）</span>
        <ul>{draft.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><small>{source.source_type} · {source.license}</small></li>)}</ul>
      </section>

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="review-actions">
        <button className="button button-secondary" disabled={isSaving} onClick={onSave} type="button">保存修改</button>
        <button className="button button-primary" disabled={isSaving} onClick={() => onRequestStatus("verified")} type="button">标记 verified</button>
        <button className="button button-danger" disabled={isSaving} onClick={() => onRequestStatus("rejected")} type="button">标记 rejected</button>
      </div>
    </section>
  );
}
