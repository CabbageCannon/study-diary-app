type ProfileDraft = { nickname: string; targetRole: string; learningStyle: string };
type DailyGoalsDraft = { interview: number; algorithm: number; diary: number; review: number };

export function profileSettingsDirty(draft: ProfileDraft, saved: ProfileDraft) {
  return draft.nickname.trim() !== saved.nickname.trim()
    || draft.targetRole.trim() !== saved.targetRole.trim()
    || draft.learningStyle.trim() !== saved.learningStyle.trim();
}

export function dailyGoalsDirty(draft: DailyGoalsDraft, saved: DailyGoalsDraft) {
  return draft.interview !== saved.interview
    || draft.algorithm !== saved.algorithm
    || draft.diary !== saved.diary
    || draft.review !== saved.review;
}
