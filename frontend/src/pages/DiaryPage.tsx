import {
  BookOpenIcon, CaretDownIcon, ImageIcon, MapPinIcon, PencilSimpleIcon,
  PlusIcon, PushPinIcon, SpinnerGapIcon, TrashIcon, XIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from "react";

import { deleteDiary, listDiaries, peekDiaries, saveDiary, updateDiary } from "../api/client";
import { loadWeather, readWeatherCache, weatherSentence, type WeatherSnapshot } from "../services/weather";
import type { Diary, MobileDiaryPayload } from "../types/diary";

interface DiaryFormState {
  id: number | null;
  date: string;
  title: string;
  content: string;
  category: "learning" | "life";
  images: string[];
  weather: string;
  location: string;
  isPinned: boolean;
}

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

function emptyForm(weather: WeatherSnapshot | null): DiaryFormState {
  return { id: null, date: today(), title: "", content: "", category: "learning", images: [], weather: weather ? `${weather.weather} ${weather.temperature}°` : "", location: weather?.location ?? "", isPinned: false };
}

function formFromDiary(diary: Diary): DiaryFormState {
  return { id: diary.id, date: diary.date, title: diary.title, content: diary.polished_text, category: diary.category, images: diary.images, weather: diary.weather ?? "", location: diary.location ?? "", isPinned: diary.is_pinned };
}

function payloadFromForm(form: DiaryFormState, status: "draft" | "published"): MobileDiaryPayload {
  const content = form.content.trim();
  const title = form.title.trim() || content.split(/\r?\n/).find(Boolean)?.slice(0, 42) || "未完成的日记";
  return {
    date: form.date, title, raw_text: content || "尚未写完", polished_text: content || "尚未写完",
    summary: (content || title).slice(0, 100), tags: [form.category === "learning" ? "学习" : "生活"],
    category: form.category, status, images: form.images, weather: form.weather || null,
    location: form.location || null, is_pinned: form.isPinned,
  };
}

function optimisticDiary(form: DiaryFormState, id: number, status: "draft" | "published"): Diary {
  const now = new Date().toISOString();
  return { id, ...payloadFromForm(form, status), created_at: now, updated_at: now };
}

async function compressImage(file: File) {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("照片读取失败"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("照片解析失败"));
    element.src = source;
  });
  const scale = Math.min(1, 1080 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  // ponytail: compressed data URLs suit this single-user app; move to object storage when the diary response becomes large.
  return canvas.toDataURL("image/webp", 0.76);
}

