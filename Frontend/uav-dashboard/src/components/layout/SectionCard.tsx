import type { PropsWithChildren, ReactNode } from 'react'

export type SectionCardProps = PropsWithChildren<{
  title: string
  description?: string
  actions?: ReactNode
  className?: string
  contentClassName?: string
}>

export function SectionCard({
  title,
  description,
  actions,
  className = '',
  contentClassName = '',
  children,
}: SectionCardProps) {
  return (
    <section
      className={`overflow-hidden border border-[var(--color-border)] bg-[var(--panel-gradient)] shadow-[var(--panel-shadow)] backdrop-blur-sm ${className}`.trim()}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border-subtle)] px-4 py-4 sm:px-6">
        <div className="space-y-1">
          <p className="inline-block border border-[var(--color-border-subtle)] px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--color-accent)]">
            Flight Section
          </p>
          <h2 className="font-[var(--font-display)] text-[0.95rem] font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[1rem]">
            {title}
          </h2>
          {description ? (
            <p className="max-w-2xl text-[0.8rem] text-[var(--color-text-muted)]">{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className={`px-4 py-4 sm:px-6 sm:py-6 ${contentClassName}`.trim()}>{children}</div>
    </section>
  )
}
