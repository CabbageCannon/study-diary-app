import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { BackgroundTaskCenter } from "../components/interview/BackgroundTaskCenter";
import { PwaStatus } from "../pwa/PwaStatus";
import { Navigation } from "./Navigation";

export function AppLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const usesContainedWorkspace = pathname === "/write" || pathname === "/history";
  const isFocusRoute = pathname.startsWith("/interview/session/") || pathname.startsWith("/algorithms/session/");
  const frameClassName = [
    "app-frame",
    usesContainedWorkspace ? "app-frame-contained" : "",
    isFocusRoute ? "app-frame-focus" : "",
  ].filter(Boolean).join(" ");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <div className={frameClassName}>
        {isFocusRoute ? null : <Navigation />}
        <main className={usesContainedWorkspace ? "main-surface main-surface-contained" : "main-surface"} id="main-content" ref={mainRef}>
          <Outlet />
        </main>
      </div>
      <PwaStatus />
      <BackgroundTaskCenter />
    </>
  );
}
