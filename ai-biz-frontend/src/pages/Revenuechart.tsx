import { useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Series } from "../lib/api";

type Props = {
  series: Series;
};

export default function RevenueChart({ series }: Props) {
  const uid = useId().replace(/:/g, "");

  const lineGradId = `lineGrad-${uid}`;
  const fillGradId = `fillGrad-${uid}`;
  const waterGradId = `waterGrad-${uid}`;
  const glowFilterId = `glowFilter-${uid}`;
  const rippleFilterId = `rippleFilter-${uid}`;

  const data = series.labels.map((label, i) => ({
    label,
    value: series.values[i] ?? 0,
  }));

  const formatValue = (value: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
    }).format(value);

  return (
    <div
      className="revenue-chart-flow"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 360,
      }}
    >
      <ResponsiveContainer width="100%" height={360}>
        <AreaChart
          data={data}
          margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
        >
          <defs>
            {/* ========== LINE GRADIENT (color shifts forever) ========== */}
            <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981">
                <animate
                  attributeName="stop-color"
                  values="#10b981;#06b6d4;#6366f1;#10b981"
                  dur="6s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="50%" stopColor="#6366f1">
                <animate
                  attributeName="stop-color"
                  values="#6366f1;#8b5cf6;#06b6d4;#6366f1"
                  dur="6s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="100%" stopColor="#4f46e5">
                <animate
                  attributeName="stop-color"
                  values="#4f46e5;#10b981;#6366f1;#4f46e5"
                  dur="6s"
                  repeatCount="indefinite"
                />
              </stop>
            </linearGradient>

            {/* ========== FILL GRADIENT (soft pulse) ========== */}
            <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22">
                <animate
                  attributeName="stop-opacity"
                  values="0.16;0.34;0.16"
                  dur="3.5s"
                  repeatCount="indefinite"
                />
              </stop>
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.03" />
            </linearGradient>

            {/* ========== MOVING WATER HIGHLIGHT ========== */}
            <linearGradient
              id={waterGradId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
              gradientUnits="objectBoundingBox"
            >
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="35%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.6" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="65%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />

              <animateTransform
                attributeName="gradientTransform"
                type="translate"
                from="-1.2 0"
                to="1.2 0"
                dur="2.6s"
                repeatCount="indefinite"
              />
            </linearGradient>

            {/* ========== GLOW ========== */}
            <filter
              id={glowFilterId}
              x="-25%"
              y="-40%"
              width="150%"
              height="180%"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="2.5"
                result="blur"
              />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* ========== SUBTLE RIPPLE ========== */}
            <filter
              id={rippleFilterId}
              x="-10%"
              y="-20%"
              width="120%"
              height="140%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.012 0.055"
                numOctaves="2"
                seed="4"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  values="0.012 0.055;0.02 0.085;0.01 0.045;0.012 0.055"
                  dur="5s"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="1.6"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e5e7eb"
            vertical={false}
          />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
          />

          <YAxis
            tick={{ fontSize: 12, fill: "#64748b" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatValue}
            width={60}
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

          {/* Main area + flowing line */}
          <Area
            type="monotone"
            dataKey="value"
            stroke={`url(#${lineGradId})`}
            strokeWidth={3}
            fill={`url(#${fillGradId})`}
            filter={`url(#${rippleFilterId})`}
            dot={{ r: 3.5, fill: "#6366f1", strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
            className="flow-line"
          />

          {/* Moving water light over the fill */}
          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill={`url(#${waterGradId})`}
            fillOpacity={0.9}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
            activeDot={false}
            dot={false}
          />

          {/* Soft outer glow line */}
          <Area
            type="monotone"
            dataKey="value"
            stroke={`url(#${lineGradId})`}
            strokeWidth={6}
            strokeOpacity={0.2}
            fill="none"
            filter={`url(#${glowFilterId})`}
            isAnimationActive={false}
            legendType="none"
            tooltipType="none"
            activeDot={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
