import { useEffect, useMemo, useState } from "react";

import { listInterviewQuestionCatalog } from "../api/interviews";
import { domainOptions } from "../components/interview/InterviewSetupForm";
import type { InterviewQuestionCatalogPage, QuestionDomain } from "../types/interview";

function domainLabel(domain: QuestionDomain) {
  return domainOptions.find((item) => item.value === domain)?.label ?? domain;
}

export function InterviewCatalogPage() {
  const [domain, setDomain] = useState<QuestionDomain | "">("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<InterviewQuestionCatalogPage | null>(null);
  const [error, setError] = useState("");
  const filters = useMemo(() => ({ page, domain: domain || undefined }), [domain, page]);

  useEffect(() => {
    let ignore = false;
    setError("");
    listInterviewQuestionCatalog(filters)
      .then((result) => {
        if (ignore) return;
        setCatalog(result);
        if (result.page < result.total_pages) void listInterviewQuestionCatalog({ ...filters, page: result.page + 1 });
      })
      .catch((loadError) => {
        if (!ignore) setError(loadError instanceof Error ? loadError.message : "题库加载失败。");
      });
    return () => { ignore = true; };
  }, [filters]);

  const totalPages = catalog?.total_pages ?? 0;
  const firstPage = Math.max(1, Math.min(page - 1, totalPages - 2));
  const pages = Array.from({ length: Math.min(3, totalPages) }, (_, index) => firstPage + index);

  return (
    <div className="interview-catalog-page interview-workspace-panel">
      <section className="algorithm-catalog-browser interview-catalog-browser" aria-labelledby="interview-catalog-title">
        <div className="section-heading">
          <div><span className="pane-label">题库</span><h2 id="interview-catalog-title">八股题库</h2></div>
          <span className="tabular-number">{catalog?.total ?? "..."}</span>
        </div>
        <div className="catalog-browser-filters">
          <label>
            <span>方向</span>
            <select value={domain} onChange={(event) => { setDomain(event.target.value as QuestionDomain | ""); setPage(1); }}>
              <option value="">全部</option>
              {domainOptions.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
        {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
        <div className="interview-catalog-grid">
          {catalog?.items.map((question) => (
            <article className="interview-catalog-card" key={question.id}>
              <p>{question.question}</p>
              <small>{domainLabel(question.domain)} · {question.topic}</small>
              <span>{question.is_answered ? "做过" : "未做过"}</span>
            </article>
          ))}
        </div>
        {catalog && catalog.items.length === 0 ? <p className="algorithm-muted-copy">没有匹配的八股题。</p> : null}
        {totalPages > 1 ? (
          <div className="interview-catalog-pagination" aria-label="题库分页">
            <button className="button button-secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
              上一页
            </button>
            {pages.map((item) => (
              <button
                aria-current={item === page ? "page" : undefined}
                className={item === page ? "button button-primary" : "button button-secondary"}
                key={item}
                onClick={() => setPage(item)}
                type="button"
              >
                {item}
              </button>
            ))}
            <button className="button button-secondary" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
              下一页
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
