import { ShieldCheck, ShieldAlert, TrendingUp, TrendingDown, HelpCircle, type LucideIcon } from 'lucide-react'
import type { Kpi, Insight } from '../lib/api'

function parseValue(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function findKpi(kpis: Kpi[], keywords: RegExp): Kpi | undefined {
  return kpis.find((k) => keywords.test(k.label.toLowerCase()))
}

type StatusCardProps = {
  icon: LucideIcon
  iconClass: string
  label: string
  value: string
  detail: string
}

function StatusCard({ icon: Icon, iconClass, label, value, detail }: StatusCardProps) {
  return (
    <div className="bg-white border border-ink-200 rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        <p className="text-base font-bold text-ink-900 truncate">{value}</p>
        <p className="text-xs text-ink-500 mt-0.5">{detail}</p>
      </div>
    </div>
  )
}

export default function BusinessHealth({ kpis, risks }: { kpis: Kpi[]; risks: Insight[] }) {
  // ---- Risk status ----
  const highCount = risks.filter((r) => r.severity === 'High').length
  const mediumCount = risks.filter((r) => r.severity === 'Medium').length

  const riskCard =
    risks.length === 0
      ? {
          icon: ShieldCheck,
          iconClass: 'bg-teal-50 text-teal-600',
          value: 'No risks detected',
          detail: 'This dataset looks healthy',
        }
      : {
          icon: ShieldAlert,
          iconClass: highCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600',
          value: `${risks.length} risk${risks.length === 1 ? '' : 's'} detected`,
          detail: [highCount && `${highCount} high`, mediumCount && `${mediumCount} medium`].filter(Boolean).join(' · '),
        }

  // ---- Profit / loss ----
  const revenueKpi = findKpi(kpis, /revenue|sales|income/)
  const costKpi = findKpi(kpis, /cost|expense|spend/)

  let profitCard: StatusCardProps | null = null
  if (revenueKpi && costKpi) {
    const profit = parseValue(revenueKpi.value) - parseValue(costKpi.value)
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Math.abs(profit))

    profitCard = {
      icon: profit >= 0 ? TrendingUp : TrendingDown,
      iconClass: profit >= 0 ? 'bg-teal-50 text-teal-600' : 'bg-rose-50 text-rose-600',
      label: profit >= 0 ? 'Profit' : 'Loss',
      value: formatted,
      detail: `${revenueKpi.label} minus ${costKpi.label}`,
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
      <StatusCard icon={riskCard.icon} iconClass={riskCard.iconClass} label="Risk status" value={riskCard.value} detail={riskCard.detail} />
      {profitCard ? (
        <StatusCard {...profitCard} />
      ) : (
        <StatusCard
          icon={HelpCircle}
          iconClass="bg-ink-100 text-ink-500"
          label="Profit / loss"
          value="Not available"
          detail="No matching revenue and cost columns found"
        />
      )}
    </div>
  )
}
