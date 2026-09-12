import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowLeftIcon } from "@phosphor-icons/react/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/ArrowRight";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { FlagIcon } from "@phosphor-icons/react/Flag";
import { PauseIcon } from "@phosphor-icons/react/Pause";
import { PlayIcon } from "@phosphor-icons/react/Play";
import { SkipForwardIcon } from "@phosphor-icons/react/SkipForward";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";

import {
  completeAlgorithmSession,
  getAlgorithmSession,
  peekAlgorithmSession,
  skipAlgorithmSessionProblem,
  updateAlgorithmSessionProgress,
} from "../api/algorithms";
import {
  findAlgorithmReasoningAnswerByClientId,
  getAlgorithmReasoningContext,
  isAlgorithmReasoningFixtureEnabled,
  retryAlgorithmReasoningCheck,
  saveAlgorithmReasoningAnswer,
  setAlgorithmReasoningFixtureEnabled,
} from "../api/algorithmReasoning";
import { ApiRequestError } from "../api/client";
import { formatElapsedTime, useAlgorithmAttemptDraft, useAlgorithmSessionTimer } from "../hooks/useAlgorithmPracticeState";
import type { AlgorithmItemStatus, AlgorithmSession } from "../types/algorithm";
import type { AlgorithmReasoningCheckResponse, AlgorithmReasoningContextResponse } from "../types/algorithmReasoning";

type ReasoningPhase = "editing" | "saving" | "saveUnknown" | "saveFailed" | "saved" | "checking" | "evaluationFailed" | "contextUnavailable" | "completed";
type AlgorithmAnswerTaskStatus = "saving" | "processing" | "completed" | "failed";

interface AlgorithmAnswerTask {
  key: string;
  problemId: number;
  problemTitle: string;
  answerId: number | null;
  status: AlgorithmAnswerTaskStatus;
  error: string | null;
  response: AlgorithmReasoningCheckResponse | null;
}

const phaseText: Record<ReasoningPhase, string> = {
  editing: "本机草稿",
  saving: "正在保存回答",
  saveUnknown: "还不能确认已保存",
  saveFailed: "保存失败",
  saved: "回答已保存",
  checking: "回答已保存，正在请求核对",
  evaluationFailed: "回答已保存，暂时没有核对结果",
  contextUnavailable: "回答已保存，题目核对内容尚未就绪",
  completed: "核对完成",
};

function difficultyLabel(difficulty: string) {
  return { easy: "简单", medium: "中等", hard: "困难" }[difficulty] ?? difficulty;
}

function conclusionLabel(value: string) {
  return {
    correct: "思路成立。",
    partially_correct: "还差一步。",
    critical_error: "存在关键错误。",
    insufficient_context: "信息不足。",
  }[value] ?? "已完成核对。";
}

function reasoningCacheKey(sessionId: string, problemId: number) {
  return `study-diary:algorithm:session:${sessionId}:problem:${problemId}:reasoning`;
}

function readCachedReasoning(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as AlgorithmReasoningCheckResponse : null;
  } catch {
    return null;
  }
}

function writeCachedReasoning(key: string, value: AlgorithmReasoningCheckResponse | null) {
  if (value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  } else {
    window.localStorage.removeItem(key);
  }
}

function scrollQuestionToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  document.getElementById("main-content")?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
}

function phaseFromResponse(response: AlgorithmReasoningCheckResponse): ReasoningPhase {
  if (response.save_status === "save_failed") return "saveFailed";
  if (response.check_status === "completed") return "completed";
  if (response.check_status === "failed") return "evaluationFailed";
  if (response.check_status === "context_unavailable") return "contextUnavailable";
  return "saved";
}

