export interface Diary {
  id: number;
  date: string;
  title: string;
  raw_text: string;
  polished_text: string;
  summary: string;
  tags: string[];
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
