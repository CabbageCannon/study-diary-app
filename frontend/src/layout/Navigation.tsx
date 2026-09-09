import { NavLink, useLocation } from "react-router-dom";
import { BookOpenIcon } from "@phosphor-icons/react/BookOpen";
import { HouseIcon } from "@phosphor-icons/react/House";
import { MoonIcon } from "@phosphor-icons/react/Moon";
import { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
import { SunIcon } from "@phosphor-icons/react/Sun";
import { UserCircleIcon } from "@phosphor-icons/react/UserCircle";

import { useTheme } from "../contexts/ThemeContext";

const desktopPrimaryItems = [
  { to: "/today", label: "今日", matches: (pathname: string) => pathname === "/today" },
  { to: "/me", label: "我的", matches: (pathname: string) => pathname === "/me" },
  { to: "/write", label: "写日记", matches: (pathname: string) => pathname === "/write" },
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
  const { theme, toggleTheme } = useTheme();
  const desktopTools = [...desktopToolItems, ...(questionReviewEnabled ? [{ to: "/interview/review", label: "题库审核", matches: (path: string) => path === "/interview/review" }] : [])];
  const algorithmTrainingActive = pathname.startsWith("/algorithms");
  const interviewTrainingActive = pathname.startsWith("/interview");

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
            aria-label={theme === "night" ? "切换到雾松主题" : "切换到墨夜主题"}
            title={theme === "night" ? "切换到雾松主题" : "切换到墨夜主题"}
            onClick={toggleTheme}
            type="button"
          >
            {theme === "night" ? <SunIcon aria-hidden="true" size={18} weight="bold" /> : <MoonIcon aria-hidden="true" size={18} weight="bold" />}
          </button>
        </div>
      </nav>

      <nav className="mobile-bottom-navigation" aria-label="移动端主导航">
        <NavLink className={pathname === "/today" ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"} onClick={activeTabClick(pathname === "/today")} to="/today"><HouseIcon aria-hidden="true" size={20} weight="regular" /><span>今日</span></NavLink>
        <NavLink className={interviewTrainingActive ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"} onClick={activeTabClick(interviewTrainingActive)} to="/interview"><BookOpenIcon aria-hidden="true" size={20} weight="regular" /><span>八股</span></NavLink>
        <NavLink className={algorithmTrainingActive ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"} onClick={activeTabClick(algorithmTrainingActive)} to="/algorithms"><TreeStructureIcon aria-hidden="true" size={20} weight="regular" /><span>算法</span></NavLink>
        <NavLink className={pathname === "/me" ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"} onClick={activeTabClick(pathname === "/me")} to="/me"><UserCircleIcon aria-hidden="true" size={20} weight="regular" /><span>我的</span></NavLink>
      </nav>
    </>
  );
}
