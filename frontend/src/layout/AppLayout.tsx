import { Outlet, useLocation } from "react-router-dom";

import { BackgroundTaskCenter } from "../components/interview/BackgroundTaskCenter";
import { PwaStatus } from "../pwa/PwaStatus";
import { Navigation } from "./Navigation";

export function AppLayout() {
  const { pathname } = useLocation();
  const usesContainedWorkspace = pathname === "/write" || pathname === "/history" || pathname === "/interview/history";
  const isFocusRoute = pathname.startsWith("/interview/session/") || pathname.startsWith("/algorithms/session/");
  const frameClassName = [
    "app-frame",
    usesContainedWorkspace ? "app-frame-contained" : "",
    isFocusRoute ? "app-frame-focus" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <div className={frameClassName}>
        {isFocusRoute ? null : <Navigation />}
        <main className={usesContainedWorkspace ? "main-surface main-surface-contained" : "main-surface"} id="main-content">
          <Outlet />
        </main>
      </div>
      <PwaStatus />
      <BackgroundTaskCenter />
    </>
  );
}
