import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { LightbulbIcon } from "@phosphor-icons/react/Lightbulb";
import { PauseIcon } from "@phosphor-icons/react/Pause";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { SkipForwardIcon } from "@phosphor-icons/react/SkipForward";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";

import {
  completeAlgorithmSession,
  getAlgorithmSession,
  requestAlgorithmAiReview,
  requestAlgorithmHint,
  saveAlgorithmAttempt,
  skipAlgorithmSessionProblem,
  updateAlgorithmSessionProgress,
} from "../api/algorithms";
import { formatElapsedTime, useAlgorithmAttemptDraft, useAlgorithmSessionTimer } from "../hooks/useAlgorithmPracticeState";
import type { AlgorithmAttempt, AlgorithmItemStatus, AlgorithmSession } from "../types/algorithm";

function difficultyLabel(difficulty: string) {
  return { easy: "简单", medium: "中等", hard: "困难" }[difficulty] ?? difficulty;
}

function resultLabel(result: string) {
  return { solved: "已解决", partially_solved: "部分完成", failed: "未解决", gave_up: "放弃" }[result] ?? result;
}

export function AlgorithmSessionPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<AlgorithmSession | null>(null);
  const [savedAttempt, setSavedAttempt] = useState<AlgorithmAttempt | null>(null);
  const [hint, setHint] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAskingAi, setIsAskingAi] = useState(false);
  const [error, setError] = useState("");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const currentItem = session?.items[session.current_index] ?? null;
  const effectiveSessionId = session?.id || sessionId || "pending";
  const draftState = useAlgorithmAttemptDraft(effectiveSessionId, currentItem?.problem_id ?? 0);
  const timer = useAlgorithmSessionTimer(effectiveSessionId);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const data = await getAlgorithmSession(sessionId);
      setSession(data);
      const item = data.items[data.current_index];
      setSavedAttempt(item?.latest_attempt ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练会话加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  useEffect(() => {
    if (session?.status === "in_progress") window.localStorage.setItem("study-diary:algorithm:last-active-session", session.id);
  }, [session]);

  const canMovePrevious = Boolean(session && session.current_index > 0);
  const canMoveNext = Boolean(session && session.current_index < session.items.length - 1);
  const canSave = Boolean(currentItem && session?.status === "in_progress" && isOnline && !isSaving);
  const aiFeedback = savedAttempt?.ai_feedback;
  const currentTitle = useMemo(() => currentItem?.problem.title_zh || currentItem?.problem.title || "", [currentItem]);

  async function moveTo(index: number) {
    if (!session || !isOnline) return;
    setError("");
    try {
      const next = await updateAlgorithmSessionProgress(session.id, index, "in_progress" as AlgorithmItemStatus);
      setSession(next);
      setSavedAttempt(next.items[index]?.latest_attempt ?? null);
      setHint("");
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "无法更新训练进度。");
    }
  }

  async function saveAttempt() {
    if (!currentItem || !session) return;
    setIsSaving(true);
    setError("");
    try {
      const attempt = await saveAlgorithmAttempt({
        problem_id: currentItem.problem_id,
        session_id: session.id,
        duration_seconds: timer.elapsedSeconds,
        result: draftState.draft.result,
        language: draftState.draft.language || undefined,
        approach: draftState.draft.approach,
        time_complexity: draftState.draft.timeComplexity || undefined,
        space_complexity: draftState.draft.spaceComplexity || undefined,
        code: draftState.draft.code || undefined,
        reflection: draftState.draft.reflection || undefined,
        mistakes: draftState.draft.mistakes || undefined,
        edge_cases: draftState.draft.edgeCases || undefined,
        needs_review: draftState.draft.needsReview,
      });
      setSavedAttempt(attempt);
      draftState.clearDraft();
      timer.resetTimer();
      const refreshed = await getAlgorithmSession(session.id);
      setSession(refreshed);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存解题记录失败，本地草稿仍会保留。");
    } finally {
      setIsSaving(false);
    }
  }

  async function skipCurrent() {
    if (!session || !isOnline) return;
    setError("");
    try {
      const next = await skipAlgorithmSessionProblem(session.id);
      setSession(next);
      setSavedAttempt(next.items[next.current_index]?.latest_attempt ?? null);
      setHint("");
    } catch (skipError) {
      setError(skipError instanceof Error ? skipError.message : "跳过题目失败。");
    }
  }

  async function getHint(level: number) {
    if (!savedAttempt || !isOnline) return;
    setIsAskingAi(true);
    setError("");
    try {
      const result = await requestAlgorithmHint(savedAttempt.id, level, draftState.draft.approach || savedAttempt.approach);
      setHint(result.content);
      setSavedAttempt((value) => value ? { ...value, hint_count: Math.max(value.hint_count, level) } : value);
    } catch (hintError) {
      setError(hintError instanceof Error ? hintError.message : "AI 提示暂时不可用。");
    } finally {
      setIsAskingAi(false);
    }
  }

  async function getAiReview() {
    if (!savedAttempt || !isOnline) return;
    setIsAskingAi(true);
    setError("");
    try {
      setSavedAttempt(await requestAlgorithmAiReview(savedAttempt.id));
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "AI 复盘暂时不可用，记录已保留。");
    } finally {
      setIsAskingAi(false);
    }
  }

  async function completeSession() {
    if (!session || !isOnline) return;
    setError("");
    try {
      await completeAlgorithmSession(session.id);
      window.localStorage.removeItem("study-diary:algorithm:last-active-session");
      timer.resetTimer();
      navigate("/algorithms/history");
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "完成训练失败。");
    }
  }

  if (isLoading) return <div className="page-stack"><div className="skeleton-block skeleton-session" /></div>;
  if (!session || !currentItem) return <div className="page-stack"><div className="empty-state"><p>{error || "没有可恢复的训练会话。"}</p><Link className="button button-primary" to="/algorithms">返回算法训练</Link></div></div>;

  return (
    <>
      <div className="page-stack algorithm-session-page">
      <header className="algorithm-session-topbar">
        <Link className="back-link" to="/algorithms"><ArrowLeftIcon aria-hidden="true" size={17} />算法训练</Link>
        <div className="algorithm-progress"><span className="tabular-number">{session.current_index + 1}/{session.question_count}</span><div aria-label={`训练进度 ${session.current_index + 1} / ${session.question_count}`} className="algorithm-progress-track"><span style={{ transform: `scaleX(${(session.current_index + 1) / session.question_count})` }} /></div></div>
      </header>
      {!isOnline ? <p className="offline-training-note" role="status">离线模式：草稿和计时会保存在此设备；保存记录与 AI 功能将在恢复网络后可用。</p> : null}
      {error ? <p className="field-error page-error" role="alert">{error}</p> : null}

      <main className="algorithm-session-workbench">
        <section className="algorithm-problem-panel">
          <div className="problem-meta-row"><span className={`difficulty-badge difficulty-${currentItem.problem.difficulty}`}>{difficultyLabel(currentItem.problem.difficulty)}</span>{currentItem.problem.topics.map((topic) => <span className="topic-token" key={topic}>{topic}</span>)}</div>
          <h1>{currentTitle}</h1>
          <p className="problem-slug">{currentItem.problem.title} · {currentItem.problem.source_lists.join(" / ") || "本地题库"}</p>
          <a className="button button-secondary" href={currentItem.problem.url} rel="noreferrer" target="_blank">打开原题<ArrowRightIcon aria-hidden="true" size={16} /></a>
        </section>

        <aside className="algorithm-timer-panel"><span>本题计时</span><strong className="tabular-number">{formatElapsedTime(timer.elapsedSeconds)}</strong><button className="timer-control" aria-label={timer.isRunning ? "暂停计时" : "继续计时"} onClick={() => timer.setIsRunning((value) => !value)} type="button">{timer.isRunning ? <PauseIcon aria-hidden="true" size={18} weight="fill" /> : <PlayIcon aria-hidden="true" size={18} weight="fill" />}{timer.isRunning ? "暂停" : "继续"}</button></aside>

        <section className="algorithm-attempt-editor" aria-label="解题记录">
          <div className="editor-header"><div><span className="pane-label">解题记录</span><h2>记录过程</h2></div>{savedAttempt ? <span className="saved-attempt-indicator"><CheckIcon aria-hidden="true" size={15} weight="bold" />已保存</span> : null}</div>
          <div className="attempt-result-row" role="radiogroup" aria-label="本题结果">
            {(["solved", "partially_solved", "failed", "gave_up"] as const).map((result) => <label className={draftState.draft.result === result ? "attempt-result-option attempt-result-option-active" : "attempt-result-option"} key={result}><input checked={draftState.draft.result === result} name="attempt-result" onChange={() => draftState.setDraft((value) => ({ ...value, result }))} type="radio" value={result} />{resultLabel(result)}</label>)}
          </div>
          <label className="form-field"><span>我的思路</span><textarea autoComplete="off" onChange={(event) => draftState.setDraft((value) => ({ ...value, approach: event.target.value }))} placeholder="先写下你观察到的结构、选择的方案和关键判断。" value={draftState.draft.approach} /></label>
          <div className="form-two-columns"><label className="form-field"><span>时间复杂度</span><input onChange={(event) => draftState.setDraft((value) => ({ ...value, timeComplexity: event.target.value }))} placeholder="例如 O(n)" value={draftState.draft.timeComplexity} /></label><label className="form-field"><span>空间复杂度</span><input onChange={(event) => draftState.setDraft((value) => ({ ...value, spaceComplexity: event.target.value }))} placeholder="例如 O(1)" value={draftState.draft.spaceComplexity} /></label></div>
          <details className="algorithm-code-details"><summary>代码（可选）</summary><label className="form-field"><span>语言</span><input onChange={(event) => draftState.setDraft((value) => ({ ...value, language: event.target.value }))} placeholder="Python / TypeScript / Java" value={draftState.draft.language} /></label><textarea className="algorithm-code-input" onChange={(event) => draftState.setDraft((value) => ({ ...value, code: event.target.value }))} placeholder="仅保存文本，不执行代码。" spellCheck={false} value={draftState.draft.code} /></details>
          <div className="form-two-columns"><label className="form-field"><span>卡点或错误原因</span><textarea onChange={(event) => draftState.setDraft((value) => ({ ...value, mistakes: event.target.value }))} value={draftState.draft.mistakes} /></label><label className="form-field"><span>边界情况</span><textarea onChange={(event) => draftState.setDraft((value) => ({ ...value, edgeCases: event.target.value }))} value={draftState.draft.edgeCases} /></label></div>
          <label className="form-field"><span>复盘</span><textarea onChange={(event) => draftState.setDraft((value) => ({ ...value, reflection: event.target.value }))} placeholder="下次会怎样更早地识别关键模式？" value={draftState.draft.reflection} /></label>
          <label className="algorithm-review-check"><input checked={draftState.draft.needsReview} onChange={(event) => draftState.setDraft((value) => ({ ...value, needsReview: event.target.checked }))} type="checkbox" />加入复习队列</label>
        </section>

        <aside className="algorithm-ai-panel" aria-label="AI 学习助手"><div className="section-heading"><div><span className="pane-label">AI 学习助手</span><h2>提示与复盘</h2></div><SparkleIcon aria-hidden="true" size={19} weight="fill" /></div><p>AI 只分析你的记录，不执行代码，也不代表在线判题结果。</p>{savedAttempt ? <><div className="hint-controls"><span>渐进提示</span>{[1, 2, 3, 4].map((level) => <button disabled={isAskingAi || !isOnline} key={level} onClick={() => void getHint(level)} type="button">提示 {level}</button>)}</div>{hint ? <div className="ai-response-block"><LightbulbIcon aria-hidden="true" size={18} weight="fill" /><p>{hint}</p></div> : null}<button className="button button-secondary" disabled={isAskingAi || !isOnline} onClick={() => void getAiReview()} type="button"><SparkleIcon aria-hidden="true" size={16} weight="fill" />{isAskingAi ? "分析中" : "AI 复盘"}</button>{aiFeedback ? <div className="ai-review-result"><strong>AI 建议</strong><p>{aiFeedback.summary}</p><p>{aiFeedback.approach_assessment}</p>{aiFeedback.issues.length ? <ul>{aiFeedback.issues.map((item) => <li key={item}>{item}</li>)}</ul> : null}<div className="complexity-note"><span>时间：{aiFeedback.time_complexity_assessment.suggested || "待分析"}</span><span>空间：{aiFeedback.space_complexity_assessment.suggested || "待分析"}</span></div></div> : null}</> : <div className="ai-locked-note">先保存本次记录，再逐层获取提示或请求 AI 复盘。</div>}</aside>
      </main>

      </div>
      <footer className="algorithm-session-actions"><button className="button button-secondary" disabled={!canMovePrevious || !isOnline} onClick={() => void moveTo(session.current_index - 1)} type="button"><ArrowLeftIcon aria-hidden="true" size={16} />上一题</button><button className="button button-secondary" disabled={!isOnline} onClick={() => void skipCurrent()} type="button"><SkipForwardIcon aria-hidden="true" size={16} />跳过</button><button className="button button-primary" disabled={!canSave} onClick={() => void saveAttempt()} type="button"><CheckIcon aria-hidden="true" size={16} weight="bold" />{isSaving ? "保存中" : "保存记录"}</button>{canMoveNext ? <button className="button button-secondary" disabled={!isOnline} onClick={() => void moveTo(session.current_index + 1)} type="button">下一题<ArrowRightIcon aria-hidden="true" size={16} /></button> : <button className="button button-secondary" disabled={!isOnline} onClick={() => void completeSession()} type="button">完成训练</button>}</footer>
    </>
  );
}