export function AlgorithmSessionPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<AlgorithmSession | null>(() => peekAlgorithmSession(sessionId));
  const [contextResponse, setContextResponse] = useState<AlgorithmReasoningContextResponse | null>(null);
  const [reasoningResult, setReasoningResult] = useState<AlgorithmReasoningCheckResponse | null>(null);
  const [phase, setPhase] = useState<ReasoningPhase>("editing");
  const [isLoading, setIsLoading] = useState(() => !peekAlgorithmSession(sessionId));
  const [isChecking, setIsChecking] = useState(false);
  const [answerTasks, setAnswerTasks] = useState<AlgorithmAnswerTask[]>([]);
  const [error, setError] = useState("");
  const [contextError, setContextError] = useState("");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [fixtureEnabled, setFixtureEnabled] = useState(() => isAlgorithmReasoningFixtureEnabled());
  const currentProblemIdRef = useRef<number | null>(null);
  const currentItem = session?.items[session.current_index] ?? null;
  const effectiveSessionId = session?.id || sessionId || "pending";
  const draftState = useAlgorithmAttemptDraft(effectiveSessionId, currentItem?.problem_id ?? 0);
  const timer = useAlgorithmSessionTimer(effectiveSessionId);
  const cacheKey = useMemo(() => currentItem ? reasoningCacheKey(effectiveSessionId, currentItem.problem_id) : "", [currentItem, effectiveSessionId]);
  const problemKey = currentItem?.problem.stable_key || (currentItem ? String(currentItem.problem_id) : "");
  const context = contextResponse?.context ?? null;
  const isFeedbackStale = Boolean(reasoningResult?.answer && draftState.draft.approach.trim() !== reasoningResult.answer.answer_text.trim());
  const canMovePrevious = Boolean(session && session.current_index > 0);
  const canMoveNext = Boolean(session && session.current_index < session.items.length - 1);
  const canCheck = Boolean(currentItem && session?.status === "in_progress" && draftState.draft.approach.trim() && draftState.draft.clientAnswerId && !isChecking && isOnline);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(!peekAlgorithmSession(sessionId));
    setError("");
    try {
      setSession(await getAlgorithmSession(sessionId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "训练会话加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    currentProblemIdRef.current = currentItem?.problem_id ?? null;
  }, [currentItem?.problem_id]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    if (session?.status === "in_progress") {
      window.localStorage.setItem("study-diary:algorithm:last-active-session", session.id);
    }
  }, [session]);

  useEffect(() => {
    if (!problemKey) return;

    let cancelled = false;
    setContextError("");
    setContextResponse(null);
    void getAlgorithmReasoningContext(problemKey)
      .then((value) => { if (!cancelled) setContextResponse(value); })
      .catch((contextLoadError) => {
        if (!cancelled) {
          setContextError(contextLoadError instanceof Error ? contextLoadError.message : "题目核对内容暂时不可用。");
        }
      });

    return () => { cancelled = true; };
  }, [problemKey, fixtureEnabled]);

  useEffect(() => {
    if (!cacheKey) return;

    const cached = readCachedReasoning(cacheKey);
    setReasoningResult(cached);
    setPhase(cached ? phaseFromResponse(cached) : "editing");
  }, [cacheKey]);

  function persistReasoning(value: AlgorithmReasoningCheckResponse | null) {
    setReasoningResult(value);
    if (cacheKey) writeCachedReasoning(cacheKey, value);
  }

  function updateAnswerTask(nextTask: AlgorithmAnswerTask) {
    setAnswerTasks((tasks) => {
      const existingIndex = tasks.findIndex((task) => task.key === nextTask.key || (task.answerId !== null && task.answerId === nextTask.answerId));
      if (existingIndex === -1) return [nextTask, ...tasks].slice(0, 5);
      return tasks.map((task, index) => index === existingIndex ? nextTask : task);
    });
  }

  function responseFromSavedAnswer(
    detail: { answer: NonNullable<AlgorithmReasoningCheckResponse["answer"]>; feedback: AlgorithmReasoningCheckResponse["feedback"] },
  ): AlgorithmReasoningCheckResponse {
    return {
      save_status: detail.answer.save_status,
      check_status: detail.answer.check_status,
      answer: detail.answer,
      feedback: detail.feedback,
      save_error: null,
      check_error: detail.answer.check_status === "failed" ? "上次核对没有完成，可以重新核对。" : null,
      retry: detail.answer.check_status === "failed" ? { check_url: `/api/algorithms/reasoning/answers/${detail.answer.answer_id}/check`, method: "POST" } : null,
      problem_context: { problem_id: detail.answer.problem_id, content_version: null, reasoning_available: true },
    };
  }

  function persistReasoningForProblem(problemId: number, value: AlgorithmReasoningCheckResponse) {
    writeCachedReasoning(reasoningCacheKey(effectiveSessionId, problemId), value);
    if (currentProblemIdRef.current === problemId) {
      persistReasoning(value);
      setPhase(phaseFromResponse(value));
    }
  }

  function runBackgroundCheck(task: AlgorithmAnswerTask, answerId: number) {
    void retryAlgorithmReasoningCheck(answerId)
      .then((response) => {
        const status = response.check_status === "completed" ? "completed" : "failed";
        persistReasoningForProblem(task.problemId, response);
        updateAnswerTask({ ...task, answerId, status, error: response.check_error, response });
        if (response.check_status === "completed") void load();
      })
      .catch((checkError) => {
        updateAnswerTask({
          ...task,
          answerId,
          status: "failed",
          error: checkError instanceof Error ? checkError.message : "核对失败，回答已保留。",
          response: task.response,
        });
      });
  }

  function updateDraftApproach(value: string) {
    if (reasoningResult?.answer && value.trim() !== reasoningResult.answer.answer_text.trim() && !draftState.draft.revisionOfAnswerId) {
      draftState.beginRevision(reasoningResult.answer.answer_id);
      persistReasoning(null);
      setPhase("editing");
    }
    draftState.setDraft((current) => ({ ...current, approach: value }));
  }

  async function recoverByClientAnswerId() {
    if (!draftState.draft.clientAnswerId || fixtureEnabled) return null;

    try {
      const matches = await findAlgorithmReasoningAnswerByClientId(draftState.draft.clientAnswerId);
      const match = matches[0];
      if (!match) return null;
      return {
        save_status: match.answer.save_status,
        check_status: match.answer.check_status,
        answer: match.answer,
        feedback: match.feedback,
        save_error: null,
        check_error: match.answer.check_status === "failed" ? "上次核对没有完成，可以重新核对。" : null,
        retry: match.retry,
        problem_context: { problem_id: match.answer.problem_id, content_version: null, reasoning_available: true },
      } satisfies AlgorithmReasoningCheckResponse;
    } catch {
      return null;
    }
  }

  async function handleCheck() {
    const activeSession = session;
    if (!activeSession || !currentItem || !problemKey || !draftState.draft.approach.trim()) {
      setError("请先描述你的思路。");
      return;
    }

    const task: AlgorithmAnswerTask = {
      key: `${currentItem.problem_id}:${draftState.draft.clientAnswerId}`,
      problemId: currentItem.problem_id,
      problemTitle: currentItem.problem.title_zh || currentItem.problem.title,
      answerId: null,
      status: "saving",
      error: null,
      response: null,
    };
    updateAnswerTask(task);
    setIsChecking(true);
    setError("");
    setPhase("saving");
    timer.setIsRunning(false);
    try {
      const detail = await saveAlgorithmReasoningAnswer({
        problem_id: problemKey,
        session_id: activeSession.id,
        answer_text: draftState.draft.approach,
        answer_source: "text",
        details: {
          time_complexity: draftState.draft.timeComplexity || null,
          space_complexity: draftState.draft.spaceComplexity || null,
          code: draftState.draft.code || null,
          notes: draftState.draft.reflection || null,
        },
        client_answer_id: draftState.draft.clientAnswerId,
        revision_of_answer_id: draftState.draft.revisionOfAnswerId,
      });
      const response = responseFromSavedAnswer(detail);
      persistReasoning(response);
      setPhase(phaseFromResponse(response));
      if (response.answer) draftState.markCommitted(response.answer.answer_id, response.answer.answer_text);
      const savedTask = { ...task, answerId: detail.answer.answer_id, status: "processing" as const, response };
      updateAnswerTask(savedTask);
      if (detail.answer.check_status === "completed") {
        updateAnswerTask({ ...savedTask, status: "completed" });
      } else {
        runBackgroundCheck(savedTask, detail.answer.answer_id);
      }
      if (canMoveNext) {
        await moveTo(activeSession.current_index + 1);
      } else {
        await completeSession(null);
      }
    } catch (checkError) {
      if (checkError instanceof ApiRequestError && checkError.status === 422) {
        setPhase("saveFailed");
        setError(checkError.message);
        updateAnswerTask({ ...task, status: "failed", error: checkError.message });
      } else if (checkError instanceof ApiRequestError && checkError.status === 409) {
        draftState.beginRevision(reasoningResult?.answer?.answer_id ?? draftState.draft.committedAnswerId);
        setPhase("saveFailed");
        setError("这版回答的提交标识已经被占用。已为当前文字生成新版本，请重新保存并核对。");
        updateAnswerTask({ ...task, status: "failed", error: "client_answer_id 已存在，已生成新版本标识。" });
      } else {
        const recovered = await recoverByClientAnswerId();
        if (recovered) {
          persistReasoning(recovered);
          setPhase(phaseFromResponse(recovered));
          if (recovered.answer) {
            draftState.markCommitted(recovered.answer.answer_id, recovered.answer.answer_text);
            const recoveredTask = { ...task, answerId: recovered.answer.answer_id, status: "processing" as const, response: recovered };
            updateAnswerTask(recoveredTask);
            runBackgroundCheck(recoveredTask, recovered.answer.answer_id);
            if (canMoveNext) {
              await moveTo(activeSession.current_index + 1);
            } else {
              await completeSession(null);
            }
          }
        } else {
          setPhase("saveUnknown");
          setError("请求没有返回可确认结果。草稿仍在本机，请用同一版回答重试。");
          updateAnswerTask({ ...task, status: "failed", error: "无法确认服务端已保存，请用同一版回答重试。" });
        }
      }
    } finally {
      setIsChecking(false);
    }
  }

  async function retryCheck() {
    const answerId = reasoningResult?.answer?.answer_id;
    if (!answerId) return;
    setIsChecking(true);
    setError("");
    setPhase("checking");
    try {
      const response = await retryAlgorithmReasoningCheck(answerId);
      persistReasoning(response);
      setPhase(phaseFromResponse(response));
      if (response.answer) draftState.markCommitted(response.answer.answer_id, response.answer.answer_text);
    } catch (retryError) {
      setPhase("evaluationFailed");
      setError(retryError instanceof Error ? retryError.message : "重新核对失败，回答已保留。");
    } finally {
      setIsChecking(false);
    }
  }

  async function openAnswerTask(task: AlgorithmAnswerTask) {
    const currentSession = session;
    if (!currentSession) return;
    if (task.response) {
      writeCachedReasoning(reasoningCacheKey(effectiveSessionId, task.problemId), task.response);
    }
    const index = currentSession.items.findIndex((item) => item.problem_id === task.problemId);
    if (currentSession.status !== "in_progress") {
      if (index >= 0) {
        setSession({ ...currentSession, current_index: index });
        if (task.response) {
          setReasoningResult(task.response);
          setPhase(phaseFromResponse(task.response));
        }
        scrollQuestionToTop();
      }
      return;
    }
    if (index >= 0) await moveTo(index);
  }

  async function retryAnswerTask(task: AlgorithmAnswerTask) {
    if (!task.answerId) return;
    const nextTask = { ...task, status: "processing" as const, error: null };
    updateAnswerTask(nextTask);
    runBackgroundCheck(nextTask, task.answerId);
  }

  async function moveTo(index: number) {
    if (!session || !isOnline) return;
    const previous = session;
    setSession({ ...session, current_index: index });
    scrollQuestionToTop();
    setError("");
    try {
      const next = await updateAlgorithmSessionProgress(session.id, index, "in_progress" as AlgorithmItemStatus);
      setSession(next);
      timer.resetTimer();
      timer.setIsRunning(true);
    } catch (moveError) {
      setSession(previous);
      setError(moveError instanceof Error ? moveError.message : "无法更新训练进度。");
    }
  }

  async function skipCurrent() {
    if (!session || !isOnline) return;
    const previous = session;
    const nextIndex = Math.min(session.current_index + 1, session.items.length - 1);
    setSession({ ...session, current_index: nextIndex, items: session.items.map((item, index) => index === session.current_index ? { ...item, status: "skipped" } : item) });
    scrollQuestionToTop();
    timer.resetTimer();
    timer.setIsRunning(true);
    setError("");
    try {
      const next = await skipAlgorithmSessionProblem(session.id);
      setSession(next);
    } catch (skipError) {
      setSession(previous);
      setError(skipError instanceof Error ? skipError.message : "跳过题目失败。");
    }
  }

  async function completeSession(nextPath: string | null = "/algorithms/history") {
    if (!session || !isOnline) return;
    setError("");
    try {
      const next = await completeAlgorithmSession(session.id);
      setSession(next);
      window.localStorage.removeItem("study-diary:algorithm:last-active-session");
      timer.resetTimer();
      if (nextPath) navigate(nextPath);
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "完成训练失败。");
    }
  }

  function toggleFixtureMode() {
    const nextValue = !fixtureEnabled;
    setAlgorithmReasoningFixtureEnabled(nextValue);
    setFixtureEnabled(isAlgorithmReasoningFixtureEnabled());
    setContextResponse(null);
    persistReasoning(null);
    setPhase("editing");
  }

  if (isLoading) return <div className="page-stack"><div className="skeleton-block skeleton-session" /></div>;
  if (!session || !currentItem) return <div className="page-stack"><div className="empty-state"><p>{error || "没有可恢复的训练会话。"}</p><Link className="button button-primary" to="/algorithms">返回算法训练</Link></div></div>;
  if (session.status !== "in_progress") {
    return (
      <div className="algorithm-focus-page">
        <header className="focus-header">
          <button className="focus-back-button" onClick={() => navigate("/algorithms")} type="button"><ArrowLeftIcon aria-hidden="true" size={18} weight="bold" />算法训练</button>
          <span className="focus-save-status">训练已完成</span>
          <div className="focus-progress" aria-label={`训练进度 ${session.question_count} / ${session.question_count}`}><span><strong className="tabular-number">共 {session.question_count} 题</strong><small>已保存</small></span><i aria-hidden="true"><b style={{ inlineSize: "100%" }} /></i></div>
        </header>
        {answerTasks.length ? <AlgorithmAnswerTaskTray tasks={answerTasks} isChecking={isChecking} onDismiss={(key) => setAnswerTasks((tasks) => tasks.filter((task) => task.key !== key))} onOpen={(task) => void openAnswerTask(task)} onRetry={(task) => void retryAnswerTask(task)} /> : null}
        <main className="algorithm-focus-stack">
          <section className="reasoning-status-panel" aria-live="polite">
            <span className="pane-label">已完成全部题目</span>
            <h2>本轮训练已保存</h2>
            <p>后台核对完成后，结果会写入对应题目和今日统计。</p>
            <Link className="button button-primary" to="/algorithms">返回算法首页</Link>
          </section>
          <ReasoningStatusPanel phase={phase} result={reasoningResult} stale={false} onRetry={() => void retryCheck()} onReturnToEdit={() => setPhase("editing")} />
        </main>
      </div>
    );
  }

  return (
      <div className="algorithm-focus-page">
        <header className="focus-header">
          <button className="focus-back-button" onClick={() => navigate("/algorithms")} type="button"><ArrowLeftIcon aria-hidden="true" size={18} weight="bold" />算法训练</button>
          <span className="focus-save-status">{phaseText[phase]}</span>
          <div className="focus-progress" aria-label={`训练进度 ${session.current_index + 1} / ${session.question_count}`}><span><strong className="tabular-number">第 {session.current_index + 1} 题</strong><small>共 {session.question_count} 题</small></span><i aria-hidden="true"><b style={{ inlineSize: `${((session.current_index + 1) / session.question_count) * 100}%` }} /></i></div>
        </header>

        {fixtureEnabled ? (
          <div className="reasoning-fixture-banner" role="status"><strong>开发 fixture 已开启</strong><span>当前核对使用本地示例，不代表真实保存或模型结果。</span><button onClick={toggleFixtureMode} type="button">关闭</button></div>
        ) : import.meta.env.DEV ? (
          <button className="reasoning-fixture-toggle" onClick={toggleFixtureMode} type="button">开启思路核对 fixture 预览</button>
        ) : null}

        {!isOnline ? <p className="offline-training-note" role="status">离线模式：草稿会留在此设备；恢复网络后再保存并核对。</p> : null}
        {error ? <p className="field-error page-error" role="alert">{error}</p> : null}
        {answerTasks.length ? <AlgorithmAnswerTaskTray tasks={answerTasks} isChecking={isChecking} onDismiss={(key) => setAnswerTasks((tasks) => tasks.filter((task) => task.key !== key))} onOpen={(task) => void openAnswerTask(task)} onRetry={(task) => void retryAnswerTask(task)} /> : null}

        <main className="algorithm-focus-stack">
          <section className="algorithm-focus-problem" aria-labelledby="algorithm-problem-title">
            <div className="problem-meta-row">
              <span className={`difficulty-badge difficulty-${currentItem.problem.difficulty}`}>{difficultyLabel(currentItem.problem.difficulty)}</span>
              {currentItem.problem.topics.slice(0, 3).map((topic) => <span className="topic-token" key={topic}>{topic}</span>)}
            </div>
            <h1 id="algorithm-problem-title">{context?.title_zh || currentItem.problem.title_zh || currentItem.problem.title}</h1>
            {context ? (
              <>
                <p>{context.statement_zh}</p>
                <div className="algorithm-example-block"><strong>示例</strong><span>{context.examples[0]?.input}</span><span>返回 {context.examples[0]?.output}</span></div>
                <details className="mobile-entry-details"><summary>输入输出与约束</summary><p>{context.input_output.input}</p><p>{context.input_output.output}</p><ul>{context.constraints.map((item) => <li key={item}>{item}</li>)}</ul></details>
              </>
            ) : (
              <>
                <p>{contextError || "这道题的移动核对题意还在准备中，可先查看原题并保留本机草稿。"}</p>
                <a className="button button-secondary" href={currentItem.problem.url} rel="noreferrer" target="_blank">打开原题<ArrowRightIcon aria-hidden="true" size={16} /></a>
              </>
            )}
          </section>

          <section className="algorithm-reasoning-editor" aria-label="思路输入">
            <div className="editor-header">
              <div><span className="pane-label">我的思路</span><h2>讲讲你会怎么做</h2></div>
              <button className="timer-control" aria-label={timer.isRunning ? "暂停计时" : "继续计时"} onClick={() => timer.setIsRunning((value) => !value)} type="button">{timer.isRunning ? <PauseIcon aria-hidden="true" size={17} weight="fill" /> : <PlayIcon aria-hidden="true" size={17} weight="fill" />}{formatElapsedTime(timer.elapsedSeconds)}</button>
            </div>
            <label className="form-field">
              <span>思路</span>
              <textarea autoComplete="off" onChange={(event) => updateDraftApproach(event.target.value)} placeholder="可以用系统键盘听写。说清楚观察、做法、关键判断和你不确定的地方。" value={draftState.draft.approach} />
            </label>
            <span className="draft-save-state" role="status">{phase === "editing" ? "本机草稿会自动保留" : phaseText[phase]}</span>
            {isFeedbackStale ? <p className="draft-recovery-notice">你正在修改回答，新文字会作为新版本重新核对。</p> : null}
            <details className="mobile-entry-details">
              <summary>可选补充</summary>
              <div className="form-two-columns"><label className="form-field"><span>时间复杂度</span><input onChange={(event) => draftState.setDraft((value) => ({ ...value, timeComplexity: event.target.value }))} placeholder="例如 O(n)" value={draftState.draft.timeComplexity} /></label><label className="form-field"><span>空间复杂度</span><input onChange={(event) => draftState.setDraft((value) => ({ ...value, spaceComplexity: event.target.value }))} placeholder="例如 O(n)" value={draftState.draft.spaceComplexity} /></label></div>
              <label className="form-field"><span>边界和备注</span><textarea onChange={(event) => draftState.setDraft((value) => ({ ...value, reflection: event.target.value }))} value={draftState.draft.reflection} /></label>
              <label className="form-field"><span>代码文本</span><textarea className="algorithm-code-input" onChange={(event) => draftState.setDraft((value) => ({ ...value, code: event.target.value }))} spellCheck={false} value={draftState.draft.code} /></label>
            </details>
          </section>

          <ReasoningStatusPanel phase={phase} result={reasoningResult} stale={isFeedbackStale} onRetry={() => void retryCheck()} onReturnToEdit={() => setPhase("editing")} />
          <footer className="mobile-focus-actions">
            <button className="button button-secondary" disabled={!canMovePrevious || !isOnline || isChecking} onClick={() => void moveTo(session.current_index - 1)} type="button"><ArrowLeftIcon aria-hidden="true" size={16} />上一题</button>
            <button className="button button-secondary" disabled={!isOnline || isChecking} onClick={() => void skipCurrent()} type="button"><SkipForwardIcon aria-hidden="true" size={16} />跳过</button>
            {phase === "evaluationFailed" && reasoningResult?.answer ? (
              <button className="button button-primary" disabled={!isOnline || isChecking} onClick={() => void retryCheck()} type="button"><ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />重新核对</button>
            ) : (
              <button className="button button-primary" disabled={!canCheck} onClick={() => void handleCheck()} type="button">{isChecking ? <SpinnerGapIcon aria-hidden="true" className="action-spinner" size={16} /> : <CheckIcon aria-hidden="true" size={16} weight="bold" />}{isChecking ? phaseText[phase] : "帮我核对"}</button>
            )}
            {canMoveNext ? <button className="button button-secondary" disabled={!isOnline || isChecking} onClick={() => void moveTo(session.current_index + 1)} type="button">下一题<ArrowRightIcon aria-hidden="true" size={16} /></button> : <button className="button button-secondary" disabled={!isOnline || isChecking} onClick={() => void completeSession()} type="button"><FlagIcon aria-hidden="true" size={16} />完成</button>}
          </footer>
        </main>
      </div>
  );
}