export function DiaryPage() {
  const cached = peekDiaries();
  const [diaries, setDiaries] = useState<Diary[]>(cached ?? []);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(readWeatherCache);
  const [weatherLoading, setWeatherLoading] = useState(() => !readWeatherCache());
  const [isLoading, setIsLoading] = useState(() => !cached);
  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState<DiaryFormState>(() => emptyForm(readWeatherCache()));
  const [draftStatus, setDraftStatus] = useState("");
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [detail, setDetail] = useState<Diary | null>(null);
  const [actions, setActions] = useState<Diary | null>(null);
  const [syncingIds, setSyncingIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const formRef = useRef(form);
  const lastDraftKey = useRef("");
  const autosavePromise = useRef<Promise<void>>(Promise.resolve());
  const longPressTimer = useRef<number | undefined>(undefined);
  const longPressStart = useRef({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  formRef.current = form;

  useEffect(() => {
    let cancelled = false;
    void listDiaries(true).then((value) => { if (!cancelled) setDiaries(value); }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "日记加载失败");
    }).finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadWeather().then((value) => {
      if (cancelled) return;
      setWeather(value);
      setForm((current) => current.location ? current : { ...current, location: value.location, weather: `${value.weather} ${value.temperature}°` });
    }).catch(() => undefined).finally(() => { if (!cancelled) setWeatherLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function persistDraft() {
    const snapshot = formRef.current;
    if (!snapshot.title.trim() && !snapshot.content.trim() && snapshot.images.length === 0) return;
    const key = JSON.stringify(snapshot);
    if (key === lastDraftKey.current) return;
    lastDraftKey.current = key;
    setDraftStatus("正在保存草稿");
    try {
      const saved = snapshot.id
        ? await updateDiary(snapshot.id, payloadFromForm(snapshot, "draft"))
        : await saveDiary(payloadFromForm(snapshot, "draft"));
      setForm((current) => current.id ? current : { ...current, id: saved.id });
      formRef.current = formRef.current.id ? formRef.current : { ...formRef.current, id: saved.id };
      setDiaries((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraftStatus("草稿已保存");
    } catch {
      lastDraftKey.current = "";
      setDraftStatus("草稿同步失败，将自动重试");
    }
  }

  useEffect(() => {
    if (!composerOpen) return;
    const timer = window.setTimeout(() => {
      autosavePromise.current = autosavePromise.current.then(persistDraft);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [composerOpen, form]);

  const drafts = useMemo(() => diaries.filter((item) => item.status === "draft"), [diaries]);
  const published = useMemo(() => diaries.filter((item) => item.status === "published").sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || Date.parse(b.updated_at) - Date.parse(a.updated_at)), [diaries]);
  const diaryColumns = published.reduce<[Diary[], Diary[]]>((columns, diary, index) => {
    columns[(index + (drafts.length ? 1 : 0)) % 2].push(diary);
    return columns;
  }, [[], []]);

  function openNew() {
    setForm(emptyForm(weather));
    lastDraftKey.current = "";
    setDraftStatus("");
    setComposerOpen(true);
    requestAnimationFrame(() => document.getElementById("diary-composer")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function openEdit(diary: Diary) {
    setActions(null);
    setDetail(null);
    setForm(formFromDiary(diary));
    lastDraftKey.current = JSON.stringify(formFromDiary(diary));
    setDraftStatus(diary.status === "draft" ? "继续上次的草稿" : "编辑中");
    setComposerOpen(true);
    requestAnimationFrame(() => document.getElementById("diary-composer")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function closeComposer() {
    autosavePromise.current = autosavePromise.current.then(persistDraft);
    setComposerOpen(false);
  }

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []).slice(0, 4 - form.images.length);
    if (!files.length) return;
    setDraftStatus("正在处理照片");
    try {
      const images = await Promise.all(files.map(compressImage));
      setForm((current) => ({ ...current, images: [...current.images, ...images].slice(0, 4) }));
      setDraftStatus("照片已加入");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "照片处理失败");
    } finally { input.value = ""; }
  }

  function publish() {
    const snapshot = formRef.current;
    if (!snapshot.content.trim()) { setError("写下一点内容后再发布。 "); return; }
    const optimisticId = snapshot.id ?? -Date.now();
    const previous = diaries;
    const optimistic = optimisticDiary(snapshot, optimisticId, "published");
    setDiaries((current) => [optimistic, ...current.filter((item) => item.id !== snapshot.id)]);
    setComposerOpen(false);
    setError("");
    setSyncingIds((current) => new Set(current).add(optimisticId));
    void (async () => {
      try {
        await autosavePromise.current;
        const currentForm = formRef.current;
        const saved = currentForm.id
          ? await updateDiary(currentForm.id, payloadFromForm(currentForm, "published"))
          : await saveDiary(payloadFromForm(currentForm, "published"));
        setDiaries((current) => [saved, ...current.filter((item) => item.id !== optimisticId && item.id !== saved.id)]);
        setForm(emptyForm(weather));
      } catch (reason) {
        setDiaries(previous);
        setError(reason instanceof Error ? reason.message : "发布失败，草稿仍然保留");
      } finally {
        setSyncingIds((current) => { const next = new Set(current); next.delete(optimisticId); return next; });
      }
    })();
  }

  function longPressProps(diary: Diary) {
    const cancel = () => window.clearTimeout(longPressTimer.current);
    return {
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        suppressClick.current = false;
        longPressStart.current = { x: event.clientX, y: event.clientY };
        longPressTimer.current = window.setTimeout(() => { suppressClick.current = true; setActions(diary); navigator.vibrate?.(20); }, 520);
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerMove: (event: PointerEvent) => {
        if (Math.hypot(event.clientX - longPressStart.current.x, event.clientY - longPressStart.current.y) > 9) cancel();
      },
      onContextMenu: (event: React.MouseEvent) => { event.preventDefault(); setActions(diary); },
    };
  }

  function openDetail(diary: Diary) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setDetail(diary);
  }

  function togglePin(diary: Diary) {
    const previous = diaries;
    const nextValue = !diary.is_pinned;
    setActions(null);
    setDiaries((current) => current.map((item) => item.id === diary.id ? { ...item, is_pinned: nextValue } : item));
    void updateDiary(diary.id, { is_pinned: nextValue }).then((saved) => {
      setDiaries((current) => current.map((item) => item.id === saved.id ? saved : item));
    }).catch(() => { setDiaries(previous); setError("置顶状态同步失败"); });
  }

  function remove(diary: Diary) {
    const previous = diaries;
    setActions(null);
    setDetail(null);
    setDiaries((current) => current.filter((item) => item.id !== diary.id));
    void deleteDiary(diary.id).catch(() => { setDiaries(previous); setError("删除失败，日记已经恢复"); });
  }

  return <div className="diary-page">
    <header className="diary-hero">
      <div><h1>我的日记</h1><a className="diary-weather" href="https://open-meteo.com/" rel="noreferrer" target="_blank"><MapPinIcon aria-hidden="true" size={14} />{weatherLoading ? "位置与天气加载中…" : weather ? `${weather.location} · ${weather.weather} ${weather.temperature}°` : "位置未开启 · 天气待同步"}</a></div>
      <blockquote>{weatherSentence(weather)}</blockquote>
    </header>

    <main className="diary-main">
      <button className="diary-compose-trigger" onClick={composerOpen ? closeComposer : openNew} type="button">
        <span><PlusIcon aria-hidden="true" size={20} weight="bold" /></span><strong>{composerOpen ? "先收起，稍后再写" : "记录今天"}</strong><small>{composerOpen ? "内容会自动存入草稿箱" : "照片、片刻与想法"}</small>
        <CaretDownIcon aria-hidden="true" className={composerOpen ? "diary-compose-caret diary-compose-caret-open" : "diary-compose-caret"} size={18} />
      </button>

      {composerOpen ? <section className="diary-composer" id="diary-composer">
        <div className="diary-composer-top"><strong>{form.id ? "继续编辑" : "新日记"}</strong><span className={draftStatus.includes("正在") ? "diary-save-state is-saving" : "diary-save-state"}>{draftStatus.includes("正在") ? <SpinnerGapIcon aria-hidden="true" size={14} /> : null}{draftStatus || "停笔后自动保存"}</span></div>
        <div className="diary-category" role="radiogroup" aria-label="日记分类">
          {(["learning", "life"] as const).map((category) => <button aria-checked={form.category === category} className={form.category === category ? "is-active" : ""} key={category} onClick={() => setForm((current) => ({ ...current, category }))} role="radio" type="button">{category === "learning" ? "学习" : "生活"}</button>)}
        </div>
        <input className="diary-title-input" maxLength={160} onChange={(event) => { const title = event.currentTarget.value; setForm((current) => ({ ...current, title })); }} placeholder="标题（可以留空）" value={form.title} />
        <textarea autoFocus className="diary-content-input" maxLength={8000} onChange={(event) => { const content = event.currentTarget.value; setForm((current) => ({ ...current, content })); }} placeholder="此刻在想什么？" rows={7} value={form.content} />
        {form.images.length ? <div className="diary-photo-editor">{form.images.map((image, index) => <figure key={`${image.slice(-24)}-${index}`}><img alt={`日记照片 ${index + 1}`} src={image} /><button aria-label={`移除第 ${index + 1} 张照片`} onClick={() => setForm((current) => ({ ...current, images: current.images.filter((_, itemIndex) => itemIndex !== index) }))} type="button"><XIcon size={14} /></button></figure>)}</div> : null}
        <div className="diary-composer-meta"><label className="diary-photo-button"><ImageIcon aria-hidden="true" size={18} />照片 {form.images.length}/4<input accept="image/*" multiple onChange={(event) => void addPhotos(event)} type="file" /></label><label><span>日期</span><input onChange={(event) => { const date = event.currentTarget.value; setForm((current) => ({ ...current, date })); }} type="date" value={form.date} /></label></div>
        <button className="button button-primary diary-publish-button" onClick={publish} type="button">发布日记</button>
      </section> : null}

      {error ? <p className="diary-error" role="alert">{error}<button onClick={() => setError("")} type="button">关闭</button></p> : null}
      {isLoading ? <div className="diary-feed-loading" role="status"><SpinnerGapIcon aria-hidden="true" size={22} />正在整理日记…</div> : null}

      <div className="diary-waterfall" aria-label="日记瀑布流">
        {diaryColumns.map((column, columnIndex) => <div className="diary-column" key={columnIndex}>
          {columnIndex === 0 && drafts.length ? <article className={`diary-draft-stack depth-${Math.min(3, drafts.length)}`}>
            <button onClick={() => setDraftsOpen((value) => !value)} type="button"><span className="diary-draft-paper"><PencilSimpleIcon aria-hidden="true" size={20} /></span><strong>草稿箱</strong><small>{drafts.length} 篇写到一半</small></button>
            {draftsOpen ? <div className="diary-draft-list">{drafts.map((draft) => <button key={draft.id} onClick={() => openEdit(draft)} type="button"><span>{draft.title}</span><time>{draft.date}</time></button>)}</div> : null}
          </article> : null}
          {column.map((diary) => <article className={diary.images.length ? "diary-card has-photo" : `diary-card text-card category-${diary.category}`} key={diary.id} {...longPressProps(diary)}>
            <button aria-label={`打开《${diary.title}》，长按可编辑`} onClick={() => openDetail(diary)} type="button">
              {diary.images[0] ? <div className="diary-cover"><img alt="" src={diary.images[0]} />{diary.images.length > 1 ? <span>1/{diary.images.length}</span> : null}</div> : <div className="diary-text-cover"><BookOpenIcon aria-hidden="true" size={18} /><p>{diary.summary}</p></div>}
              <div className="diary-card-copy"><div><span>{diary.category === "learning" ? "学习" : "生活"}</span>{diary.is_pinned ? <PushPinIcon aria-label="已置顶" size={13} weight="fill" /> : null}</div><h2>{diary.title}</h2><p>{diary.location || diary.weather ? [diary.location, diary.weather].filter(Boolean).join(" · ") : diary.date}</p>{syncingIds.has(diary.id) ? <small className="diary-card-sync"><SpinnerGapIcon aria-hidden="true" size={12} />同步中</small> : null}</div>
            </button>
          </article>)}
        </div>)}
      </div>
      {!isLoading && !drafts.length && !published.length ? <div className="diary-empty"><strong>第一页，等你来写</strong><p>一张照片或一句话，都算今天来过。</p></div> : null}
    </main>

    {detail ? <div className="diary-overlay" role="presentation" onClick={() => setDetail(null)}><article aria-modal="true" className="diary-detail-sheet" onClick={(event) => event.stopPropagation()} role="dialog"><button aria-label="关闭日记" className="diary-sheet-close" onClick={() => setDetail(null)} type="button"><XIcon size={18} /></button>{detail.images.length ? <div className={`diary-detail-photos count-${detail.images.length}`}>{detail.images.map((image, index) => <img alt={`日记照片 ${index + 1}`} key={image.slice(-28)} src={image} />)}</div> : null}<div className="diary-detail-copy"><div className="diary-detail-meta"><span>{detail.category === "learning" ? "学习" : "生活"}</span><time>{detail.date}</time></div><h2>{detail.title}</h2><p>{detail.polished_text}</p>{detail.location || detail.weather ? <small><MapPinIcon size={13} />{[detail.location, detail.weather].filter(Boolean).join(" · ")}</small> : null}</div></article></div> : null}

    {actions ? <div className="diary-overlay diary-actions-overlay" role="presentation" onClick={() => setActions(null)}><div aria-label={`管理《${actions.title}》`} aria-modal="true" className="diary-action-sheet" onClick={(event) => event.stopPropagation()} role="dialog"><div><strong>{actions.title}</strong><small>{actions.date}</small></div><button onClick={() => openEdit(actions)} type="button"><PencilSimpleIcon size={19} />编辑</button><button onClick={() => togglePin(actions)} type="button"><PushPinIcon size={19} />{actions.is_pinned ? "取消置顶" : "置顶"}</button><button className="is-danger" onClick={() => remove(actions)} type="button"><TrashIcon size={19} />删除</button><button onClick={() => setActions(null)} type="button">取消</button></div></div> : null}
  </div>;
}
