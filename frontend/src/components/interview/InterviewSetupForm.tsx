import type { CreateQuestionSetPayload, Difficulty, QuestionDomain } from "../../types/interview";

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

interface InterviewSetupFormProps {
  value: CreateQuestionSetPayload;
  isSubmitting: boolean;
  error: string;
  onChange: (nextValue: CreateQuestionSetPayload) => void;
  onSubmit: () => void;
}

export function InterviewSetupForm({ value, isSubmitting, error, onChange, onSubmit }: InterviewSetupFormProps) {
  const topics = value.domain ? topicOptions[value.domain] : [];

  function update<K extends keyof CreateQuestionSetPayload>(key: K, nextValue: CreateQuestionSetPayload[K]) {
    onChange({ ...value, [key]: nextValue });
  }

  return (
    <section className="interview-setup-form" aria-labelledby="interview-setup-title" aria-busy={isSubmitting}>
      <div className="pane-header">
        <div>
          <span className="pane-label">训练配置</span>
          <h2 id="interview-setup-title">选一组现在想练的问题</h2>
        </div>
      </div>

      <div className="interview-form-grid">
        <label className="editor-field">
          <span>方向</span>
          <select
            value={value.domain ?? ""}
            onChange={(event) => update("domain", (event.target.value || undefined) as QuestionDomain | undefined)}
          >
            <option value="">不限方向</option>
            {domainOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="editor-field">
          <span>主题</span>
          <select value={value.topic ?? ""} disabled={!value.domain} onChange={(event) => update("topic", event.target.value || undefined)}>
            <option value="">不限主题</option>
            {topics.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="editor-field">
          <span>难度</span>
          <select
            value={value.difficulty ?? ""}
            onChange={(event) => update("difficulty", (event.target.value || undefined) as Difficulty | undefined)}
          >
            <option value="">不限难度</option>
            <option value="easy">简单</option>
            <option value="medium">中等</option>
            <option value="hard">困难</option>
          </select>
        </label>

        <label className="editor-field">
          <span>题目数量</span>
          <input
            value={value.question_count}
            min={1}
            max={30}
            onChange={(event) => update("question_count", Math.max(1, Number(event.target.value) || 1))}
            type="number"
          />
        </label>
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
        <button className="button button-primary" disabled={isSubmitting} onClick={onSubmit} type="button">
          {isSubmitting ? "正在创建..." : "开始训练"}
        </button>
      </div>
    </section>
  );
}
