import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { createInterviewQuestionSet, listDueInterviewReviews } from "../api/interviews";
import { InterviewSetupForm } from "../components/interview/InterviewSetupForm";
import type { CreateQuestionSetPayload } from "../types/interview";

const initialPayload: CreateQuestionSetPayload = {
  question_count: 5,
  include_due_reviews: true,
  random_order: true,
};

export function InterviewPage() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<CreateQuestionSetPayload>(initialPayload);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void listDueInterviewReviews().then((reviews) => setDueCount(reviews.length)).catch(() => setDueCount(null));
  }, []);

  async function startTraining() {
    setIsSubmitting(true);
    setError("");
    try {
      const questionSet = await createInterviewQuestionSet(payload);
      navigate(`/interview/session/${questionSet.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "训练题集创建失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack interview-page">
      <header className="page-header">
        <div>
          <span className="page-kicker">八股训练</span>
          <h1>用一题，练一次完整表达</h1>
        </div>
        <p>训练只会使用人工确认过的题目。回答可以来自语音转写，也可以直接手动输入。</p>
      </header>

      <div className="interview-setup-layout">
        <InterviewSetupForm value={payload} isSubmitting={isSubmitting} error={error} onChange={setPayload} onSubmit={startTraining} />
        <aside className="interview-context" aria-label="训练提示">
          <span className="pane-label">复习队列</span>
          <strong className="tabular-number">{dueCount ?? "—"}</strong>
          <p>道题当前到期。开启优先复习后，系统会优先将它们排入题集，再避开最近刚回答的问题。</p>
        </aside>
      </div>
    </div>
  );
}
