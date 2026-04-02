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
      className={`rounded-lg border border-slate-900 bg-[#0b1018] ${className}`.trim()}
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-900 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-xs text-slate-400">{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className={`px-4 py-4 ${contentClassName}`.trim()}>{children}</div>
    </section>
  )
}
