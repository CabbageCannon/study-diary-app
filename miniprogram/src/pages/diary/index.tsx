import { Button, Image, Text, Textarea, View } from "@tarojs/components";
import { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";
import { Screen } from "../../components/Screen";
import { dateLabel, localDateKey } from "../../services/presentation";
import paper from "../../assets/diary-paper.webp";
import "./index.scss";

type Diary = { id: number; title: string; summary: string; raw_text?: string; polished_text?: string; date: string; status?: string; category: "learning" | "life"; weather: string | null; location: string | null };
export default function DiaryPage() {
  const [items, setItems] = useState<Diary[]>([]);
  const [writing, setWriting] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useDidShow(() => { void load(); });
  async function load() {
    try { setItems(await api<Diary[]>("/api/diaries")); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "读取日记失败。"); }
    finally { setLoading(false); }
  }
  async function publish() {
    if (!content.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const text = content.trim();
      const saved = await api<Diary>("/api/diaries", { method: "POST", data: { date: localDateKey(), title: text.slice(0, 18), raw_text: text, polished_text: text, summary: text.slice(0, 60), tags: ["日记"], category: "life", status: "published", images: [] } });
      setItems(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      setContent(""); setWriting(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发布失败。"); }
    finally { setSaving(false); }
  }
  const columns = items.filter(item => !item.status || item.status === "published").reduce<[Diary[], Diary[]]>((result, item, index) => { result[index % 2].push(item); return result; }, [[], []]);
  return <Screen className={`diary-screen ${writing ? "is-writing" : ""}`} topInset={-8}>
    <View className="page-header diary-header"><View><Text className="page-title">我的日记</Text><Text className="page-subtitle">天气会过去，感受值得留下。</Text></View>{writing ? <View className="composer-close" onClick={() => setWriting(false)}><Text>收起这一页</Text></View> : null}</View>
    {!writing ? <Button className="button button-primary diary-write" onClick={() => setWriting(true)}>写下今天</Button> : <View className="card diary-composer"><Text className="composer-title">写下今天</Text><Textarea className="diary-editor" maxlength={4000} placeholder="今天发生了什么？" value={content} onInput={event => setContent(event.detail.value)} adjustPosition cursorSpacing={30} /><Button className="button button-primary" disabled={saving || !content.trim()} loading={saving} onClick={() => void publish()}>发布日记</Button></View>}
    {writing ? <Text className="diary-feed-label">最近留下的片段</Text> : null}
    {loading && !items.length ? <Text className="loading">正在翻开你的日记…</Text> : columns[0].length ? <View className="diary-waterfall">{columns.map((column, columnIndex) => <View className="diary-column" key={columnIndex}>{column.map(item => <View className="diary-item" key={item.id}><View className="diary-cover"><Image className="diary-paper" src={paper} mode="scaleToFill" /><Text className="diary-summary">{item.summary || item.polished_text || item.raw_text || item.title}</Text></View><View className="diary-copy"><Text className="diary-category">{item.category === "learning" ? "学习" : "生活"}</Text><Text className="diary-title">{item.title}</Text><View className="diary-meta"><Text className="diary-date">{dateLabel(item.date)}</Text>{item.weather || item.location ? <Text className="diary-place">{[item.weather, item.location].filter(Boolean).join(" · ")}</Text> : null}</View></View></View>)}</View>)}</View> : <Text className="empty-note">第一篇日记，会从这里开始。</Text>}
    {error ? <Text className="error">{error}</Text> : null}
  </Screen>;
}
