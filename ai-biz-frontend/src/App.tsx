import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import UploadData from "./pages/UploadData";
import AskQuestion from "./pages/AskQuestion";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Overview from "./pages/Overview";
import Forecast from "./pages/Forecast";
import DailyEntry from "./pages/DailyEntry";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="daily-entry" element={<DailyEntry />} />
        <Route path="upload" element={<UploadData />} />
        <Route path="ask" element={<AskQuestion />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="overview" element={<Overview />} />
        <Route path="forecast" element={<Forecast />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
