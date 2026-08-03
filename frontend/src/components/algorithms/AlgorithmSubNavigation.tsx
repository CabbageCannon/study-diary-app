import { NavLink, useLocation } from "react-router-dom";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ClockCounterClockwise";
import { GearSixIcon } from "@phosphor-icons/react/GearSix";
import { SparkleIcon } from "@phosphor-icons/react/Sparkle";
import { TargetIcon } from "@phosphor-icons/react/Target";

const items = [
  { to: "/algorithms", label: "今日训练", icon: SparkleIcon, matches: (path: string) => path === "/algorithms" || path.startsWith("/algorithms/session/") || path.startsWith("/algorithms/problems/") },
  { to: "/algorithms/settings", label: "训练设置", icon: GearSixIcon, matches: (path: string) => path === "/algorithms/settings" },
  { to: "/algorithms/review", label: "复习队列", icon: TargetIcon, matches: (path: string) => path === "/algorithms/review" },
  { to: "/algorithms/history", label: "训练历史", icon: ClockCounterClockwiseIcon, matches: (path: string) => path === "/algorithms/history" },
];

export function AlgorithmSubNavigation() {
  const { pathname } = useLocation();

  return (
    <nav className="algorithm-sub-navigation" aria-label="算法训练导航">
      {items.map((item) => {
        const Icon = item.icon;
        return <NavLink className={item.matches(pathname) ? "algorithm-subnav-link algorithm-subnav-link-active" : "algorithm-subnav-link"} key={item.to} to={item.to}><Icon aria-hidden="true" size={16} weight="bold" /><span>{item.label}</span></NavLink>;
      })}
    </nav>
  );
}
