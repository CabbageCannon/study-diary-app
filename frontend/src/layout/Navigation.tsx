import { NavLink, useLocation } from "react-router-dom";
import { BookOpenIcon } from "@phosphor-icons/react/BookOpen";
import { CircleHalfIcon } from "@phosphor-icons/react/CircleHalf";
import { HouseIcon } from "@phosphor-icons/react/House";
import { PlusIcon } from "@phosphor-icons/react/Plus";
import { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
import { UserCircleIcon } from "@phosphor-icons/react/UserCircle";

import { LiquidTabs } from "../components/LiquidTabs";
import { useTheme } from "../contexts/ThemeContext";

const desktopPrimaryItems = [
  { to: "/today", label: "今日", matches: (pathname: string) => pathname === "/today" },
  { to: "/me", label: "我的", matches: (pathname: string) => pathname === "/me" },
  { to: "/diary", label: "日记", matches: (pathname: string) => pathname === "/diary" || pathname === "/write" || pathname === "/history" },
  { to: "/algorithms", label: "算法训练", matches: (pathname: string) => pathname === "/algorithms" || pathname.startsWith("/algorithms/session/") || pathname.startsWith("/algorithms/problems/") },
  { to: "/interview", label: "八股训练", matches: (pathname: string) => pathname === "/interview" || pathname.startsWith("/interview/session/") },
];

const desktopArchiveItems = [
  { to: "/history", label: "日记历史", matches: (pathname: string) => pathname === "/history" },
  { to: "/algorithms/history", label: "算法历史", matches: (pathname: string) => pathname === "/algorithms/history" },
  { to: "/interview/history", label: "八股历史", matches: (pathname: string) => pathname === "/interview/history" },
];

const desktopToolItems = [
  { to: "/algorithms/review", label: "算法复习", matches: (pathname: string) => pathname === "/algorithms/review" },
  { to: "/algorithms/settings", label: "算法设置", matches: (pathname: string) => pathname === "/algorithms/settings" },
  { to: "/settings/desktop-pet", label: "桌宠设置", matches: (pathname: string) => pathname === "/settings/desktop-pet" },
];

const questionReviewEnabled = import.meta.env.VITE_ENABLE_QUESTION_REVIEW === "true";

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  document.getElementById("main-content")?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
}

export function Navigation() {
  const { pathname } = useLocation();
  const { cycleTheme } = useTheme();
  const desktopTools = [...desktopToolItems, ...(questionReviewEnabled ? [{ to: "/interview/review", label: "题库审核", matches: (path: string) => path === "/interview/review" }] : [])];
  const algorithmTrainingActive = pathname.startsWith("/algorithms");
  const interviewTrainingActive = pathname.startsWith("/interview");
  const diaryActive = pathname === "/diary" || pathname === "/write" || pathname === "/history";

  const activeTabClick = (active: boolean) => () => {
    if (active) scrollToTop();
  };

  return (
    <>
      <nav className="navigation" aria-label="主导航">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>学习日记</strong>
            <span>Study Diary</span>
          </div>
        </div>

        <div className="nav-links">
          <div className="nav-section">
            <span className="nav-section-label">开始</span>
            {desktopPrimaryItems.map((item) => (
              <NavLink className={item.matches(pathname) ? "nav-link nav-link-active" : "nav-link"} to={item.to} key={item.to}>{item.label}</NavLink>
            ))}
          </div>
          <div className="nav-section">
            <span className="nav-section-label">记录</span>
            {desktopArchiveItems.map((item) => (
              <NavLink className={item.matches(pathname) ? "nav-link nav-link-active" : "nav-link"} to={item.to} key={item.to}>{item.label}</NavLink>
            ))}
          </div>
          <div className="nav-section">
            <span className="nav-section-label">工具</span>
            {desktopTools.map((item) => (
              <NavLink className={item.matches(pathname) ? "nav-link nav-link-active" : "nav-link"} to={item.to} key={item.to}>{item.label}</NavLink>
            ))}
          </div>
        </div>

        <div className="navigation-footer">
          <button
            className="theme-toggle"
            aria-label="切换主题"
            title="切换主题"
            onClick={cycleTheme}
            type="button"
          >
            <CircleHalfIcon aria-hidden="true" size={18} weight="bold" />
          </button>
        </div>
      </nav>

      <LiquidTabs
        ariaLabel="移动端主导航"
        className="mobile-bottom-navigation"
        itemClassName="mobile-nav-link"
        activeItemClassName="mobile-nav-link-active"
        items={[
          { key: "today", to: "/today", label: "今日", active: pathname === "/today", onClick: activeTabClick(pathname === "/today"), icon: <HouseIcon aria-hidden="true" size={20} weight="regular" /> },
          { key: "interview", to: "/interview", label: "八股", active: interviewTrainingActive, onClick: activeTabClick(interviewTrainingActive), icon: <BookOpenIcon aria-hidden="true" size={20} weight="regular" /> },
          { key: "diary", to: "/diary", label: "日记", active: diaryActive, onClick: activeTabClick(diaryActive), className: "mobile-nav-diary", icon: <i><PlusIcon aria-hidden="true" size={22} weight="bold" /></i> },
          { key: "algorithms", to: "/algorithms", label: "算法", active: algorithmTrainingActive, onClick: activeTabClick(algorithmTrainingActive), icon: <TreeStructureIcon aria-hidden="true" size={20} weight="regular" /> },
          { key: "me", to: "/me", label: "我的", active: pathname === "/me", onClick: activeTabClick(pathname === "/me"), icon: <UserCircleIcon aria-hidden="true" size={20} weight="regular" /> },
        ]}
      />
    </>
  );
}
