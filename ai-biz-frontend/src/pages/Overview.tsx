import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Zap, Upload } from "lucide-react";
import KpiCard from "../components/KpiCard";
import RegionChart from "../components/RegionChart";
import * as api from "../lib/api";

export default function Overview() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<api.DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load overview.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-ink-500">Loading overview...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3">
          {error}
        </div>
      </div>
    );
  }

  if (!summary || !summary.has_data) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-dashed border-ink-300 p-12 text-center">
          <Upload size={36} className="text-brand-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-ink-800 mb-1">No data yet</p>
          <p className="text-sm text-ink-500 mb-5">
            Log a day of sales/purchases, or upload a business report, to see
            charts and trends here.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => navigate("/app/daily-entry")}
              className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Log today's data
            </button>
            <button
              onClick={() => navigate("/app/upload")}
              className="bg-white border border-ink-200 hover:bg-ink-50 text-ink-700 text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Upload a file instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasRegion = summary.region_breakdown.labels.length > 0;
  const hasCharts = hasRegion;

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-ink-900 mb-1">Overview</h1>
      <p className="text-sm text-ink-500 mb-6">
        A visual read of your latest upload — trends, breakdowns, and a
        short-term forecast.
      </p>

      {summary.kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {summary.kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
      )}

      {summary.executive_summary && (
        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-6 flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-brand-700 mb-1">
              AI executive summary
            </p>
            <p className="text-sm text-ink-700 leading-relaxed">
              {summary.executive_summary}
            </p>
          </div>
        </div>
      )}

      {!hasCharts ? (
        <div className="bg-white rounded-xl border border-ink-200 p-8 text-center text-sm text-ink-500">
          No chartable data was found in your uploaded dataset yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {hasRegion && (
            <div className="bg-white rounded-xl border border-ink-200 p-6">
              <p className="text-sm font-semibold text-ink-900 mb-4">
                Top sales
              </p>
              <RegionChart series={summary.region_breakdown} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
