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
  return <View className="screen">
    <Text className="eyebrow">{today}</Text><Text className="page-title">今天，也慢慢变好。</Text><Text className="page-subtitle">把注意力还给一件真正重要的小事。</Text>
    {loading ? <View className="loading">正在整理今天的学习轨迹…</View> : <><View className="card"><Text className="card-title">今日进度</Text><View className="progress-row"><View><Text className="progress-number">{interview?.today_answered_count ?? interview?.today_completed_count ?? 0}</Text><Text className="progress-label">八股完成</Text></View><View><Text className="progress-number">{algorithm?.today_completed_count ?? 0}</Text><Text className="progress-label">算法完成</Text></View><View><Text className="progress-number">{diaries.filter((item) => item.status === "published").length}</Text><Text className="progress-label">日记记录</Text></View></View></View><View className="card"><Text className="card-title">不急着赶路</Text><Text className="muted">连续学习 {Math.max(algorithm?.current_streak_days || 0, interview?.current_streak_days || 0)} 天 · 待复习 {Math.max(algorithm?.due_review_count || 0, interview?.due_review_count || 0)} 项</Text></View></>}
    {error ? <Text className="error">{error}</Text> : null}
  </View>;
}
