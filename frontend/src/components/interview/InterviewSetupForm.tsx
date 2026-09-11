import type { CreateQuestionSetPayload, Difficulty, QuestionDomain } from "../../types/interview";
import { FloppyDiskIcon } from "@phosphor-icons/react/FloppyDisk";

import { HoverSelect, type HoverSelectOption } from "./HoverSelect";

export const domainOptions: Array<{ value: QuestionDomain; label: string }> = [
  { value: "agent", label: "Agent" },
  { value: "rag", label: "RAG" },
  { value: "llm_application", label: "LLM 应用" },
  { value: "python", label: "Python" },
  { value: "network", label: "网络" },
  { value: "ai_engineering", label: "AI 工程" },
];

const topicOptions: Record<QuestionDomain, Array<{ value: string; label: string }>> = {
  agent: [
    { value: "tool_calling", label: "Tool Calling" },
    { value: "mcp", label: "MCP" },
    { value: "memory", label: "Memory" },
    { value: "planning", label: "Planning" },
    { value: "agent_evaluation", label: "评估" },
  ],
  rag: [
    { value: "retrieval", label: "检索" },
    { value: "chunking", label: "切分" },
    { value: "evaluation", label: "评估" },
  ],
  llm_application: [
    { value: "tool_calling", label: "Tool Calling" },
    { value: "function_calling", label: "Function Calling" },
    { value: "structured_output", label: "结构化输出" },
  ],
  python: [
    { value: "asyncio", label: "asyncio" },
    { value: "fastapi", label: "FastAPI" },
    { value: "pydantic", label: "Pydantic" },
  ],
  network: [
    { value: "http", label: "HTTP" },
    { value: "sse", label: "SSE" },
    { value: "proxy", label: "代理与超时" },
  ],
  ai_engineering: [
    { value: "retry", label: "重试" },
    { value: "streaming", label: "流式输出" },
    { value: "observability", label: "可观测性" },
    { value: "cost_control", label: "成本控制" },
  ],
};

const difficultyOptions: HoverSelectOption[] = [
  { value: "", label: "不限难度" },
  { value: "easy", label: "简单" },
  { value: "medium", label: "中等" },
  { value: "hard", label: "困难" },
];

const questionCountOptions: HoverSelectOption[] = Array.from({ length: 30 }, (_, index) => {
  const count = index + 1;
  return { value: String(count), label: `${count} 题` };
});

interface InterviewSetupFormProps {
  value: CreateQuestionSetPayload;
  isSubmitting: boolean;
  error: string;
  onChange: (nextValue: CreateQuestionSetPayload) => void;
  onSave: () => void;
}

export function InterviewSetupForm({ value, isSubmitting, error, onChange, onSave }: InterviewSetupFormProps) {
  const topics = value.domain ? topicOptions[value.domain] : [];

  function update<K extends keyof CreateQuestionSetPayload>(key: K, nextValue: CreateQuestionSetPayload[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <section className="interview-setup-form" aria-labelledby="interview-setup-title" aria-busy={isSubmitting}>
      <div className="pane-header">
        <div>
          <span className="pane-label">训练配置</span>
          <h2 id="interview-setup-title">新建训练</h2>
        </div>
      </div>

      <div className="interview-form-grid">
        <div className="editor-field">
          <span>方向</span>
          <HoverSelect
            ariaLabel="训练方向"
            emptyLabel="不限方向"
            options={[{ value: "", label: "不限方向" }, ...domainOptions]}
            value={value.domain ?? ""}
            onChange={(nextValue) => update("domain", (nextValue || undefined) as QuestionDomain | undefined)}
          />
        </div>

        <div className="editor-field">
          <span>主题</span>
          <HoverSelect
            ariaLabel="训练主题"
            disabled={!value.domain}
            emptyLabel={value.domain ? "不限主题" : "请先选择方向"}
            options={[{ value: "", label: "不限主题" }, ...topics]}
            value={value.topic ?? ""}
            onChange={(nextValue) => update("topic", nextValue || undefined)}
          />
        </div>

        <div className="editor-field">
          <span>难度</span>
          <HoverSelect
            ariaLabel="训练难度"
            emptyLabel="不限难度"
            options={difficultyOptions}
            value={value.difficulty ?? ""}
            onChange={(nextValue) => update("difficulty", (nextValue || undefined) as Difficulty | undefined)}
          />
        </div>

        <div className="editor-field">
          <span>题目数量</span>
          <HoverSelect
            ariaLabel="训练题目数量"
            emptyLabel="选择题目数量"
            numberGrid
            options={questionCountOptions}
            value={String(value.question_count)}
            onChange={(nextValue) => update("question_count", Number(nextValue))}
          />
        </div>
      </div>

      <div className="interview-check-list">
        <label>
          <input
            checked={value.include_due_reviews}
            onChange={(event) => update("include_due_reviews", event.target.checked)}
            type="checkbox"
          />
          优先安排到期复习题
        </label>
        <label>
          <input checked={value.random_order} onChange={(event) => update("random_order", event.target.checked)} type="checkbox" />
          随机题目顺序
        </label>
      </div>

      {error ? <p className="field-error" role="alert">{error}</p> : null}

      <div className="interview-form-actions">
        <button className="button button-primary" disabled={isSubmitting} onClick={onSave} type="button">
          <FloppyDiskIcon aria-hidden="true" size={16} weight="bold" />
          {isSubmitting ? "保存中..." : "保存"}
        </button>
      </div>
    </section>
  );
}
