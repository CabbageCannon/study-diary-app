import { Button, Text, Textarea, View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";

type Diary = { id: number; title: string; summary: string; date: string; category: "learning" | "life"; weather: string | null; location: string | null };

export default function DiaryPage() {
  const [items, setItems] = useState<Diary[]>([]); const [writing, setWriting] = useState(false); const [content, setContent] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  useDidShow(() => { void load(); });
  async function load() { try { setItems(await api<Diary[]>("/api/diaries")); } catch (reason) { setError(reason instanceof Error ? reason.message : "读取日记失败。"); } }
  async function publish() { if (!content.trim()) return; setSaving(true); try { const text = content.trim(); await api<Diary>("/api/diaries", { method: "POST", data: { date: new Date().toISOString().slice(0, 10), title: text.slice(0, 18), raw_text: text, polished_text: text, summary: text.slice(0, 60), tags: ["日记"], category: "life", status: "published", images: [] } }); setContent(""); setWriting(false); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "发布失败。"); } finally { setSaving(false); } }
  return <View className="screen"><Text className="eyebrow">MY DIARY</Text><Text className="page-title">我的日记</Text><Text className="page-subtitle">天气会过去，感受值得留下。</Text><Button className="button button-primary" onClick={() => setWriting((value) => !value)}>{writing ? "收起编辑" : "写下今天"}</Button>{writing ? <View className="card"><Textarea className="diary-editor" maxlength={4000} placeholder="今天发生了什么？" value={content} onInput={(event) => setContent(event.detail.value)} /><Button className="button button-secondary" disabled={saving || !content.trim()} loading={saving} onClick={() => void publish()}>发布日记</Button></View> : null}<View className="diary-grid">{items.map((item) => <View className="diary-item" key={item.id}><Text className="diary-date">{item.date} · {item.category === "learning" ? "学习" : "生活"}</Text><Text className="diary-title">{item.title}</Text><Text className="diary-summary">{item.summary}</Text><Text className="diary-meta">{[item.weather, item.location].filter(Boolean).join(" · ")}</Text></View>)}</View>{error ? <Text className="error">{error}</Text> : null}</View>;
}
