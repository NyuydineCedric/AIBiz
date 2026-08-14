import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import type { Series } from "../lib/api";

type Props = {
  series: Series;
};

const BAR_COLOR = "#4f46e5";
const LOWEST_BAR_COLOR = "#f43f5e";

export default function RegionChart({ series }: Props) {
  const data = series.labels.map((label, i) => ({
    label,
    value: series.values[i] ?? 0,
  }));

  const lowestValue =
    data.length > 0 ? Math.min(...data.map((d) => d.value)) : null;

  // Give the label column enough width for the longest region name so
  // nothing gets truncated, with sensible min/max bounds.
  const longestLabel = data.reduce(
    (max, d) => Math.max(max, d.label.length),
    0,
  );
  const labelColumnWidth = Math.min(220, Math.max(110, longestLabel * 7.5));

  const formatValue = (value: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
    }).format(value);

  const chartHeight = Math.max(320, data.length * 56);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 40, left: 0, bottom: 5 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#eef0f2"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 12, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatValue}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 13, fill: "#334155" }}
          axisLine={false}
          tickLine={false}
          width={labelColumnWidth}
        />
        <Tooltip
          formatter={(value: number) => [
            new Intl.NumberFormat("en-US").format(value),
            "Revenue",
          ]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
          }}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
          {data.map((d) => (
            <Cell
              key={d.label}
              fill={d.value === lowestValue ? LOWEST_BAR_COLOR : BAR_COLOR}
            />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(value: number) =>
              new Intl.NumberFormat("en-US").format(value)
            }
            style={{ fontSize: 12, fill: "#475569", fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
