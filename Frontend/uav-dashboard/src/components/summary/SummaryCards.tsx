import type { SummaryMetric } from '../../utils/flightAdapters'
import { MetricCard } from './MetricCard'

export type SummaryCardsProps = {
  metrics: SummaryMetric[]
}

export function SummaryCards({ metrics }: SummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} />
      ))}
    </section>
  )
}
