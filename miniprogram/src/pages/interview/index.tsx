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
  return <View className="screen"><View className="page-header"><Text className="eyebrow">INTERVIEW PRACTICE</Text><Text className="page-title">八股训练</Text><Text className="page-subtitle">开口表达，再让 AI 帮你校对思路。</Text></View><View className="practice-hero"><View><Text className="practice-kicker">TODAY</Text><Text className="practice-count">{stats?.today_answered_count ?? 0}<Text className="practice-unit"> 题</Text></Text><Text className="practice-caption">今天已经认真思考过</Text></View><View className="due-pill"><Text>{stats?.due_review_count ?? 0}</Text><Text>待复习</Text></View></View><View className="card feature-card"><Text className="card-title">{active ? "继续这一轮" : "今日练习"}</Text><Text className="muted">{active ? "你的回答还在这里，接着说下去。" : "从题库里挑三题，完成一段专注练习。"}</Text><Button className="button button-primary" loading={busy} onClick={() => void start()}>{active ? "继续练习" : "开始练习"}</Button></View><Text className="section-label">最近记录</Text><View className="card history-card">{sets.length ? sets.map((item) => <View className="history-row" key={item.id} onClick={() => Taro.navigateTo({ url: `/pages/interview-session/index?id=${item.id}` })}><View><Text className="history-title">{item.status === "in_progress" ? "进行中的训练" : "已完成训练"}</Text><Text className="history-date">{item.created_at.slice(0, 10)}</Text></View><Text className="history-count">{item.answered_count ?? 0}/{item.question_count}</Text></View>) : <Text className="empty-note">第一轮训练会从题库里为你挑选问题。</Text>}</View>{error ? <Text className="error">{error}</Text> : null}</View>;
}
