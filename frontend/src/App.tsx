import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";

import { AppLayout } from "./layout/AppLayout";
import { HistoryPage } from "./pages/HistoryPage";
import { WriteDiaryPage } from "./pages/WriteDiaryPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/write" replace />} />
          <Route path="/write" element={<WriteDiaryPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Route>
      </Routes>
    </Router>
  );
}
