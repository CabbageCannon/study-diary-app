import { Outlet } from "react-router-dom";

import { Navigation } from "./Navigation";

export function AppLayout() {
  return (
    <div className="app-frame">
      <Navigation />
      <main className="main-surface">
        <Outlet />
      </main>
    </div>
  );
}
