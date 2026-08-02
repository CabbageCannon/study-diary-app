import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AppLayout } from "./layout/AppLayout";
import { HistoryPage } from "./pages/HistoryPage";
import { InterviewHistoryPage } from "./pages/InterviewHistoryPage";
import { InterviewPage } from "./pages/InterviewPage";
import { InterviewReviewPage } from "./pages/InterviewReviewPage";
import { InterviewSessionPage } from "./pages/InterviewSessionPage";
import { WriteDiaryPage } from "./pages/WriteDiaryPage";

const questionReviewEnabled = import.meta.env.VITE_ENABLE_QUESTION_REVIEW === "true";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/write" replace />} />
          <Route path="/write" element={<WriteDiaryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/interview" element={<InterviewPage />} />
          <Route path="/interview/session/:setId" element={<InterviewSessionPage />} />
          <Route path="/interview/history" element={<InterviewHistoryPage />} />
          <Route path="/interview/review" element={questionReviewEnabled ? <InterviewReviewPage /> : <Navigate to="/interview" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
