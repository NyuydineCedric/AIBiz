import { useEffect, useRef } from 'react'
import type { Series } from '../lib/api'

declare const Chart: any

export default function RevenueChart({ series }: { series: Series }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)

  useEffect(() => {
    if (!canvasRef.current || typeof Chart === 'undefined') return
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Revenue',
            data: series.values,
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79,70,229,0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: (v: number) => '$' + (Number(v) / 1000).toFixed(0) + 'k' } } },
      },
    })
    return () => chartRef.current?.destroy()
  }, [series])

  return (
    <div className="h-64">
      <canvas ref={canvasRef} />
    </div>
  )
}
