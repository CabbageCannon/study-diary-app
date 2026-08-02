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

export interface CreateDiaryPayload {
  date: string;
  raw_text: string;
}
