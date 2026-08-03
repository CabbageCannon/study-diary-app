import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { createInterviewBatchJob, listInterviewBatchJobs } from "../api/interviews";
import type { InterviewBatchJob, InterviewBatchJobCreatePayload } from "../types/interview";

type NoticeTone = "success" | "error" | "info";

export interface TaskNotice {
  id: number;
  message: string;
  tone: NoticeTone;
}

interface InterviewBatchJobContextValue {
  jobs: InterviewBatchJob[];
  processingQuestionIds: Set<string>;
  notices: TaskNotice[];
  submitBatchJob: (payload: InterviewBatchJobCreatePayload) => Promise<InterviewBatchJob>;
  notify: (message: string, tone?: NoticeTone) => void;
  dismissNotice: (noticeId: number) => void;
}

const InterviewBatchJobContext = createContext<InterviewBatchJobContextValue | null>(null);
const ACTIVE_STATUSES = new Set(["queued", "running"]);

export function InterviewBatchJobProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [jobs, setJobs] = useState<InterviewBatchJob[]>([]);
  const [notices, setNotices] = useState<TaskNotice[]>([]);
  const knownStatusesRef = useRef(new Map<string, string>());
  const noticeIdRef = useRef(0);
  const noticeTimersRef = useRef(new Map<number, number>());

  const dismissNotice = useCallback((noticeId: number) => {
    const timer = noticeTimersRef.current.get(noticeId);
    if (timer !== undefined) window.clearTimeout(timer);
    noticeTimersRef.current.delete(noticeId);
    setNotices((current) => current.filter((notice) => notice.id !== noticeId));
  }, []);

  const notify = useCallback((message: string, tone: NoticeTone = "info") => {
    const id = ++noticeIdRef.current;
    setNotices((current) => [...current.slice(-2), { id, message, tone }]);
    const timer = window.setTimeout(() => dismissNotice(id), 5200);
    noticeTimersRef.current.set(id, timer);
  }, [dismissNotice]);

  useEffect(() => {
    if (!enabled) {
      setJobs([]);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;

    const schedule = (delay: number) => {
      if (!cancelled) timer = window.setTimeout(poll, delay);
    };
    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const nextJobs = await listInterviewBatchJobs(controller.signal);
        if (cancelled) return;
        for (const job of nextJobs) {
          const previousStatus = knownStatusesRef.current.get(job.id);
          if (previousStatus && ACTIVE_STATUSES.has(previousStatus) && !ACTIVE_STATUSES.has(job.status)) {
            notify(
              job.status === "completed"
                ? `批量任务完成：正式化 ${job.published_count}，待人工处理 ${job.kept_pending_count}。`
                : `批量任务结束：成功 ${job.succeeded_count}，失败 ${job.failed_count}。`,
              job.status === "completed" ? "success" : "error",
            );
          }
          knownStatusesRef.current.set(job.id, job.status);
        }
        setJobs(nextJobs);
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          // Network errors are kept quiet here; page-level actions surface actionable failures.
        }
      } finally {
        if (!cancelled) {
          const hasActiveJobs = nextHasActiveJobs();
          schedule(hasActiveJobs ? (document.hidden ? 6000 : 1500) : 10000);
        }
      }
    };
    const nextHasActiveJobs = () => {
      return Array.from(knownStatusesRef.current.values()).some((status) => ACTIVE_STATUSES.has(status));
    };
    const onVisibilityChange = () => {
      if (!document.hidden) {
        if (timer !== null) window.clearTimeout(timer);
        void poll();
      }
    };
    void poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      controller?.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, notify]);

  useEffect(() => () => {
    noticeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const submitBatchJob = useCallback(async (payload: InterviewBatchJobCreatePayload) => {
    const job = await createInterviewBatchJob(payload);
    knownStatusesRef.current.set(job.id, job.status);
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 12));
    return job;
  }, []);

  const processingQuestionIds = useMemo(() => {
    const ids = new Set<string>();
    jobs.filter((job) => ACTIVE_STATUSES.has(job.status)).forEach((job) => {
      job.items.filter((item) => item.status === "pending" || item.status === "running").forEach((item) => ids.add(item.question_id));
    });
    return ids;
  }, [jobs]);

  const value = useMemo(() => ({
    jobs,
    processingQuestionIds,
    notices,
    submitBatchJob,
    notify,
    dismissNotice,
  }), [dismissNotice, jobs, notices, notify, processingQuestionIds, submitBatchJob]);

  return <InterviewBatchJobContext.Provider value={value}>{children}</InterviewBatchJobContext.Provider>;
}

export function useInterviewBatchJobs() {
  const context = useContext(InterviewBatchJobContext);
  if (!context) throw new Error("useInterviewBatchJobs must be used within InterviewBatchJobProvider");
  return context;
}
