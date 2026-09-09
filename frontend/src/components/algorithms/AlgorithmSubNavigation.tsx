import { NavLink, useLocation } from "react-router-dom";
const items = [
  { to: "/algorithms", label: "刷题", matches: (path: string) => path === "/algorithms" || path.startsWith("/algorithms/session/") || path.startsWith("/algorithms/problems/") },
  { to: "/algorithms/review", label: "复习", matches: (path: string) => path === "/algorithms/review" },
  { to: "/algorithms/history", label: "历史", matches: (path: string) => path === "/algorithms/history" },
  { to: "/algorithms/settings", label: "设置", matches: (path: string) => path === "/algorithms/settings" },
];

export function AlgorithmSubNavigation() {
  const { pathname } = useLocation();

  return (
    <nav className="algorithm-sub-navigation" aria-label="算法训练导航">
      {items.map((item) => {
        return <NavLink className={item.matches(pathname) ? "algorithm-subnav-link algorithm-subnav-link-active" : "algorithm-subnav-link"} key={item.to} to={item.to}><span>{item.label}</span></NavLink>;
      })}
    </nav>
  );
}
