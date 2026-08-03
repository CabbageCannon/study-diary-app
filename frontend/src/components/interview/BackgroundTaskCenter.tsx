import { useState } from "react";

import { ExpandableSection } from "./ExpandableSection";
import { useInterviewBatchJobs } from "../../contexts/InterviewBatchJobContext";
import type { InterviewBatchJob } from "../../types/interview";

const jobTypeLabels: Record<InterviewBatchJob["type"], string> = {
  ai_review: "AI 审核",
  quick_publish: "快速正式化",
  reject: "批量拒绝",
};

function jobSummary(job: InterviewBatchJob) {
  if (job.status === "queued") return `等待开始，${job.total} 道题已加入队列`;
  if (job.status === "running") return `正在处理 ${job.processed_count} / ${job.total}`;
  if (job.status === "completed") return `完成：正式化 ${job.published_count}，待人工处理 ${job.kept_pending_count}`;
  return `结束：成功 ${job.succeeded_count}，失败 ${job.failed_count}`;
}

export function BackgroundTaskCenter() {
  const { jobs, notices, dismissNotice } = useInterviewBatchJobs();
  const [collapsed, setCollapsed] = useState(false);
  const visibleJobs = jobs.filter((job) => job.status === "queued" || job.status === "running" || job.status === "partial_failed" || job.status === "failed").slice(0, 3);

  return (
    <aside className="background-task-center" aria-label="后台任务">
      <div className="task-toast-stack" aria-live="polite" aria-atomic="true">
        {notices.map((notice) => <div className={`task-toast task-toast-${notice.tone}`} key={notice.id}><span>{notice.message}</span><button aria-label="关闭提示" onClick={() => dismissNotice(notice.id)} type="button">关闭</button></div>)}
      </div>
      {visibleJobs.length ? <section className={`task-center-panel ${collapsed ? "task-center-panel-collapsed" : ""}`}>
        <header><div><span className="pane-label">后台任务</span><strong>{visibleJobs.length} 项</strong></div><button className="ghost-button" onClick={() => setCollapsed((value) => !value)} type="button">{collapsed ? "展开" : "收起"}</button></header>
        {!collapsed ? <div className="task-center-list">{visibleJobs.map((job) => <article className="task-center-item" key={job.id}>
          <div className="task-center-item-header"><strong>{jobTypeLabels[job.type]}</strong><span>{job.status === "running" ? "处理中" : job.status}</span></div>
          <p>{jobSummary(job)}</p>
          <div className="task-progress" aria-label={`${job.processed_count} / ${job.total}`}><span style={{ transform: `scaleX(${job.total ? job.processed_count / job.total : 0})` }} /></div>
          {job.failed_count || job.error ? <ExpandableSection label={`查看失败详情 ${job.failed_count ? `(${job.failed_count})` : ""}`} className="task-failure-details"><ul>{job.error ? <li>{job.error}</li> : null}{job.items.filter((item) => item.status === "failed").map((item) => <li key={item.id}><strong>{item.question_id}</strong>{item.message ? `：${item.message}` : ""}</li>)}</ul></ExpandableSection> : null}
        </article>)}</div> : null}
      </section> : null}
    </aside>
  );
}
