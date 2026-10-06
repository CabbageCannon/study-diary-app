import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";
import "./index.scss";

type Question = { id: string; question: string; topic: string; difficulty: string; tags: string[] };
type Item = { status: string; question: Question; latest_evaluation?: { total_score: number } | null };
type Set = { id: number; current_index: number; question_count: number; status: string; items: Item[] };

export default function InterviewSessionPage() {
  const [set, setSet] = useState<Set | null>(null); const [answer, setAnswer] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useLoad((query) => { if (query.id) void load(Number(query.id)); });
  async function load(id: number) { try { setSet(await api<Set>(`/api/interviews/question-sets/${id}`)); } catch (reason) { setError(reason instanceof Error ? reason.message : "训练不存在。"); } }
  async function submit() {
    if (!set || !answer.trim()) return;
    setBusy(true); setError(""); const question = set.items[set.current_index]?.question;
    try {
      await api(`/api/interviews/question-sets/${set.id}/answers`, { method: "POST", data: { question_id: question.id, answer_text: answer.trim(), answer_source: "text" } });
      const next = set.current_index + 1;
      const updated = await api<Set>(`/api/interviews/question-sets/${set.id}/progress`, { method: "PATCH", data: { current_index: Math.min(next, set.question_count - 1), item_status: "answered" } });
      if (next >= set.question_count) { await api(`/api/interviews/question-sets/${set.id}/complete`, { method: "POST" }); Taro.showToast({ title: "本轮已完成", icon: "success" }); Taro.navigateBack(); return; }
      setSet(updated); setAnswer(""); Taro.pageScrollTo({ scrollTop: 0, duration: 180 });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "回答已保存，但暂时无法进入下一题。"); }
    finally { setBusy(false); }
  }
  const item = set?.items[set.current_index];
  return <View className="screen session-screen"><View className="session-top"><Text onClick={() => Taro.navigateBack()}>‹ 训练</Text><Text>{set ? `${set.current_index + 1}/${set.question_count}` : ""}</Text></View>{item ? <><Text className="eyebrow">{item.question.topic} · {item.question.difficulty}</Text><Text className="session-question">{item.question.question}</Text><Text className="session-tags">{item.question.tags.join(" · ")}</Text><View className="card"><Text className="card-title">说说你的思路</Text><Textarea className="answer-editor" maxlength={12000} placeholder="直接写下你的理解、关键点和边界条件…" value={answer} onInput={(event) => setAnswer(event.detail.value)} /><Button className="button button-primary" disabled={busy || !answer.trim()} loading={busy} onClick={() => void submit()}>保存并核对</Button></View></> : <View className="loading">正在打开本轮训练…</View>}{error ? <Text className="error">{error}</Text> : null}</View>;
}
