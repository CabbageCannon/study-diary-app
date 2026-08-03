import { PlayIcon } from "@phosphor-icons/react/Play";

import type { AlgorithmSessionSummary } from "../../types/algorithm";

interface AlgorithmResumeBannerProps {
  session: AlgorithmSessionSummary;
  onResume: () => void;
}

const modeLabels: Record<string, string> = { daily: "今日训练", hot100: "Hot 100", topic: "按题型", difficulty: "按难度", random: "随机", weakness: "薄弱点", wrong: "错题", similar: "相似题", custom: "自选训练", review: "复习训练" };

export function AlgorithmResumeBanner({ session, onResume }: AlgorithmResumeBannerProps) {
  return <section className="algorithm-resume-banner"><div><span>继续上次训练</span><strong>{modeLabels[session.mode] ?? "算法训练"}</strong><small className="tabular-number">{session.solved_count}/{session.question_count} 已完成</small></div><button className="button button-secondary" onClick={onResume} type="button"><PlayIcon aria-hidden="true" size={16} weight="fill" />继续</button></section>;
}
