import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { AccessTokenProvider } from "./auth/AccessTokenContext";
import "./styles/global.css";
import "./styles/diary.css";
import "./styles/navigation.css";
import "./styles/today.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AccessTokenProvider>
      <App />
    </AccessTokenProvider>
  </StrictMode>,
);
