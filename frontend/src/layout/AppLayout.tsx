import { Outlet } from "react-router-dom";

import { Navigation } from "./Navigation";

export function AppLayout() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <div className="app-frame">
        <Navigation />
        <main className="main-surface" id="main-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}