function ReasoningStatusPanel({
  phase,
  result,
  stale,
  onRetry,
  onReturnToEdit,
}: {
  phase: ReasoningPhase;
  result: AlgorithmReasoningCheckResponse | null;
  stale: boolean;
  onRetry: () => void;
  onReturnToEdit: () => void;
}) {
  if (phase === "editing" || stale) return null;

  if (phase === "saving" || phase === "checking") {
    return <section className="reasoning-status-panel" aria-live="polite"><span className="pane-label">{phase === "saving" ? "保存中" : "核对中"}</span><h2>{phaseText[phase]}</h2><p>{phase === "saving" ? "还没有收到服务端确认，暂时不显示已保存。" : "回答已保存，正在等待核对结果。"}</p></section>;
  }

  if (phase === "saveUnknown" || phase === "saveFailed") {
    return <section className="reasoning-status-panel reasoning-status-danger" aria-live="polite"><WarningCircleIcon aria-hidden="true" size={22} weight="fill" /><span className="pane-label">{phase === "saveFailed" ? "保存失败" : "保存未完成"}</span><h2>{phaseText[phase]}</h2><p>{result?.save_error ?? "核对尚未开始；本机草稿仍保留。请用同一版回答重试。"}</p><button className="button button-secondary" onClick={onReturnToEdit} type="button">继续编辑</button></section>;
  }

  if (phase === "evaluationFailed" || phase === "contextUnavailable") {
    return <section className="reasoning-status-panel reasoning-status-danger" aria-live="polite"><WarningCircleIcon aria-hidden="true" size={22} weight="fill" /><span className="pane-label">回答已保存</span><h2>{phaseText[phase]}</h2><p>{result?.check_error ?? "这不是答案问题；可能是网络、服务或题目上下文暂时不可用。"}</p>{phase === "evaluationFailed" ? <button className="button button-secondary" onClick={onRetry} type="button">重新核对</button> : null}</section>;
  }

  if (!result?.feedback) return null;

  const feedback = result.feedback;
  const correct = feedback.correct_parts.slice(0, 3);
  const missing = feedback.issues_or_missing.slice(0, 3);

  return (
    <section className="reasoning-feedback" aria-live="polite" aria-labelledby="reasoning-feedback-title">
      <span className="pane-label">这次核对</span>
      <h2 id="reasoning-feedback-title">{conclusionLabel(feedback.conclusion)}</h2>
      <p>{feedback.headline}</p>

      {correct.length ? <section className="feedback-block feedback-block-good"><h3>你已说对</h3><ul>{correct.map((item) => <li key={item.point}>{item.point}{item.quote ? <small>来自：{item.quote}</small> : null}</li>)}</ul></section> : null}
      {missing.length ? <section className="feedback-block"><h3>最值得补充</h3><ul>{missing.map((item) => <li key={item.detail}>{item.detail}{item.quote ? <small>来自：{item.quote}</small> : null}</li>)}</ul></section> : null}
      {feedback.counterexample_or_followup.content ? <section className="feedback-block"><h3>{feedback.counterexample_or_followup.kind === "counterexample" ? "反例" : "追问"}</h3><p>{feedback.counterexample_or_followup.content}</p></section> : null}

      <details className="feedback-details"><summary>查看复杂度与参考思路</summary><p>时间：{feedback.complexity.time.expected ?? "待确认"}。{feedback.complexity.time.note}</p><p>空间：{feedback.complexity.space.expected ?? "待确认"}。{feedback.complexity.space.note}</p><p>{feedback.reference_outline}</p></details>
    </section>
  );
}

