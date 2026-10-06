import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";
import { Screen } from "../../components/Screen";
import { DAILY_QUESTION_COUNT, difficultyLabel } from "../../services/presentation";
import "./index.scss";

type Problem = { id: number; title: string; title_zh: string | null; difficulty: string; topics: string[] };
type Feed = { primary_problem: Problem; primary_problem_completed: boolean; settings_summary: string };
type Stats = { today_completed_count: number; due_review_count: number; unique_solved_count: number };
export default function AlgorithmPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDidShow(() => { void load(); });
  async function load() {
    try { const [a, b] = await Promise.all([api<Feed>("/api/algorithms/daily-feed"), api<Stats>("/api/algorithms/stats")]); setFeed(a); setStats(b); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "读取算法推荐失败。"); }
  }
  const remaining = Math.max(0, DAILY_QUESTION_COUNT - (stats?.today_completed_count || 0));
  async function start() {
    setBusy(true); setError("");
    try { const session = await api<{ id: string }>("/api/algorithms/sessions", { method: "POST", data: { mode: "daily", count: remaining || DAILY_QUESTION_COUNT, prioritize_due_review: true } }); void Taro.navigateTo({ url: `/pages/algorithm-session/index?id=${session.id}` }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "创建训练失败。"); }
    finally { setBusy(false); }
  }
  return <Screen className="algorithm-screen">
    <View className="page-header centered"><Text className="page-title">算法训练</Text><Text className="page-subtitle">先说清思路，再写下答案。</Text></View>
    <View className="algorithm-stats">{[{ value: stats?.today_completed_count, label: "今日完成" }, { value: stats?.unique_solved_count, label: "已掌握" }, { value: stats?.due_review_count, label: "待复习" }].map(item => <View key={item.label}><Text className="algorithm-stat-number">{item.value ?? "—"}</Text><Text className="algorithm-stat-label">{item.label}</Text></View>)}</View>
    <Text className="section-title">今日主推荐</Text>
    <View className="card problem-card"><View className="problem-topline"><Text>{feed ? remaining ? "下一道" : "今日已完成" : "正在准备"}</Text>{feed ? <Text className={`difficulty difficulty-${feed.primary_problem.difficulty.toLowerCase()}`}>{difficultyLabel(feed.primary_problem.difficulty)}</Text> : null}</View><Text className="problem-title">{feed?.primary_problem.title_zh || feed?.primary_problem.title || "正在准备题目…"}</Text><Text className="muted">{feed?.primary_problem.topics?.join(" · ") || "题型正在同步"}</Text><Text className="problem-invitation">{feed && !remaining ? "今天的目标完成了，还可以继续加练。" : "试着说说，你会如何找到解题思路？"}</Text><Button className="button button-primary" loading={busy} disabled={busy || !feed} onClick={() => void start()}>{remaining ? "开始今天的练习" : "继续加练"}</Button></View>
    <View className="review-note"><Text className="review-note-title">复习从不是倒退</Text><Text className="review-note-copy">回看 {stats?.due_review_count ?? "—"} 道做过的题，让思路慢慢扎根。</Text></View>
    {error ? <Text className="error">{error}</Text> : null}
  </Screen>;
}
