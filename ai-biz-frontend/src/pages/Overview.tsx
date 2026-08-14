import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload } from "lucide-react";
import RevenueChart from "../components/RevenueChart";
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
            Upload a business report to see revenue and region charts here.
          </p>
          <button
            onClick={() => navigate("/app/upload")}
            className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            Upload data
          </button>
        </div>
      </div>
    );
  }

  const hasRevenue = summary.revenue_trend.labels.length > 0;
  const hasRegion = summary.region_breakdown.labels.length > 0;

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-ink-900 mb-6">Overview</h1>

      {!hasRevenue && !hasRegion ? (
        <div className="bg-white rounded-xl border border-ink-200 p-8 text-center text-sm text-ink-500">
          No chartable data was found in your uploaded dataset yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {hasRevenue && (
            <div className="bg-white rounded-xl border border-ink-200 p-6">
              <p className="text-sm font-semibold text-ink-900 mb-4">
                Revenue trend
              </p>
              <RevenueChart series={summary.revenue_trend} />
            </div>
          )}
          {hasRegion && (
            <div className="bg-white rounded-xl border border-ink-200 p-6">
              <p className="text-sm font-semibold text-ink-900 mb-4">
                Revenue by region
              </p>
              <RegionChart series={summary.region_breakdown} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
