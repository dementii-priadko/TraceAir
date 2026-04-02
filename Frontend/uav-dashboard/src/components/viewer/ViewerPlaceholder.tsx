import type { ViewerFrame } from '../../utils/flightAdapters'
import { formatMeters, formatNumber } from '../../utils/format'
import { SectionCard } from '../layout/SectionCard'

export type ViewerPlaceholderProps = {
  frames: ViewerFrame[]
  className?: string
}

export function ViewerPlaceholder({
  frames,
  className = '',
}: ViewerPlaceholderProps) {
  const latestFrame = frames.at(-1)

  return (
    <SectionCard
      title="3D Flight Viewer"
      description="Reserved integration point for the upcoming Three.js trajectory and vehicle attitude view."
      className={className}
    >
      <div className="flex h-full min-h-[42rem] flex-col justify-between rounded-xl border border-dashed border-slate-800 bg-[#070b14] p-5">
        <div>
          <p className="max-w-xl text-sm leading-6 text-slate-300">
            The telemetry dashboard is already preparing simulation frames for a
            future viewer component. Replace this card with a Three.js canvas
            when the vehicle mesh and scene controls are ready.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-900 bg-[#090d17] p-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
              Sim Frames
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {formatNumber(frames.length, 0)}
            </p>
          </div>
          <div className="rounded-lg border border-slate-900 bg-[#090d17] p-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
              Final Altitude
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {latestFrame ? formatMeters(latestFrame.altitude_msl) : '--'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-900 bg-[#090d17] p-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
              Orientation
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              {latestFrame
                ? `${formatNumber(latestFrame.rotation.roll, 0)} / ${formatNumber(latestFrame.rotation.pitch, 0)} / ${formatNumber(latestFrame.rotation.yaw, 0)}`
                : '--'}
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
