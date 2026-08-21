import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Upload,
  MessageSquare,
  FileText,
  Settings,
  LogOut,
  BarChart,
  LineChart,
  NotebookPen,
} from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutGrid },
  { to: "/app/daily-entry", label: "Daily log", icon: NotebookPen },
  { to: "/app/upload", label: "Upload data", icon: Upload },
  { to: "/app/ask", label: "Ask a question", icon: MessageSquare },
  { to: "/app/reports", label: "Reports", icon: FileText },
  { to: "/app/overview", label: "Overview", icon: BarChart },
  { to: "/app/forecast", label: "Forecast", icon: LineChart },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <aside className="w-60 shrink-0 border-r border-ink-200 flex flex-col bg-white">
      <div className="h-16 flex items-center gap-2 px-5 border-b border-ink-200">
        <Logo />
        <span className="font-bold text-ink-900">AI Biz</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                isActive
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-ink-600 hover:bg-ink-50"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-ink-200">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-ink-500 hover:bg-ink-50"
        >
          <LogOut size={18} />
          Log out
        </button>
      </div>
    </aside>
  );
}
