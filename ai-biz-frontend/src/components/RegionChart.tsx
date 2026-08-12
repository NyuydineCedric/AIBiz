import { useEffect, useRef } from 'react'
import type { Series } from '../lib/api'

declare const Chart: any

const PALETTE = ['#4f46e5', '#818cf8', '#c7d2fe', '#e0e7ff', '#a5b4fc', '#3730a3']

export default function RegionChart({ series }: { series: Series }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)

  useEffect(() => {
    if (!canvasRef.current || typeof Chart === 'undefined') return
    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: series.labels,
        datasets: [
          {
            data: series.values,
            backgroundColor: PALETTE,
          },
        ],
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
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
