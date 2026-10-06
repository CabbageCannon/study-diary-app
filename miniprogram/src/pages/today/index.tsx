import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";

type AlgorithmStats = { today_completed_count: number; current_streak_days: number; due_review_count: number };
type InterviewStats = { today_answered_count?: number; today_completed_count?: number; current_streak_days?: number; due_review_count?: number };
type Diary = { id: number; date: string; status: string };

export default function TodayPage() {
  const [loading, setLoading] = useState(true);
  const [algorithm, setAlgorithm] = useState<AlgorithmStats | null>(null);
  const [interview, setInterview] = useState<InterviewStats | null>(null);
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [error, setError] = useState("");
  useDidShow(() => { void load(); });
  async function load() {
    setLoading(true); setError("");
    try {
      const [algorithmData, interviewData, diaryData] = await Promise.all([
        api<AlgorithmStats>("/api/algorithms/stats"), api<InterviewStats>("/api/interviews/stats"), api<Diary[]>("/api/diaries"),
      ]);
      setAlgorithm(algorithmData); setInterview(interviewData); setDiaries(diaryData);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "今日数据暂时不可用。"); }
    finally { setLoading(false); }
  }
  const today = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  const interviewCount = interview?.today_answered_count ?? interview?.today_completed_count ?? 0;
  const algorithmCount = algorithm?.today_completed_count ?? 0;
  const diaryCount = diaries.filter((item) => item.status === "published").length;
  return <View className="screen">
    <View className="page-header"><Text className="eyebrow">{today}</Text><Text className="page-title">今天，也慢慢变好。</Text><Text className="page-subtitle">把注意力还给一件真正重要的小事。</Text></View>
    {loading ? <View className="loading">正在整理今天的学习轨迹…</View> : <><View className="today-focus"><Text className="focus-kicker">TODAY'S RHYTHM</Text><Text className="focus-copy">一点一点，也算向前。</Text><Text className="focus-total">今天完成 {interviewCount + algorithmCount + diaryCount} 项练习与记录</Text></View><Text className="section-label">今日进度</Text><View className="today-task-list"><View className="today-task-card" onClick={() => Taro.switchTab({ url: "/pages/interview/index" })}><View className="task-index"><Text>{interviewCount}</Text><Text>/ 3</Text></View><View className="task-copy"><Text className="task-title">八股练习</Text><Text className="task-detail">整理表达，让思路更清晰</Text></View><Text className="task-arrow">›</Text></View><View className="today-task-card" onClick={() => Taro.switchTab({ url: "/pages/algorithm/index" })}><View className="task-index"><Text>{algorithmCount}</Text><Text>/ 3</Text></View><View className="task-copy"><Text className="task-title">算法练习</Text><Text className="task-detail">先把解题路径说清楚</Text></View><Text className="task-arrow">›</Text></View><View className="today-task-card" onClick={() => Taro.switchTab({ url: "/pages/diary/index" })}><View className="task-index"><Text>{diaryCount ? "✓" : "0"}</Text><Text>{diaryCount ? "已记" : "/ 1"}</Text></View><View className="task-copy"><Text className="task-title">留下一则日记</Text><Text className="task-detail">为今天存下一点感受</Text></View><Text className="task-arrow">›</Text></View></View><View className="card quiet-card"><Text className="card-title">不急着赶路</Text><Text className="muted">连续学习 {Math.max(algorithm?.current_streak_days || 0, interview?.current_streak_days || 0)} 天</Text><View className="today-divider" /><Text className="muted">有 {Math.max(algorithm?.due_review_count || 0, interview?.due_review_count || 0)} 项内容，等你再见一面。</Text></View></>}
    {error ? <Text className="error">{error}</Text> : null}
  </View>;
}
