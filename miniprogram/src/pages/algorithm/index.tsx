import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";

type Problem = { id: number; title: string; title_zh: string | null; difficulty: string; topics: string[] };
type Feed = { primary_problem: Problem; primary_problem_completed: boolean; settings_summary: string };
type Stats = { today_completed_count: number; due_review_count: number; unique_solved_count: number };

export default function AlgorithmPage() {
  const [feed, setFeed] = useState<Feed | null>(null); const [stats, setStats] = useState<Stats | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useDidShow(() => { void load(); });
  async function load() { try { const [a, b] = await Promise.all([api<Feed>("/api/algorithms/daily-feed"), api<Stats>("/api/algorithms/stats")]); setFeed(a); setStats(b); } catch (reason) { setError(reason instanceof Error ? reason.message : "读取算法推荐失败。"); } }
  async function start() { setBusy(true); try { const session = await api<{ id: string }>("/api/algorithms/sessions", { method: "POST", data: { mode: "daily", count: 3, prioritize_due_review: true } }); Taro.navigateTo({ url: `/pages/algorithm-session/index?id=${session.id}` }); } catch (reason) { setError(reason instanceof Error ? reason.message : "创建训练失败。"); } finally { setBusy(false); } }
  return <View className="screen"><Text className="eyebrow">ALGORITHM PRACTICE</Text><Text className="page-title">算法训练</Text><Text className="page-subtitle">先说清思路，再写下答案。</Text><View className="card"><Text className="card-title">{feed?.primary_problem_completed ? "今日推荐已完成" : "今日主推荐"}</Text><Text className="problem-title">{feed?.primary_problem.title_zh || feed?.primary_problem.title || "正在准备题目…"}</Text><Text className="muted">{feed?.primary_problem.difficulty} · {feed?.primary_problem.topics?.join(" · ")}</Text><Button className="button button-primary" loading={busy} onClick={() => void start()}>开始今日训练</Button></View><View className="card"><Text className="card-title">学习状态</Text><Text className="muted">今日完成 {stats?.today_completed_count ?? 0} 题 · 已掌握 {stats?.unique_solved_count ?? 0} 题 · 待复习 {stats?.due_review_count ?? 0} 题</Text></View>{error ? <Text className="error">{error}</Text> : null}</View>;
}
