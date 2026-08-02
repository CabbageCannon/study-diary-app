import type { InterviewQuestion, InterviewQuestionReviewUpdate, ReviewStatus } from "../../types/interview";

interface InterviewReviewEditorProps {
  draft: InterviewQuestion;
  isSaving: boolean;
  error: string;
  aiReviewEnabled: boolean;
  quickPublishEnabled: boolean;
  onChange: (next: InterviewQuestion) => void;
  onSave: () => void;
  onRequestStatus: (status: ReviewStatus) => void;
  onAiReview: () => void;
  onApplyAiReview: () => void;
  onKeepPending: () => void;
  onQuickPublish: () => void;
}

function toLines(values: string[]) {
  return values.join("\n");
}

function fromLines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function reviewMethodLabel(value: InterviewQuestion["review_method"]) {
  return value === "human" ? "人工精审" : value === "ai_auto" ? "AI 审核" : value === "manual_override" ? "快速正式化" : "尚未审核";
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
    human_quality_score: question.human_quality_score,
    review_status: reviewStatus ?? question.review_status,
  };
}

export function InterviewReviewEditor({
  draft,
  isSaving,
  error,
  aiReviewEnabled,
  quickPublishEnabled,
  onChange,
  onSave,
  onRequestStatus,
  onAiReview,
  onApplyAiReview,
  onKeepPending,
  onQuickPublish,
}: InterviewReviewEditorProps) {
  function update(next: Partial<InterviewQuestion>) {
    onChange({ ...draft, ...next });
  }

  function updateRubric(index: number, patch: Partial<InterviewQuestion["evaluation_rubric"][number]>) {
    update({ evaluation_rubric: draft.evaluation_rubric.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  }

  const rubricWeight = draft.evaluation_rubric.reduce((total, item) => total + Number(item.weight || 0), 0);
  const aiReview = draft.ai_review;

  return (
    <section className="review-editor" aria-labelledby="review-editor-title" aria-busy={isSaving}>
      <header className="review-editor-header">
        <div>
          <span className="pane-label">题目审核</span>
          <h2 id="review-editor-title">{draft.question}</h2>
          <p>{draft.domain} / {draft.topic} / {draft.difficulty} / {draft.id}</p>
        </div>
        <span className={`review-status review-status-${draft.review_status}`}>{draft.review_status}</span>
      </header>

      <section className="review-summary" aria-label="审核摘要">
        <div><span>状态</span><strong>{draft.review_status}</strong></div>
        <div><span>人工评分</span><strong className="tabular-number">{draft.human_quality_score ?? "—"}</strong></div>
        <div><span>AI 评分</span><strong className="tabular-number">{draft.ai_quality_score ?? "—"}</strong></div>
        <div><span>审核方式</span><strong>{reviewMethodLabel(draft.review_method)}</strong></div>
      </section>

      {aiReview ? (
        <section className="ai-review-summary" aria-labelledby="ai-review-title">
          <div className="ai-review-summary-header">
            <div><span className="pane-label">AI 审核结果</span><h3 id="ai-review-title"><strong className="tabular-number">{aiReview.quality_score}</strong> / 100</h3></div>
            <span className={aiReview.recommended_status === "verified" ? "review-status review-status-verified" : "review-status"}>建议 {aiReview.recommended_status}</span>
          </div>
          <p>{aiReview.factual_risk || aiReview.duplicate_risk ? "存在需要人工确认的风险，不会自动进入训练池。" : "未发现明显事实或重复风险。"}</p>
          {aiReview.issues.length ? <ul>{aiReview.issues.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul> : null}
          {aiReview.suggested_changes.length ? <p className="ai-suggestion">建议：{aiReview.suggested_changes.slice(0, 2).join("；")}</p> : null}
          {aiReviewEnabled ? <div className="inline-actions"><button className="button button-secondary" disabled={isSaving} onClick={onApplyAiReview} type="button">采用建议</button><button className="button button-tertiary" disabled={isSaving} onClick={onKeepPending} type="button">保持待审核</button></div> : null}
        </section>
      ) : null}

      <section className="review-primary-actions" aria-label="主要审核操作">
        <label className="review-score-field"><span>人工评分</span><input min={0} max={100} value={draft.human_quality_score ?? ""} onChange={(event) => update({ human_quality_score: event.target.value === "" ? null : Number(event.target.value) })} type="number" /></label>
        <button className="button button-primary" disabled={isSaving} onClick={() => onRequestStatus("verified")} type="button">人工通过</button>
        <button className="button button-secondary" disabled={isSaving} onClick={onSave} type="button">保存修改</button>
        <details className="review-action-menu">
          <summary>更多操作</summary>
          <div>
            {aiReviewEnabled ? <button disabled={isSaving} onClick={onAiReview} type="button">{isSaving ? "AI 评估中" : "AI 评估"}</button> : null}
            {quickPublishEnabled ? <button disabled={isSaving} onClick={onQuickPublish} type="button">快速正式化</button> : null}
            <button className="menu-danger" disabled={isSaving} onClick={() => onRequestStatus("rejected")} type="button">标记拒绝</button>
          </div>
        </details>
      </section>

      <details className="review-edit-details">
        <summary>编辑题目与评分材料</summary>
        <div className="review-edit-details-body">
          <label className="editor-field"><span>题目正文</span><textarea value={draft.question} onChange={(event) => update({ question: event.target.value })} rows={4} /></label>
          <div className="interview-form-grid">
            <label className="editor-field"><span>难度</span><select value={draft.difficulty} onChange={(event) => update({ difficulty: event.target.value as InterviewQuestion["difficulty"] })}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></label>
            <label className="editor-field"><span>预计回答时间（秒）</span><input min={30} max={600} value={draft.expected_duration_seconds} onChange={(event) => update({ expected_duration_seconds: Number(event.target.value) || 30 })} type="number" /></label>
            <label className="editor-field editor-field-wide"><span>标签（逗号分隔）</span><input value={draft.tags.join(", ")} onChange={(event) => update({ tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
          </div>
          <label className="editor-field"><span>参考要点（每行一条）</span><textarea value={toLines(draft.reference_points)} onChange={(event) => update({ reference_points: fromLines(event.target.value) })} rows={5} /></label>
          <section className="rubric-editor" aria-labelledby="rubric-title">
            <div className="field-label-row"><span id="rubric-title">评分 Rubric</span><span className={rubricWeight === 100 ? "rubric-total" : "rubric-total rubric-total-invalid"}>权重 {rubricWeight} / 100</span></div>
            {draft.evaluation_rubric.map((item, index) => <div className="rubric-row" key={`${index}-${item.point}`}><input value={item.point} onChange={(event) => updateRubric(index, { point: event.target.value })} aria-label={`第 ${index + 1} 条评分要点`} /><input value={item.weight} min={1} max={100} onChange={(event) => updateRubric(index, { weight: Number(event.target.value) || 0 })} aria-label={`第 ${index + 1} 条权重`} type="number" /><label><input checked={item.mandatory} onChange={(event) => updateRubric(index, { mandatory: event.target.checked })} type="checkbox" />必答</label><button className="delete-link" onClick={() => update({ evaluation_rubric: draft.evaluation_rubric.filter((_, itemIndex) => itemIndex !== index) })} type="button">删除</button></div>)}
            <button className="button button-secondary" onClick={() => update({ evaluation_rubric: [...draft.evaluation_rubric, { point: "", weight: 0, mandatory: false }] })} type="button">新增规则</button>
          </section>
          <label className="editor-field"><span>常见错误（每行一条）</span><textarea value={toLines(draft.common_mistakes)} onChange={(event) => update({ common_mistakes: fromLines(event.target.value) })} rows={4} /></label>
          <label className="editor-field"><span>口述回答结构（每行一条）</span><textarea value={toLines(draft.oral_answer_outline)} onChange={(event) => update({ oral_answer_outline: fromLines(event.target.value) })} rows={4} /></label>
          <label className="editor-field"><span>参考回答</span><textarea value={draft.reference_answer} onChange={(event) => update({ reference_answer: event.target.value })} rows={8} /></label>
          <label className="editor-field"><span>追问（每行一条）</span><textarea value={toLines(draft.follow_up_questions)} onChange={(event) => update({ follow_up_questions: fromLines(event.target.value) })} rows={3} /></label>
        </div>
      </details>

      <section className="review-sources" aria-labelledby="sources-title"><span id="sources-title">来源</span><ul>{draft.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><small>{source.source_type} / {source.license}</small></li>)}</ul></section>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </section>
  );
}
