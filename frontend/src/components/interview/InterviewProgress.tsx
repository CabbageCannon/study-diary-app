import type { InterviewQuestionSet } from "../../types/interview";

interface InterviewProgressProps {
  questionSet: InterviewQuestionSet;
}

export function InterviewProgress({ questionSet }: InterviewProgressProps) {
  const answeredCount = questionSet.items.filter((item) => item.status === "answered").length;
  const skippedCount = questionSet.items.filter((item) => item.status === "skipped").length;
  const currentNumber = questionSet.current_question ? questionSet.current_index + 1 : questionSet.question_count;

  return (
    <div className="interview-progress" aria-label="训练进度">
      <span className="tabular-number">{currentNumber} / {questionSet.question_count}</span>
      <span>已回答 {answeredCount}</span>
      {skippedCount ? <span>已跳过 {skippedCount}</span> : null}
    </div>
  );
}
