import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AppLayout } from "./layout/AppLayout";
import { InterviewBatchJobProvider } from "./contexts/InterviewBatchJobContext";
import { PwaInstallProvider } from "./contexts/PwaInstallContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AlgorithmHistoryPage } from "./pages/AlgorithmHistoryPage";
import { AlgorithmReviewPage } from "./pages/AlgorithmReviewPage";
import { AlgorithmsPage } from "./pages/AlgorithmsPage";
import { AlgorithmSettingsPage } from "./pages/AlgorithmSettingsPage";
import { InterviewHistoryPage } from "./pages/InterviewHistoryPage";
import { InterviewPage } from "./pages/InterviewPage";
import { TodayPage } from "./pages/TodayPage";
import { prefetchAppData } from "./services/appPrefetch";

const HistoryPage = lazy(() => import("./pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const DiaryPage = lazy(() => import("./pages/DiaryPage").then((module) => ({ default: module.DiaryPage })));
const InterviewReviewPage = lazy(() => import("./pages/InterviewReviewPage").then((module) => ({ default: module.InterviewReviewPage })));
const InterviewSessionPage = lazy(() => import("./pages/InterviewSessionPage").then((module) => ({ default: module.InterviewSessionPage })));
const WriteDiaryPage = lazy(() => import("./pages/WriteDiaryPage").then((module) => ({ default: module.WriteDiaryPage })));
const AlgorithmProblemPage = lazy(() => import("./pages/AlgorithmProblemPage").then((module) => ({ default: module.AlgorithmProblemPage })));
const AlgorithmSessionPage = lazy(() => import("./pages/AlgorithmSessionPage").then((module) => ({ default: module.AlgorithmSessionPage })));
const DesktopPetSettingsPage = lazy(() => import("./pages/DesktopPetSettingsPage").then((module) => ({ default: module.DesktopPetSettingsPage })));
const MePage = lazy(() => import("./pages/MePage").then((module) => ({ default: module.MePage })));
const AlgorithmWorkspaceLayout = lazy(() => import("./layout/AlgorithmWorkspaceLayout").then((module) => ({ default: module.AlgorithmWorkspaceLayout })));
const InterviewWorkspaceLayout = lazy(() => import("./layout/InterviewWorkspaceLayout").then((module) => ({ default: module.InterviewWorkspaceLayout })));

const questionReviewEnabled = import.meta.env.VITE_ENABLE_QUESTION_REVIEW === "true";

const standaloneSessionKey = "study-diary:standalone-session-started";
if (window.matchMedia("(display-mode: standalone)").matches && !window.sessionStorage.getItem(standaloneSessionKey)) {
  window.sessionStorage.setItem(standaloneSessionKey, "1");
  if (window.location.pathname !== "/today") window.history.replaceState(null, "", "/today");
}

void prefetchAppData();
window.setTimeout(() => {
  void Promise.allSettled([
    import("./pages/InterviewSessionPage"),
    import("./pages/AlgorithmSessionPage"),
    import("./pages/DiaryPage"),
    import("./layout/InterviewWorkspaceLayout"),
    import("./layout/AlgorithmWorkspaceLayout"),
  ]);
}, 0);

function routeView(content: ReactNode) {
  return <Suspense fallback={<div className="route-loading" role="status"><span />正在打开页面…</div>}>{content}</Suspense>;
}

export default function App() {
  return (
    <Router>
      <PwaInstallProvider>
        <ThemeProvider>
          <InterviewBatchJobProvider enabled={questionReviewEnabled}>
            <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="/today" element={routeView(<TodayPage />)} />
              <Route path="/me" element={routeView(<MePage />)} />
              <Route path="/diary" element={routeView(<DiaryPage />)} />
              <Route path="/write" element={routeView(<WriteDiaryPage />)} />
              <Route path="/history" element={routeView(<HistoryPage />)} />
              <Route path="/algorithms/*" element={routeView(
                <AlgorithmWorkspaceLayout pages={[
                  routeView(<AlgorithmsPage />),
                  routeView(<AlgorithmReviewPage />),
                  routeView(<AlgorithmHistoryPage />),
                  routeView(<AlgorithmSettingsPage />),
                ]} />,
              )} />
              <Route path="/algorithms/session/:sessionId" element={routeView(<AlgorithmSessionPage />)} />
              <Route path="/algorithms/problems/:problemId" element={routeView(<AlgorithmProblemPage />)} />
              <Route path="/interview/*" element={routeView(
                <InterviewWorkspaceLayout pages={[
                  routeView(<InterviewPage mode="practice" />),
                  routeView(<InterviewPage mode="setup" />),
                  routeView(<InterviewHistoryPage />),
                ]} />,
              )} />
              <Route path="/interview/session/:setId" element={routeView(<InterviewSessionPage />)} />
              <Route path="/interview/review" element={questionReviewEnabled ? routeView(<InterviewReviewPage />) : <Navigate to="/interview" replace />} />
              <Route path="/settings/desktop-pet" element={routeView(<DesktopPetSettingsPage />)} />
            </Route>
            </Routes>
          </InterviewBatchJobProvider>
        </ThemeProvider>
      </PwaInstallProvider>
    </Router>
  );
}
