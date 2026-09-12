import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AppLayout } from "./layout/AppLayout";
import { InterviewBatchJobProvider } from "./contexts/InterviewBatchJobContext";
import { PwaInstallProvider } from "./contexts/PwaInstallContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TodayPage } from "./pages/TodayPage";
import { prefetchAppData } from "./services/appPrefetch";

const HistoryPage = lazy(() => import("./pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const DiaryPage = lazy(() => import("./pages/DiaryPage").then((module) => ({ default: module.DiaryPage })));
const InterviewHistoryPage = lazy(() => import("./pages/InterviewHistoryPage").then((module) => ({ default: module.InterviewHistoryPage })));
const InterviewPage = lazy(() => import("./pages/InterviewPage").then((module) => ({ default: module.InterviewPage })));
const InterviewReviewPage = lazy(() => import("./pages/InterviewReviewPage").then((module) => ({ default: module.InterviewReviewPage })));
const InterviewSessionPage = lazy(() => import("./pages/InterviewSessionPage").then((module) => ({ default: module.InterviewSessionPage })));
const WriteDiaryPage = lazy(() => import("./pages/WriteDiaryPage").then((module) => ({ default: module.WriteDiaryPage })));
const AlgorithmsPage = lazy(() => import("./pages/AlgorithmsPage").then((module) => ({ default: module.AlgorithmsPage })));
const AlgorithmHistoryPage = lazy(() => import("./pages/AlgorithmHistoryPage").then((module) => ({ default: module.AlgorithmHistoryPage })));
const AlgorithmProblemPage = lazy(() => import("./pages/AlgorithmProblemPage").then((module) => ({ default: module.AlgorithmProblemPage })));
const AlgorithmReviewPage = lazy(() => import("./pages/AlgorithmReviewPage").then((module) => ({ default: module.AlgorithmReviewPage })));
const AlgorithmSessionPage = lazy(() => import("./pages/AlgorithmSessionPage").then((module) => ({ default: module.AlgorithmSessionPage })));
const AlgorithmSettingsPage = lazy(() => import("./pages/AlgorithmSettingsPage").then((module) => ({ default: module.AlgorithmSettingsPage })));
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
    import("./pages/InterviewPage"),
    import("./pages/InterviewHistoryPage"),
    import("./pages/InterviewSessionPage"),
    import("./pages/AlgorithmsPage"),
    import("./pages/AlgorithmSettingsPage"),
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
              <Route path="/algorithms" element={routeView(<AlgorithmWorkspaceLayout />)}>
                <Route index element={routeView(<AlgorithmsPage />)} />
                <Route path="settings" element={routeView(<AlgorithmSettingsPage />)} />
                <Route path="history" element={routeView(<AlgorithmHistoryPage />)} />
                <Route path="review" element={routeView(<AlgorithmReviewPage />)} />
              </Route>
              <Route path="/algorithms/session/:sessionId" element={routeView(<AlgorithmSessionPage />)} />
              <Route path="/algorithms/problems/:problemId" element={routeView(<AlgorithmProblemPage />)} />
              <Route path="/interview" element={routeView(<InterviewWorkspaceLayout />)}>
                <Route index element={routeView(<InterviewPage />)} />
                <Route path="setup" element={routeView(<InterviewPage />)} />
                <Route path="history" element={routeView(<InterviewHistoryPage />)} />
              </Route>
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
