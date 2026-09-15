import { useLocation } from "react-router-dom";

import { LiquidTabs } from "../LiquidTabs";

const items = [
  { to: "/interview", label: "练习", matches: (path: string) => path === "/interview" || path.startsWith("/interview/session/") },
  { to: "/interview/setup", label: "题集", matches: (path: string) => path === "/interview/setup" },
  { to: "/interview/history", label: "历史", matches: (path: string) => path === "/interview/history" },
];

export function InterviewSubNavigation() {
  const { pathname } = useLocation();

  return (
    <LiquidTabs
      ariaLabel="八股训练导航"
      className="workspace-segmented-control"
      itemClassName="workspace-segment"
      activeItemClassName="workspace-segment-active"
      items={items.map((item) => ({ key: item.to, to: item.to, label: item.label, active: item.matches(pathname) }))}
    />
  );
}
