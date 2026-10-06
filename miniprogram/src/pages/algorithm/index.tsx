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
  return <View className="screen"><View className="page-header"><Text className="eyebrow">ALGORITHM PRACTICE</Text><Text className="page-title">算法训练</Text><Text className="page-subtitle">先说清思路，再写下答案。</Text></View><View className="algorithm-stats"><View><Text className="algorithm-stat-number">{stats?.today_completed_count ?? 0}</Text><Text className="algorithm-stat-label">今日完成</Text></View><View><Text className="algorithm-stat-number">{stats?.unique_solved_count ?? 0}</Text><Text className="algorithm-stat-label">已掌握</Text></View><View><Text className="algorithm-stat-number">{stats?.due_review_count ?? 0}</Text><Text className="algorithm-stat-label">待复习</Text></View></View><Text className="section-label">今日主推荐</Text><View className="card problem-card"><View className="problem-topline"><Text>{feed?.primary_problem_completed ? "已经完成" : "下一道"}</Text><Text>{feed?.primary_problem.difficulty || "准备中"}</Text></View><Text className="problem-title">{feed?.primary_problem.title_zh || feed?.primary_problem.title || "正在准备题目…"}</Text><Text className="muted">{feed?.primary_problem.topics?.join(" · ") || "题目将在进入练习后展开"}</Text><Button className="button button-primary" loading={busy} onClick={() => void start()}>{feed?.primary_problem_completed ? "再练一组" : "开始今天的练习"}</Button></View><View className="review-note"><Text className="review-note-title">复习从不是倒退</Text><Text className="review-note-copy">回看 {stats?.due_review_count ?? 0} 道做过的题，让思路慢慢扎根。</Text></View>{error ? <Text className="error">{error}</Text> : null}</View>;
}
