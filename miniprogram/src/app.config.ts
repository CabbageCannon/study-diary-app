export default defineAppConfig({
  pages: [
    "pages/auth/index",
    "pages/today/index",
    "pages/interview/index",
    "pages/interview-session/index",
    "pages/diary/index",
    "pages/algorithm/index",
    "pages/algorithm-session/index",
    "pages/me/index",
  ],
  window: {
    navigationStyle: "custom",
    navigationBarTextStyle: "black",
    backgroundTextStyle: "light",
    backgroundColor: "#f7f5f1",
  },
  tabBar: {
    custom: true,
    color: "#8a867f",
    selectedColor: "#312f2b",
    list: [
      { pagePath: "pages/today/index", text: "今日" },
      { pagePath: "pages/interview/index", text: "八股" },
      { pagePath: "pages/diary/index", text: "日记" },
      { pagePath: "pages/algorithm/index", text: "算法" },
      { pagePath: "pages/me/index", text: "我的" },
    ],
  },
});
