export interface Diary {
  id: number;
  date: string;
  title: string;
  raw_text: string;
  polished_text: string;
  summary: string;
  tags: string[];
  category: "learning" | "life";
  status: "draft" | "published";
  images: string[];
  weather: string | null;
  location: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiaryDraftContent {
  title: string;
  polished_text: string;
  summary: string;
  tags: string[];
}

export interface DiaryDraft extends DiaryDraftContent {
  date: string;
  raw_text: string;
}

export interface CreateDiaryDraftPayload {
  date: string;
  raw_text: string;
}

export interface RewriteDiaryDraftPayload {
  date: string;
  raw_text: string;
  current_draft: DiaryDraftContent;
  feedback: string;
}

export type SaveDiaryPayload = DiaryDraft;

export interface MobileDiaryPayload extends DiaryDraft {
  category: "learning" | "life";
  status: "draft" | "published";
  images: string[];
  weather: string | null;
  location: string | null;
  is_pinned: boolean;
}

export type UpdateDiaryPayload = Partial<MobileDiaryPayload>;
