import type { InterviewQuestion, InterviewQuestionReviewUpdate, ReviewStatus } from "../../types/interview";
import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { FloppyDiskIcon } from "@phosphor-icons/react/FloppyDisk";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { RocketLaunchIcon } from "@phosphor-icons/react/RocketLaunch";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";
import { XCircleIcon } from "@phosphor-icons/react/XCircle";
import { ExpandableSection } from "./ExpandableSection";
import { PopoverMenu } from "./PopoverMenu";

interface InterviewReviewEditorProps {
  draft: InterviewQuestion;
  isSaving: boolean;
  isRunningAiReview: boolean;
  isProcessingInBatch: boolean;
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
  isRunningAiReview,
  isProcessingInBatch,
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
  const isLocked = isSaving || isRunningAiReview || isProcessingInBatch;
  const statusLabel = isProcessingInBatch ? "处理中" : draft.review_status;

  return (
    <section className="review-editor" aria-labelledby="review-editor-title" aria-busy={isLocked || isRunningAiReview}>
      <header className="review-editor-header">
        <div>
          <span className="pane-label">题目审核</span>
          <h2 id="review-editor-title">{draft.question}</h2>
          <p>{draft.domain} / {draft.topic} / {draft.difficulty} / {draft.id}</p>
        </div>
        <span className={`review-status review-status-${isProcessingInBatch ? "processing" : draft.review_status}`}>{statusLabel}</span>
      </header>

      <section className="review-summary" aria-label="审核摘要">
        <div><span>状态</span><strong>{statusLabel}</strong></div>
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
          <ExpandableSection label="查看 AI 审核细节" className="ai-review-details">
            <div className="ai-review-detail-grid"><span>清晰度 {aiReview.clarity_score}</span><span>技术准确度 {aiReview.technical_score}</span><span>面试价值 {aiReview.interview_value_score}</span><span>来源支持 {aiReview.source_support_score}</span></div>
            {aiReview.issues.length ? <ul>{aiReview.issues.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            {aiReview.suggested_changes.length ? <p className="ai-suggestion">建议：{aiReview.suggested_changes.join("；")}</p> : null}
          </ExpandableSection>
          {aiReviewEnabled ? <div className="inline-actions"><button className="button button-secondary" disabled={isLocked} onClick={onApplyAiReview} type="button">采用建议</button><button className="button button-tertiary" disabled={isLocked} onClick={onKeepPending} type="button">保持待审核</button></div> : null}
        </section>
      ) : null}

      <section className="review-primary-actions" aria-label="主要审核操作">
        <label className="review-score-field"><span>人工评分</span><input disabled={isLocked} min={0} max={100} value={draft.human_quality_score ?? ""} onChange={(event) => update({ human_quality_score: event.target.value === "" ? null : Number(event.target.value) })} type="number" /></label>
        <button className="button button-primary" disabled={isLocked} onClick={() => onRequestStatus("verified")} type="button"><CheckCircleIcon aria-hidden="true" size={16} weight="fill" />人工通过</button>
        <button className="button button-secondary" disabled={isLocked} onClick={onSave} type="button"><FloppyDiskIcon aria-hidden="true" size={16} weight="bold" />{isSaving ? "保存中" : "保存修改"}</button>
        <PopoverMenu label="更多操作" disabled={isLocked} className="review-action-menu">
          {aiReviewEnabled ? <button role="menuitem" disabled={isRunningAiReview} onClick={onAiReview} type="button"><SparkleIcon aria-hidden="true" size={16} weight="fill" />{isRunningAiReview ? "AI 评估中" : "AI 评估"}</button> : null}
          {quickPublishEnabled ? <button role="menuitem" onClick={onQuickPublish} type="button"><RocketLaunchIcon aria-hidden="true" size={16} weight="fill" />快速正式化</button> : null}
          <button className="menu-danger" role="menuitem" onClick={() => onRequestStatus("rejected")} type="button"><XCircleIcon aria-hidden="true" size={16} weight="fill" />标记拒绝</button>
        </PopoverMenu>
      </section>

      <ExpandableSection label="编辑题目与评分材料" className="review-edit-details">
        <div className="review-edit-details-body">
          <label className="editor-field"><span>题目正文</span><textarea disabled={isLocked} value={draft.question} onChange={(event) => update({ question: event.target.value })} rows={4} /></label>
          <div className="interview-form-grid">
            <label className="editor-field"><span>难度</span><select disabled={isLocked} value={draft.difficulty} onChange={(event) => update({ difficulty: event.target.value as InterviewQuestion["difficulty"] })}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></label>
            <label className="editor-field"><span>预计回答时间（秒）</span><input disabled={isLocked} min={30} max={600} value={draft.expected_duration_seconds} onChange={(event) => update({ expected_duration_seconds: Number(event.target.value) || 30 })} type="number" /></label>
            <label className="editor-field editor-field-wide"><span>标签（逗号分隔）</span><input disabled={isLocked} value={draft.tags.join(", ")} onChange={(event) => update({ tags: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
          </div>
          <label className="editor-field"><span>参考要点（每行一条）</span><textarea disabled={isLocked} value={toLines(draft.reference_points)} onChange={(event) => update({ reference_points: fromLines(event.target.value) })} rows={5} /></label>
          <section className="rubric-editor" aria-labelledby="rubric-title">
            <div className="field-label-row"><span id="rubric-title">评分 Rubric</span><span className={rubricWeight === 100 ? "rubric-total" : "rubric-total rubric-total-invalid"}>权重 {rubricWeight} / 100</span></div>
            {draft.evaluation_rubric.map((item, index) => <div className="rubric-row" key={`${index}-${item.point}`}><input disabled={isLocked} value={item.point} onChange={(event) => updateRubric(index, { point: event.target.value })} aria-label={`第 ${index + 1} 条评分要点`} /><input disabled={isLocked} value={item.weight} min={1} max={100} onChange={(event) => updateRubric(index, { weight: Number(event.target.value) || 0 })} aria-label={`第 ${index + 1} 条权重`} type="number" /><label><input disabled={isLocked} checked={item.mandatory} onChange={(event) => updateRubric(index, { mandatory: event.target.checked })} type="checkbox" />必答</label><button className="delete-link" disabled={isLocked} onClick={() => update({ evaluation_rubric: draft.evaluation_rubric.filter((_, itemIndex) => itemIndex !== index) })} type="button">删除</button></div>)}
            <button className="button button-secondary" disabled={isLocked} onClick={() => update({ evaluation_rubric: [...draft.evaluation_rubric, { point: "", weight: 0, mandatory: false }] })} type="button"><PlusIcon aria-hidden="true" size={16} weight="bold" />新增规则</button>
          </section>
          <label className="editor-field"><span>常见错误（每行一条）</span><textarea disabled={isLocked} value={toLines(draft.common_mistakes)} onChange={(event) => update({ common_mistakes: fromLines(event.target.value) })} rows={4} /></label>
          <label className="editor-field"><span>口述回答结构（每行一条）</span><textarea disabled={isLocked} value={toLines(draft.oral_answer_outline)} onChange={(event) => update({ oral_answer_outline: fromLines(event.target.value) })} rows={4} /></label>
          <label className="editor-field"><span>参考回答</span><textarea disabled={isLocked} value={draft.reference_answer} onChange={(event) => update({ reference_answer: event.target.value })} rows={8} /></label>
          <label className="editor-field"><span>追问（每行一条）</span><textarea disabled={isLocked} value={toLines(draft.follow_up_questions)} onChange={(event) => update({ follow_up_questions: fromLines(event.target.value) })} rows={3} /></label>
        </div>
      </ExpandableSection>

      <section className="review-sources" aria-labelledby="sources-title"><span id="sources-title">来源</span><ul>{draft.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><small>{source.source_type} / {source.license}</small></li>)}</ul></section>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </section>
  );
}
