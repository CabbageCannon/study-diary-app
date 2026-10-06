import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro, { useLoad } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";
import "./index.scss";

type Problem = { id: number; stable_key: string; title: string; title_zh: string | null; difficulty: string; topics: string[] };
type Item = { status: string; problem: Problem };
type Session = { id: string; current_index: number; question_count: number; items: Item[] };
type Context = { reasoning_available: boolean; context: { statement_zh: string; constraints: string[]; examples: { input: string; output: string; explanation?: string }[] } | null };
type Feedback = { headline: string; accuracy_score: number; needs_review: boolean };

function clientAnswerId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export default function AlgorithmSessionPage() {
  const [session, setSession] = useState<Session | null>(null); const [context, setContext] = useState<Context | null>(null); const [answer, setAnswer] = useState(""); const [feedback, setFeedback] = useState<Feedback | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useLoad((query) => { if (query.id) void load(query.id); });
  async function load(id: string) { try { const loaded = await api<Session>(`/api/algorithms/sessions/${id}`); setSession(loaded); const item = loaded.items[loaded.current_index]; if (item) setContext(await api<Context>(`/api/algorithms/problems/${item.problem.id}/reasoning-context`)); } catch (reason) { setError(reason instanceof Error ? reason.message : "训练不存在。"); } }
  async function check() {
    if (!session || !answer.trim()) return; const item = session.items[session.current_index]; setBusy(true); setError("");
    try {
      const result = await api<{ feedback: Feedback | null; check_error: string | null }>("/api/algorithms/reasoning/checks", { method: "POST", data: { problem_id: item.problem.stable_key, session_id: session.id, answer_text: answer.trim(), answer_source: "text", details: {}, client_answer_id: clientAnswerId() } });
      setFeedback(result.feedback); if (result.check_error) setError(result.check_error);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "回答已保存，暂时无法核对。"); }
    finally { setBusy(false); }
  }
  async function next() { if (!session) return; const index = session.current_index + 1; if (index >= session.question_count) { await api(`/api/algorithms/sessions/${session.id}/complete`, { method: "POST" }); Taro.showToast({ title: "今日训练完成", icon: "success" }); Taro.navigateBack(); return; } const updated = await api<Session>(`/api/algorithms/sessions/${session.id}/progress`, { method: "PATCH", data: { current_index: index, item_status: "solved" } }); setSession(updated); const nextProblem = updated.items[index]?.problem; if (nextProblem) setContext(await api<Context>(`/api/algorithms/problems/${nextProblem.id}/reasoning-context`)); setAnswer(""); setFeedback(null); Taro.pageScrollTo({ scrollTop: 0, duration: 180 }); }
  const item = session?.items[session.current_index];
  return <View className="screen session-screen"><View className="session-top"><Text onClick={() => Taro.navigateBack()}>‹ 算法</Text><Text>{session ? `${session.current_index + 1}/${session.question_count}` : ""}</Text></View>{item ? <><Text className="eyebrow">{item.problem.difficulty} · {item.problem.topics.join(" · ")}</Text><Text className="session-question">{item.problem.title_zh || item.problem.title}</Text>{context?.context ? <View className="problem-context"><Text>{context.context.statement_zh}</Text>{context.context.examples?.[0] ? <Text className="context-example">示例：{context.context.examples[0].input} → {context.context.examples[0].output}</Text> : null}</View> : null}<View className="card"><Text className="card-title">你的解题思路</Text><Textarea className="answer-editor" maxlength={12000} placeholder="讲讲核心思路、复杂度和边界条件…" value={answer} onInput={(event) => setAnswer(event.detail.value)} />{feedback ? <View className="feedback"><Text>准确度 {feedback.accuracy_score}%</Text><Text>{feedback.headline}</Text><Button className="button button-primary" onClick={() => void next()}>下一题</Button></View> : <Button className="button button-primary" disabled={busy || !answer.trim()} loading={busy} onClick={() => void check()}>让 AI 核对</Button>}</View></> : <View className="loading">正在准备题目…</View>}{error ? <Text className="error">{error}</Text> : null}</View>;
}
