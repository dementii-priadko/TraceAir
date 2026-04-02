import type { TimelineItem } from '../../utils/flightAdapters'
import { formatNumber } from '../../utils/format'
import { SectionCard } from '../layout/SectionCard'

export type TimelinePanelProps = {
  items: TimelineItem[]
}

const timelineTypeStyles: Record<TimelineItem['type'], string> = {
  event: 'border border-slate-800 bg-[#0b1019] text-slate-400',
  mode: 'border border-slate-800 bg-[#0b1019] text-slate-400',
  stage: 'border border-slate-800 bg-[#0b1019] text-slate-400',
}

export function TimelinePanel({ items }: TimelinePanelProps) {
  return (
    <SectionCard
      title="Stages & Modes"
      description="Mission stage transitions and mode changes from the parsed log."
      contentClassName="max-h-[28rem] overflow-y-auto"
    >
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border border-slate-900 bg-[#090d17] p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-100">{item.title}</p>
                <p className="mt-1 text-sm text-slate-400">{item.detail}</p>
              </div>
              <span
                className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${timelineTypeStyles[item.type]}`}
              >
                {item.type}
              </span>
            </div>
            <p className="mt-3 font-mono text-xs text-slate-500">
              T+{formatNumber(item.time_s, 1)} s
            </p>
          </article>
        ))}
      </div>
    </SectionCard>
  )
}
