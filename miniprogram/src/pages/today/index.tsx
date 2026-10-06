import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";
import { Screen } from "../../components/Screen";
import { Icon } from "../../components/Icon";
import { DAILY_QUESTION_COUNT, localDateKey } from "../../services/presentation";
import "./index.scss";

type AlgorithmStats = { today_completed_count: number; current_streak_days: number };
type InterviewStats = { today_answered_count?: number; today_completed_count?: number; current_streak_days?: number };
type Diary = { id: number; date: string; status: string };

export default function TodayPage() {
  const [loading, setLoading] = useState(true);
  const [algorithm, setAlgorithm] = useState<AlgorithmStats | null>(null);
  const [interview, setInterview] = useState<InterviewStats | null>(null);
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [error, setError] = useState("");
  useDidShow(() => { void load(); });
  async function load() {
    setError("");
    try {
      const [a, b, c] = await Promise.all([api<AlgorithmStats>("/api/algorithms/stats"), api<InterviewStats>("/api/interviews/stats"), api<Diary[]>("/api/diaries")]);
      setAlgorithm(a); setInterview(b); setDiaries(c);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "今日数据暂时不可用。"); }
    finally { setLoading(false); }
  }
  const interviewCount = interview?.today_answered_count ?? interview?.today_completed_count ?? 0;
  const algorithmCount = algorithm?.today_completed_count ?? 0;
  const diaryCount = diaries.filter(item => item.status === "published" && item.date === localDateKey()).length;
  const completed = Math.min(interviewCount, DAILY_QUESTION_COUNT) + Math.min(algorithmCount, DAILY_QUESTION_COUNT) + (diaryCount ? 1 : 0);
  const target = DAILY_QUESTION_COUNT * 2 + 1;
  const tasks = [
    { title: "八股练习", copy: "巩固基础，稳步提升", value: `${Math.min(interviewCount, DAILY_QUESTION_COUNT)} / ${DAILY_QUESTION_COUNT}`, url: "/pages/interview/index" },
    { title: "算法练习", copy: "多写多想，提升思维", value: `${Math.min(algorithmCount, DAILY_QUESTION_COUNT)} / ${DAILY_QUESTION_COUNT}`, url: "/pages/algorithm/index" },
    { title: "日记记录", copy: "记录今天的思考与收获", value: diaryCount ? "已记录" : "未记录", url: "/pages/diary/index" },
  ];
  const next = interviewCount < DAILY_QUESTION_COUNT ? tasks[0] : algorithmCount < DAILY_QUESTION_COUNT ? tasks[1] : tasks[2];
  return <Screen className="today-screen">
    <View className="today-hero"><Text className="today-date">{new Date().getMonth() + 1}月{new Date().getDate()}日　{["周日","周一","周二","周三","周四","周五","周六"][new Date().getDay()]}</Text><Text className="today-sentence">把今天的一小步，{"\n"}留给明天的自己。</Text></View>
    <View className="today-heading"><View><Text className="section-title">今日进度</Text><Text className="muted">继续今天的学习</Text></View><Text className="today-total">{loading ? "同步中" : `${completed} / ${target}`}</Text></View>
    <View className="card today-progress">
      <View className="progress-segments">{Array.from({ length: target }, (_, index) => <View key={index} className={`progress-segment ${index < completed ? "is-filled" : ""} ${loading ? "is-loading" : ""}`} />)}</View>
      {tasks.map(task => <View key={task.url} className="progress-line" onClick={() => Taro.switchTab({ url: task.url })}><View className="progress-copy"><Text className="progress-title">{task.title}</Text><Text className="progress-subtitle">{task.copy}</Text></View><Text className="progress-value">{loading ? "—" : task.value}</Text><Icon name="caretRight" className="progress-chevron" /></View>)}
    </View>
    <View className="button button-primary today-continue" onClick={() => Taro.switchTab({ url: next.url })}><Text>{completed >= target ? "今天已完成，写点日记" : "继续今天的学习"}</Text><Icon name="arrowRightLight" /></View>
    <Text className="today-streak">连续学习 {Math.max(algorithm?.current_streak_days || 0, interview?.current_streak_days || 0)} 天</Text>
    {error ? <Text className="error">{error}</Text> : null}
  </Screen>;
}
