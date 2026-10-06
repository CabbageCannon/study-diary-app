import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";

type Stats = { today_answered_count?: number; total_answer_count?: number; current_streak_days?: number; due_review_count?: number };
type Set = { id: number; status: string; question_count: number; answered_count?: number; created_at: string };

export default function InterviewPage() {
  const [stats, setStats] = useState<Stats | null>(null); const [sets, setSets] = useState<Set[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useDidShow(() => { void load(); });
  async function load() { try { const [a, b] = await Promise.all([api<Stats>("/api/interviews/stats"), api<Set[]>("/api/interviews/question-sets?limit=8")]); setStats(a); setSets(b); } catch (reason) { setError(reason instanceof Error ? reason.message : "读取训练记录失败。"); } }
  async function start() { setBusy(true); setError(""); try { const set = await api<Set>("/api/interviews/question-sets", { method: "POST", data: { question_count: 3, include_due_reviews: true, random_order: true } }); Taro.navigateTo({ url: `/pages/interview-session/index?id=${set.id}` }); } catch (reason) { setError(reason instanceof Error ? reason.message : "创建训练失败。"); } finally { setBusy(false); } }
  const active = sets.find((item) => item.status === "in_progress");
  return <View className="screen"><Text className="eyebrow">INTERVIEW PRACTICE</Text><Text className="page-title">八股训练</Text><Text className="page-subtitle">开口表达，再让 AI 帮你校对思路。</Text><View className="card"><Text className="card-title">今日推荐</Text><Text className="muted">今天已完成 {stats?.today_answered_count ?? 0} 题 · 待复习 {stats?.due_review_count ?? 0} 题</Text><Button className="button button-primary" loading={busy} onClick={() => void start()}>{active ? "继续本轮训练" : "开始 3 题训练"}</Button></View><View className="card"><Text className="card-title">最近记录</Text>{sets.length ? sets.map((item) => <View className="history-row" key={item.id} onClick={() => Taro.navigateTo({ url: `/pages/interview-session/index?id=${item.id}` })}><Text>{item.status === "in_progress" ? "进行中的训练" : "已完成训练"}</Text><Text>{item.answered_count ?? 0}/{item.question_count}</Text></View>) : <Text className="muted">第一轮训练会从已验证题库中为你挑选题目。</Text>}</View>{error ? <Text className="error">{error}</Text> : null}</View>;
}
