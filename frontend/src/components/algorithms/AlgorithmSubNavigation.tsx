import { useLocation } from "react-router-dom";

import { prefetchAlgorithmSettingsData } from "../../api/algorithms";
import { LiquidTabs } from "../LiquidTabs";

const items = [
  { to: "/algorithms", label: "刷题", matches: (path: string) => path === "/algorithms" || path.startsWith("/algorithms/session/") || path.startsWith("/algorithms/problems/") },
  { to: "/algorithms/review", label: "复习", matches: (path: string) => path === "/algorithms/review" },
  { to: "/algorithms/history", label: "历史", matches: (path: string) => path === "/algorithms/history" },
  { to: "/algorithms/settings", label: "设置", matches: (path: string) => path === "/algorithms/settings" },
];

export function AlgorithmSubNavigation() {
  const { pathname } = useLocation();
  const warmSettings = () => { void prefetchAlgorithmSettingsData(); };

  return (
    <LiquidTabs
      ariaLabel="算法训练导航"
      className="algorithm-sub-navigation"
      itemClassName="algorithm-subnav-link"
      activeItemClassName="algorithm-subnav-link-active"
      items={items.map((item) => ({
        key: item.to,
        to: item.to,
        label: item.label,
        active: item.matches(pathname),
        replace: true,
        ...(item.to === "/algorithms/settings" ? { onFocus: warmSettings, onPointerEnter: warmSettings, onTouchStart: warmSettings } : {}),
      }))}
    />
  );
}