function AlgorithmAnswerTaskTray({
  tasks,
  isChecking,
  onDismiss,
  onOpen,
  onRetry,
}: {
  tasks: AlgorithmAnswerTask[];
  isChecking: boolean;
  onDismiss: (key: string) => void;
  onOpen: (task: AlgorithmAnswerTask) => void;
  onRetry: (task: AlgorithmAnswerTask) => void;
}) {
  const statusLabel = {
    saving: "保存中",
    processing: "核对中",
    completed: "完成",
    failed: "失败",
  };

  return (
    <section className="interview-answer-task-tray" aria-label="算法回答核对状态" aria-live="polite">
      <div className="section-heading">
        <div><span className="pane-label">后台核对</span><h2>回答状态</h2></div>
        <span>{tasks.length} 条</span>
      </div>
      <div className="interview-answer-task-list">
        {tasks.map((task) => (
          <article className={`interview-answer-task interview-answer-task-${task.status}`} key={task.key}>
            <div>
              <span className="pane-label">{task.status === "saving" || task.status === "processing" ? <SpinnerGapIcon aria-hidden="true" className="interview-task-spinner" size={13} /> : null}{statusLabel[task.status]}</span>
              <h3>{task.problemTitle}</h3>
              {task.status === "saving" ? <p>正在确认保存，计时已经停住。</p> : null}
              {task.status === "processing" ? <p>回答已保存，正在后台核对。可以继续刷下一题。</p> : null}
              {task.status === "completed" ? <p>核对完成，结果已写入本题记录。</p> : null}
              {task.status === "failed" ? <p>{task.error ?? "核对失败，回答已保留。"}</p> : null}
            </div>
            <div className="interview-answer-task-actions">
              <button className="button button-secondary" onClick={() => onOpen(task)} type="button">查看</button>
              {task.status === "failed" && task.answerId ? <button className="button button-secondary" disabled={isChecking} onClick={() => onRetry(task)} type="button">重新核对</button> : null}
              {task.status === "completed" || task.status === "failed" ? <button className="text-danger-button" onClick={() => onDismiss(task.key)} type="button">关闭</button> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
