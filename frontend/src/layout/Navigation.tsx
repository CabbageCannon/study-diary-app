import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BookOpenIcon } from "@phosphor-icons/react/BookOpen";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ClockCounterClockwise";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { MoonIcon } from "@phosphor-icons/react/Moon";
import { PlayCircleIcon } from "@phosphor-icons/react/PlayCircle";
import { TreeStructureIcon } from "@phosphor-icons/react/TreeStructure";
import { SunIcon } from "@phosphor-icons/react/Sun";

import { useTheme } from "../contexts/ThemeContext";
import { MobileMoreSheet } from "./MobileMoreSheet";

const desktopNavItems = [
  { to: "/write", label: "写日记", matches: (pathname: string) => pathname === "/write" },
  { to: "/history", label: "历史日记", matches: (pathname: string) => pathname === "/history" },
  { to: "/interview", label: "八股训练", matches: (pathname: string) => pathname === "/interview" || pathname.startsWith("/interview/session/") },
  { to: "/algorithms", label: "算法训练", matches: (pathname: string) => pathname === "/algorithms" || pathname.startsWith("/algorithms/") },
  { to: "/interview/history", label: "训练历史", matches: (pathname: string) => pathname === "/interview/history" },
  { to: "/settings/desktop-pet", label: "桌宠设置", matches: (pathname: string) => pathname === "/settings/desktop-pet" },
];

const questionReviewEnabled = import.meta.env.VITE_ENABLE_QUESTION_REVIEW === "true";

export function Navigation() {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const desktopItems = [...desktopNavItems, ...(questionReviewEnabled ? [{ to: "/interview/review", label: "题库审核", matches: (path: string) => path === "/interview/review" }] : [])];

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
          {desktopItems.map((item) => (
            <NavLink className={item.matches(pathname) ? "nav-link nav-link-active" : "nav-link"} to={item.to} key={item.to}>
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="navigation-footer">
          <button
            className="theme-toggle"
            aria-label={theme === "editorial" ? "切换到安静深色主题" : "切换到编辑浅色主题"}
            title={theme === "editorial" ? "切换到安静深色主题" : "切换到编辑浅色主题"}
            onClick={toggleTheme}
            type="button"
          >
            {theme === "editorial" ? <MoonIcon aria-hidden="true" size={18} weight="bold" /> : <SunIcon aria-hidden="true" size={18} weight="bold" />}
          </button>
        </div>
      </nav>

      <nav className="mobile-bottom-navigation" aria-label="移动端主导航">
        <NavLink className={pathname === "/write" ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"} to="/write"><BookOpenIcon aria-hidden="true" size={21} weight="bold" /><span>日记</span></NavLink>
        <NavLink className={pathname === "/algorithms" || pathname.startsWith("/algorithms/") ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"} to="/algorithms"><TreeStructureIcon aria-hidden="true" size={21} weight="bold" /><span>算法</span></NavLink>
        <NavLink className={pathname === "/interview" || pathname.startsWith("/interview/session/") ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"} to="/interview"><PlayCircleIcon aria-hidden="true" size={21} weight="fill" /><span>训练</span></NavLink>
        <button className={moreOpen || pathname === "/interview/review" ? "mobile-nav-link mobile-nav-link-active" : "mobile-nav-link"} aria-expanded={moreOpen} aria-haspopup="dialog" onClick={() => setMoreOpen(true)} type="button"><DotsThreeIcon aria-hidden="true" size={21} weight="bold" /><span>更多</span></button>
      </nav>
      <MobileMoreSheet open={moreOpen} reviewEnabled={questionReviewEnabled} onClose={() => setMoreOpen(false)} />
    </>
  );
}
