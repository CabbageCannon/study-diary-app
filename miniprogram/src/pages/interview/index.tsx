import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";
import { Screen } from "../../components/Screen";
import { Icon } from "../../components/Icon";
import { DAILY_QUESTION_COUNT, dateLabel } from "../../services/presentation";
import "./index.scss";

type Stats = { today_answered_count?: number; current_streak_days?: number; due_review_count?: number };
type QuestionSet = { id: number; status: string; question_count: number; answered_count?: number; created_at: string };
export default function InterviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useDidShow(() => { void load(); });
  async function load() {
    try {
      const [a, b] = await Promise.all([api<Stats>("/api/interviews/stats"), api<QuestionSet[]>("/api/interviews/question-sets?limit=8")]);
      setStats(a); setSets(b); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "读取训练记录失败。"); }
    finally { setLoading(false); }
  }
  const active = sets.find(item => item.status === "in_progress");
  const remaining = Math.max(0, DAILY_QUESTION_COUNT - (stats?.today_answered_count || 0));
  async function start() {
    if (active) { void Taro.navigateTo({ url: `/pages/interview-session/index?id=${active.id}` }); return; }
    setBusy(true); setError("");
    try {
      const created = await api<QuestionSet>("/api/interviews/question-sets", { method: "POST", data: { question_count: remaining || DAILY_QUESTION_COUNT, include_due_reviews: true, random_order: true } });
      void Taro.navigateTo({ url: `/pages/interview-session/index?id=${created.id}` });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "创建训练失败。"); }
    finally { setBusy(false); }
  }
  return <Screen className="interview-screen">
    <View className="page-header centered"><Text className="page-title">八股训练</Text><Text className="page-subtitle">把理解说清楚</Text></View>
    <View className="interview-stats"><Text>今日 <Text className="stat-emphasis">{stats?.today_answered_count ?? "—"}</Text> 题</Text><Text>连续 <Text className="stat-emphasis">{stats?.current_streak_days ?? "—"}</Text> 天</Text><Text>待复习 <Text className="stat-emphasis">{stats?.due_review_count ?? "—"}</Text> 题</Text></View>
    <Text className="section-title">今日练习</Text>
    <View className="card interview-feature"><Text className="muted">{loading ? "正在整理今天的练习…" : remaining ? `还差 ${remaining} 道，${active ? "继续这一轮" : "从这一轮开始"}` : "今日八股已完成"}</Text><Text className="interview-feature-title">{active ? "继续本轮训练" : remaining ? "开始今天的练习" : "今天的目标完成了"}</Text><Text className="muted">{active ? "你的回答与进度已经保存。" : remaining ? "挑几道题，认真说说你的理解。" : "还想练习的话，再开始一轮。"}</Text><Button className="button button-primary" loading={busy} disabled={busy || loading} onClick={() => void start()}>{active ? "继续练习" : remaining ? "开始练习" : "继续加练"}</Button></View>
    <Text className="section-title history-heading">最近记录</Text>
    <View className="card history-card">{loading && !sets.length ? <Text className="loading">正在读取训练记录…</Text> : sets.length ? sets.map(item => <View className="history-row" key={item.id} onClick={() => Taro.navigateTo({ url: `/pages/interview-session/index?id=${item.id}` })}><View className="history-copy"><Text className="history-title">{item.status === "in_progress" ? "进行中的训练" : "已完成训练"}</Text><Text className="history-date">{dateLabel(item.created_at)}</Text></View><Text className="history-count">{item.answered_count ?? 0} / {item.question_count}</Text><Icon name="caretRight" className="history-chevron" /></View>) : <Text className="empty-note">第一轮训练，会从今天开始。</Text>}</View>
    {error ? <Text className="error">{error}</Text> : null}
  </Screen>;
}
