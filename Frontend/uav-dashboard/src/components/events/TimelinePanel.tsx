import type { TimelineItem } from '../../utils/flightAdapters'
import { formatNumber } from '../../utils/format'
import { SectionCard } from '../layout/SectionCard'

export type TimelinePanelProps = {
  items: TimelineItem[]
  onSelectTime: (time_s: number) => void
}

export function TimelinePanel({
  items,
  onSelectTime,
}: TimelinePanelProps) {
  return (
    <SectionCard
      title="Timeline"
      description="Stage transitions, commands, and noteworthy flight events in sequence."
      contentClassName="max-h-[34rem] overflow-y-auto"
    >
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectTime(item.time_s)}
            className="group flex w-full items-start justify-between gap-4 rounded-[1rem] border border-transparent bg-[rgba(255,255,255,0.018)] px-4 py-3 text-left transition hover:border-[var(--color-border)] hover:bg-[rgba(255,255,255,0.032)]"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_4px_rgba(221,141,82,0.12)]" />
                <p className="text-[0.92rem] font-medium tracking-[-0.02em] text-[var(--color-text-primary)]">{item.title}</p>
              </div>
              <p className="mt-2 pl-[1.4rem] text-[0.8rem] leading-relaxed text-[var(--color-text-secondary)]">{item.detail}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span
                className="rounded-full border border-[var(--color-border)] px-2.5 py-1 font-mono text-[0.62rem] font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]"
              >
                {item.type}
              </span>
              <span className="font-mono text-[0.72rem] tabular-nums text-[var(--color-text-muted)]">
                T+{formatNumber(item.time_s, 1)}s
              </span>
            </div>
          </button>
        ))}
      </div>
    </SectionCard>
  )
}
