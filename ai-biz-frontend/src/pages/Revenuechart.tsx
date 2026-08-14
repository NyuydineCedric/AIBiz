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

/**
 * RevenueChart
 * ------------
 * Renders a revenue trend as a filled line chart with a continuous,
 * looping "flowing water" animation:
 *   1. A moving dash pattern that travels along the stroke line.
 *   2. Slowly color-cycling gradients on both the line and the fill.
 *   3. A soft highlight band that sweeps left-to-right across the fill.
 *   4. A gentle vertical float on the whole chart.
 *
 * All animation here is CSS keyframes + inline SVG SMIL <animate> tags —
 * there is no JavaScript driving the motion frame-by-frame. That means:
 *   - It keeps animating indefinitely with zero React re-renders.
 *   - It is subject to `prefers-reduced-motion` and any global CSS resets
 *     in the app (e.g. Tailwind preflight) that force
 *     `animation-duration: 0.01ms !important` — if animations appear
 *     "stuck," that's the first thing to check in DevTools > Computed styles.
 */

type Props = {
  /** { labels: string[]; values: number[] } — one value per label, same length. */
  series: Series;
};

// Defined outside the component so the string is created once, not on
// every render (re-creating a template literal + re-parsing CSS on each
// render is wasted work and can cause a flash/reset of the animation).
const chartStyles = `
  /* Moves the stroke's dash pattern leftward by exactly one full pattern
     length (10 + 6 = 16px) per cycle. Because the offset distance equals
     the pattern length, the dash lines up perfectly with itself at the
     end of each loop — so it reads as one continuous flow instead of a
     visible jump/reset every 1.6s. */
  @keyframes dashflow {
    to { stroke-dashoffset: -32; } /* -32 = 2x the 16px pattern, gives a longer visible run before repeating */
  }

  /* Whole-chart gentle bob, independent of the line/fill animations. */
  .revenue-chart-wrap .float-container {
    animation: floatY 4s ease-in-out infinite;
  }
  @keyframes floatY {
    0%, 100% { transform: translateY(0px); }
    50%      { transform: translateY(-3px); }
  }

  /*
   * IMPORTANT / KNOWN FRAGILITY:
   * This selector reaches into recharts' internal rendering output.
   * ".recharts-area-curve" is the class recharts puts on the stroke
   * <path> of an <Area> — but that class name is NOT part of recharts'
   * public API and can change between major versions. If this stops
   * animating after a recharts upgrade, check what class the stroke
   * <path> actually has in DevTools and update this selector, or switch
   * to an attribute selector like path[stroke-dasharray="10 6"], which
   * targets an attribute we set ourselves via the strokeDasharray prop
   * below and doesn't depend on recharts internals.
   */
  .revenue-area .recharts-area-curve {
    stroke-dasharray: 10 6;
    animation: dashflow 1.6s linear infinite;
  }
`;

