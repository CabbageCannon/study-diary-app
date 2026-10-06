import { Text, View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
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
    {loading ? <View className="loading">正在整理今天的学习轨迹…</View> : <><View className="today-focus"><Text className="focus-kicker">TODAY'S RHYTHM</Text><Text className="focus-copy">一点一点，也算向前。</Text><View className="progress-row"><View className="progress-item"><Text className="progress-number">{interviewCount}</Text><Text className="progress-label">八股</Text></View><View className="progress-item"><Text className="progress-number">{algorithmCount}</Text><Text className="progress-label">算法</Text></View><View className="progress-item"><Text className="progress-number">{diaryCount}</Text><Text className="progress-label">日记</Text></View></View></View><View className="card quiet-card"><Text className="card-title">不急着赶路</Text><Text className="muted">连续学习 {Math.max(algorithm?.current_streak_days || 0, interview?.current_streak_days || 0)} 天</Text><View className="today-divider" /><Text className="muted">有 {Math.max(algorithm?.due_review_count || 0, interview?.due_review_count || 0)} 项内容，等你再见一面。</Text></View></>}
    {error ? <Text className="error">{error}</Text> : null}
  </View>;
}
