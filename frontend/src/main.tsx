import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { AuthGate } from "./auth/AuthGate";
import { PwaUpdateProvider } from "./contexts/PwaUpdateContext";
import "./styles/global.css";
import "./styles/diary.css";
import "./styles/navigation.css";
import "./styles/today.css";
import "./styles/me.css";
import "./styles/mobile-learning.css";
import "./styles/apple-ui.css";
import "./styles/theme-switcher.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <PwaUpdateProvider><AuthGate><App /></AuthGate></PwaUpdateProvider>
    </AuthProvider>
  </StrictMode>,
);
