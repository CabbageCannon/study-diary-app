import { dailyGoalsDirty, profileSettingsDirty } from "./settingsDirty.js";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const savedProfile = { nickname: "Ada", targetRole: "Agent 工程师", learningStyle: "每天练一点" };
assert(!profileSettingsDirty({ ...savedProfile }, savedProfile), "same profile is clean");
assert(!profileSettingsDirty({ ...savedProfile, nickname: " Ada " }, savedProfile), "trimmed profile is clean");
assert(profileSettingsDirty({ ...savedProfile, targetRole: "Backend" }, savedProfile), "changed profile is dirty");

const savedGoals = { interview: 3, algorithm: 1, diary: 1, review: 2 };
assert(!dailyGoalsDirty({ ...savedGoals }, savedGoals), "same goals are clean");
assert(dailyGoalsDirty({ ...savedGoals, review: 3 }, savedGoals), "changed goals are dirty");
