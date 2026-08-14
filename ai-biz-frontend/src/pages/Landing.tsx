import { useNavigate } from "react-router-dom";
import {
  FileSearch,
  ShieldAlert,
  TrendingUp,
  MessageSquare,
  Zap,
} from "lucide-react";
import Logo from "../components/Logo";
import imageUrl from "../components/bgs.jpg";

const features = [
  {
    icon: FileSearch,
    color: "brand",
    title: "AI data interpreter",
    text: "Upload CSV, Excel, or PDF reports and get plain-English explanations of what’s in them.",
  },
  {
    icon: ShieldAlert,
    color: "teal",
    title: "Risk detection",
    text: "Automatically flags declining sales, rising costs, churn signals, and cash flow concerns.",
  },
  {
    icon: TrendingUp,
    color: "amber",
    title: "Forecasting",
    text: "Predicts sales, revenue, inventory demand, and customer growth using AI models.",
  },
  {
    icon: MessageSquare,
    color: "rose",
    title: "AI chatbot",
    text: 'Ask "Which product generated the highest profit?" in plain language, get an instant answer.',
  },
];

const colorMap: Record<string, string> = {
  brand: "bg-brand-100 text-brand-600",
  teal: "bg-teal-100 text-teal-600",
  amber: "bg-amber-100 text-amber-600",
  rose: "bg-rose-100 text-rose-600",
};

export default function Landing() {
  const navigate = useNavigate();
  return (
    <div
      className="bg-cover bg-center h-screen"
      style={{ backgroundImage: `url(${imageUrl})` }}
    >
      <header className="border-b border-ink-200 sticky top-0 bg-white/90 backdrop-blur z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-bold text-lg text-ink-900">AI Biz</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ink-600">
            <a href="#features" className="hover:text-ink-900">
              Features
            </a>
            <a href="#how" className="hover:text-ink-900">
              How it works
            </a>
            <a href="#" className="hover:text-ink-900">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/login")}
              className="text-sm font-semibold text-ink-700 hover:text-ink-900 px-3 py-2"
            >
              Log in
            </button>
            <button
              onClick={() => navigate("/signup")}
              className="text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg transition"
            >
              Get started free
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl text-white md:text-6xl font-extrabold text-ink-900 tracking-tight leading-[1.1] max-w-4xl mx-auto">
          Turn your business data into decisions, automatically
        </h1>
        <p className="mt-6  text-lg text-ink-600 max-w-2xl mx-auto">
          Upload your sales, financial, and operational data. AI Biz explains
          what's happening, why it's happening, and what to do next — no analyst
          required.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            onClick={() => navigate("/signup")}
            className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-lg transition text-sm"
          >
            Get Started
          </button>
        </div>

        <div className="mt-16 rounded-2xl border border-ink-200 shadow-2xl shadow-ink-200/50 overflow-hidden max-w-5xl mx-auto text-left">
          <div className="bg-ink-50 border-b border-ink-200 px-4 py-2 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <div className="bg-brand-50/40 p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center shrink-0 mt-0.5">
              <Zap size={16} className="text-white" />
            </div>
            <p className="text-sm text-ink-700 leading-relaxed">
              <span className="font-semibold text-ink-900">
                Executive summary:
              </span>{" "}
              Revenue increased by 12% this quarter, driven primarily by strong
              product sales in the West region. Customer retention improved by
              8%, while inventory costs rose by 15%.
            </p>
          </div>
        </div>
      </section>

      <section id="features" className="bg-ink-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl font-bold text-ink-900">
              The problem with traditional BI tools
            </h2>
            <p className="mt-4 text-ink-600">
              Dashboards show you charts. They don't tell you why trends are
              happening or what to do about them. AI Biz closes that gap.
            </p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {features.map(({ icon: Icon, color, title, text }) => (
              <div
                key={title}
                className="bg-white rounded-xl border border-ink-200 p-6"
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${colorMap[color]}`}
                >
                  <Icon size={20} />
                </div>
                <h3 className="font-semibold text-ink-900 mb-1">{title}</h3>
                <p className="text-sm text-ink-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl font-bold text-ink-900">How it works</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              [
                "Upload your data",
                "Sales reports, financial statements, customer feedback, inventory records — CSV, Excel, or PDF.",
              ],
              [
                "AI analyzes it",
                "Gemini-powered analysis detects trends, anomalies, and risks, and generates an executive summary.",
              ],
              [
                "Act on recommendations",
                "Get specific, actionable recommendations and ask follow-up questions in natural language.",
              ],
            ].map(([title, text], i) => (
              <div key={title} className="text-center">
                <div className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center mx-auto mb-4 font-bold">
                  {i + 1}
                </div>
                <h3 className="font-semibold text-ink-900 mb-2">{title}</h3>
                <p className="text-sm text-ink-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-600 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Make faster, smarter business decisions
          </h2>
          <p className="text-brand-100 mb-8">
            Join businesses using AI Biz to turn raw data into clear action.
          </p>
          <button
            onClick={() => navigate("/signup")}
            className="bg-white text-brand-700 font-semibold px-6 py-3 rounded-lg hover:bg-brand-50 transition text-sm"
          >
            Get started free
          </button>
        </div>
      </section>

      <footer className="border-t border-ink-200 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="font-semibold text-ink-800 text-sm">AI Biz</span>
          </div>
          <p className="text-xs text-ink-500">
            © 2026 AI Biz. All rights reserved.
          </p>
          <p>NCY products</p>
        </div>
      </footer>
    </div>
  );
}