export default function RevenueChart({ series }: Props) {
  // Reshape the parallel arrays from the API into the [{label, value}, ...]
  // shape recharts expects for its `data` prop.
  const data = series.labels.map((label, i) => ({
    label,
    value: series.values[i] ?? 0, // fall back to 0 if values is shorter than labels
  }));

  // Compact axis labels: 125000 -> "125K" instead of "125,000".
  const formatValue = (value: number) =>
    new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
    }).format(value);

  return (
    <div className="revenue-chart-wrap">
      {/* Injects the <style> block above directly into the DOM so the
          keyframes/selectors are scoped to this component's markup. */}
      <style>{chartStyles}</style>

      {/* This wrapper is what actually bobs up and down (see .float-container
          keyframes above) — separate from the SVG's own internal animations. */}
      <div className="float-container">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart
            data={data}
            margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
          >
            {/* <defs> holds reusable SVG definitions (gradients, filters)
                referenced elsewhere via url(#id). Nothing in <defs> is
                rendered directly — it only exists to be referenced. */}
            <defs>
              {/* Gradient used for the LINE (stroke). Goes top-to-bottom
                  through three colors, and each <stop> additionally cycles
                  through a few more colors on its own 8s loop via SMIL
                  <animate>, giving a slow shifting-hue effect on the line. */}
              <linearGradient id="revenueLine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981">
                  <animate
                    attributeName="stop-color"
                    values="#10b981;#06b6d4;#6366f1;#10b981"
                    dur="8s"
                    repeatCount="indefinite"
                  />
                </stop>
                <stop offset="55%" stopColor="#6366f1">
                  <animate
                    attributeName="stop-color"
                    values="#6366f1;#8b5cf6;#06b6d4;#6366f1"
                    dur="8s"
                    repeatCount="indefinite"
                  />
                </stop>
                <stop offset="100%" stopColor="#4f46e5">
                  <animate
                    attributeName="stop-color"
                    values="#4f46e5;#4338ca;#4f46e5"
                    dur="8s"
                    repeatCount="indefinite"
                  />
                </stop>
              </linearGradient>

              {/* Gradient used for the FILL (area under the line).
                  Fades from a tinted top (35% opacity) to nearly
                  transparent at the bottom, with the same color-cycling
                  on the top stop as the line gradient above. */}
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35}>
                  <animate
                    attributeName="stop-color"
                    values="#10b981;#06b6d4;#6366f1;#10b981"
                    dur="8s"
                    repeatCount="indefinite"
                  />
                </stop>
                <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
              </linearGradient>

              {/*
               * SHIMMER gradient: a narrow, semi-transparent white band
               * (transparent -> 35% white -> transparent) whose horizontal
               * position (x1/x2) is animated from off-screen-left to
               * off-screen-right on a 3.5s loop. This is what creates the
               * actual "traveling light" look — the color-cycling above
               * only pulses colors in place, it doesn't move spatially.
               * This gradient is applied to a *second*, invisible-outline
               * Area below that reuses the same data shape, so the
               * shimmer band is automatically clipped to the exact area
               * silhouette.
               */}
              <linearGradient
                id="revenueShimmer"
                x1="-40%"
                y1="0"
                x2="0%"
                y2="0"
              >
                <animate
                  attributeName="x1"
                  values="-40%;140%"
                  dur="3.5s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="x2"
                  values="0%;180%"
                  dur="3.5s"
                  repeatCount="indefinite"
                />
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="50%" stopColor="#ffffff" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>

              {/* Soft glow filter applied to the main line: blurs a copy
                  of the shape and merges it under the original ("blur"
                  then "SourceGraphic" on top), giving a halo effect. */}
              <filter
                id="waveGlow"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Faint horizontal-only gridlines behind the chart. */}
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#eef0f2"
              vertical={false}
            />

            {/* X axis: one tick per label (e.g. "P1", "P2", ...). */}
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={false}
            />

            {/* Y axis: compact-formatted revenue values, no axis line
                or tick marks — just the numbers, for a cleaner look. */}
            <YAxis
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatValue}
              width={48}
            />

            {/* Hover tooltip: shows the full (non-compact) number,
                labeled "Revenue". */}
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

            {/*
             * BASE AREA — the actual chart shape people read the data from.
             * - stroke: the animated line gradient
             * - fill: the animated fill gradient
             * - filter: the glow effect
             * - className "revenue-area": scopes the dash-flow CSS
             *   animation to just this element's stroke path (see the
             *   fragility note in chartStyles above)
             * - isAnimationActive={false}: disables recharts' own
             *   built-in "draw the line in on mount/update" animation,
             *   so it doesn't fight with or restart our CSS/SMIL loops
             *   whenever `data` changes.
             */}
            <Area
              className="revenue-area"
              type="monotone"
              dataKey="value"
              stroke="url(#revenueLine)"
              strokeWidth={3}
              fill="url(#revenueFill)"
              filter="url(#waveGlow)"
              dot={{ r: 3.5, fill: "#6366f1", strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />

            {/*
             * SHIMMER OVERLAY — a second Area using the SAME data, so it
             * traces an identical shape to the base Area above, stacked
             * directly on top of it.
             * - stroke="none": no visible line for this one, only fill
             * - fill: the traveling shimmer gradient
             * - legendType/tooltipType "none" + activeDot={false}: this
             *   layer is purely visual, so it's excluded from the legend,
             *   tooltip, and hover-dot behavior (otherwise you'd get a
             *   duplicate/conflicting tooltip entry for the same series).
             */}
            <Area
              type="monotone"
              dataKey="value"
              stroke="none"
              fill="url(#revenueShimmer)"
              isAnimationActive={false}
              legendType="none"
              tooltipType="none"
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
