import { NavLink } from "react-router-dom";

const items = [
  { to: "/interview", label: "练习", end: true },
  { to: "/interview/setup", label: "题集", end: false },
  { to: "/interview/history", label: "历史", end: false },
];

export function InterviewSubNavigation() {
  return <nav className="workspace-segmented-control" aria-label="八股训练导航">
    {items.map((item) => <NavLink className={({ isActive }) => isActive ? "workspace-segment workspace-segment-active" : "workspace-segment"} end={item.end} key={item.to} to={item.to}>{item.label}</NavLink>)}
  </nav>;
}
