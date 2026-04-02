import type { SummaryMetric } from '../../utils/flightAdapters'

export type MetricCardProps = {
  metric: SummaryMetric
}

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className="rounded-lg border border-slate-900 bg-[#0b1018] p-3.5">
      <p className="text-xs font-medium text-slate-500">
        {metric.label}
      </p>
      <p className="mt-2 text-xl font-semibold tracking-tight text-slate-100">
        {metric.value}
      </p>
      <p className="mt-1.5 text-xs text-slate-400">
        {metric.hint}
      </p>
    </article>
  )
}
