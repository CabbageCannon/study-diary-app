import { useMemo, useState } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { Link } from "react-router-dom";

import type { AlgorithmDifficulty, AlgorithmProblem } from "../../types/algorithm";

export function AlgorithmCatalogBrowser({ problems }: { problems: AlgorithmProblem[] }) {
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<AlgorithmDifficulty | "">("");
  const [topic, setTopic] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<"all" | "completed" | "review">("all");
  const topics = useMemo(() => Array.from(new Set(problems.flatMap((problem) => problem.topics))).sort(), [problems]);
  const sources = useMemo(() => Array.from(new Set(problems.flatMap((problem) => problem.source_lists))).sort(), [problems]);
  const filtered = useMemo(() => problems.filter((problem) => {
    const haystack = `${problem.title} ${problem.title_zh ?? ""} ${problem.slug}`.toLocaleLowerCase();
    return (!search || haystack.includes(search.toLocaleLowerCase())) && (!difficulty || problem.difficulty === difficulty) && (!topic || problem.topics.includes(topic)) && (!source || problem.source_lists.includes(source)) && (status === "all" || status === "completed" && problem.is_completed || status === "review" && problem.needs_review);
  }).slice(0, 24), [problems, search, difficulty, topic, source, status]);

  return <section className="algorithm-catalog-browser" aria-labelledby="catalog-browser-title"><div className="section-heading"><div><span className="pane-label">轻量浏览</span><h2 id="catalog-browser-title">题目目录</h2></div><span className="tabular-number">{filtered.length}</span></div><div className="catalog-browser-filters"><label><span>搜索</span><input onChange={(event) => setSearch(event.target.value)} placeholder="标题或 slug" value={search} /></label><label><span>难度</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as AlgorithmDifficulty | "")}><option value="">全部</option><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></label><label><span>题型</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">全部</option>{topics.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span>题单</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">全部</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label><span>进度</span><select value={status} onChange={(event) => setStatus(event.target.value as "all" | "completed" | "review")}><option value="all">全部</option><option value="completed">已完成</option><option value="review">待复习</option></select></label></div><div className="catalog-browser-results">{filtered.map((problem) => <Link className="catalog-browser-row" key={problem.id} to={`/algorithms/problems/${problem.id}`}><div><strong>{problem.title_zh || problem.title}</strong><small>{problem.difficulty === "easy" ? "简单" : problem.difficulty === "medium" ? "中等" : "困难"} · {problem.topics[0] ?? problem.pattern_key}{problem.needs_review ? " · 待复习" : problem.is_completed ? " · 已完成" : ""}</small></div><ArrowRightIcon aria-hidden="true" size={17} /></Link>)}{!filtered.length ? <p className="algorithm-muted-copy">没有匹配的本地题目。</p> : null}</div></section>;
}
