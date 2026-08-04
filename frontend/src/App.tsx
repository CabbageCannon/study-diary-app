import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AppLayout } from "./layout/AppLayout";
import { InterviewBatchJobProvider } from "./contexts/InterviewBatchJobContext";
import { PwaInstallProvider } from "./contexts/PwaInstallContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { HistoryPage } from "./pages/HistoryPage";
import { InterviewHistoryPage } from "./pages/InterviewHistoryPage";
import { InterviewPage } from "./pages/InterviewPage";
import { InterviewReviewPage } from "./pages/InterviewReviewPage";
import { InterviewSessionPage } from "./pages/InterviewSessionPage";
import { WriteDiaryPage } from "./pages/WriteDiaryPage";
import { AlgorithmsPage } from "./pages/AlgorithmsPage";
import { AlgorithmHistoryPage } from "./pages/AlgorithmHistoryPage";
import { AlgorithmProblemPage } from "./pages/AlgorithmProblemPage";
import { AlgorithmReviewPage } from "./pages/AlgorithmReviewPage";
import { AlgorithmSessionPage } from "./pages/AlgorithmSessionPage";
import { AlgorithmSettingsPage } from "./pages/AlgorithmSettingsPage";
import { DesktopPetSettingsPage } from "./pages/DesktopPetSettingsPage";
import { AlgorithmWorkspaceLayout } from "./layout/AlgorithmWorkspaceLayout";

const questionReviewEnabled = import.meta.env.VITE_ENABLE_QUESTION_REVIEW === "true";

export default function App() {
  return (
    <Router>
      <PwaInstallProvider>
        <ThemeProvider>
          <InterviewBatchJobProvider enabled={questionReviewEnabled}>
            <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/write" replace />} />
              <Route path="/write" element={<WriteDiaryPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/algorithms" element={<AlgorithmWorkspaceLayout />}>
                <Route index element={<AlgorithmsPage />} />
                <Route path="settings" element={<AlgorithmSettingsPage />} />
                <Route path="history" element={<AlgorithmHistoryPage />} />
                <Route path="review" element={<AlgorithmReviewPage />} />
              </Route>
              <Route path="/algorithms/session/:sessionId" element={<AlgorithmSessionPage />} />
              <Route path="/algorithms/problems/:problemId" element={<AlgorithmProblemPage />} />
              <Route path="/interview" element={<InterviewPage />} />
              <Route path="/interview/session/:setId" element={<InterviewSessionPage />} />
              <Route path="/interview/history" element={<InterviewHistoryPage />} />
              <Route path="/interview/review" element={questionReviewEnabled ? <InterviewReviewPage /> : <Navigate to="/interview" replace />} />
              <Route path="/settings/desktop-pet" element={<DesktopPetSettingsPage />} />
            </Route>
            </Routes>
          </InterviewBatchJobProvider>
        </ThemeProvider>
      </PwaInstallProvider>
    </Router>
  );
}
