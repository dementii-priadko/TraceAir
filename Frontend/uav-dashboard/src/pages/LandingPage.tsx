import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { uploadFlight } from '../services/flightService'

export type LandingPageProps = {
  onOpenFlight: (flightId: string) => void
}

export function LandingPage({
  onOpenFlight,
}: LandingPageProps) {
  const [uploading, setUploading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setUploading(true)
    setSubmitError(null)

    try {
      const response = await uploadFlight(file)
      onOpenFlight(response.id)
    } catch (uploadRequestError) {
      setSubmitError(
        uploadRequestError instanceof Error
          ? uploadRequestError.message
          : 'Upload request failed',
      )
    } finally {
      event.target.value = ''
      setUploading(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-transparent text-[var(--color-text-primary)]">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(207,127,69,0.09),transparent_22%),radial-gradient(circle_at_78%_74%,rgba(117,84,54,0.16),transparent_24%)]" />
        <div
          className="absolute inset-[4%] bg-center bg-no-repeat opacity-38"
          style={{
            backgroundImage: 'url("/world-map-backdrop.png")',
            backgroundSize: 'min(1700px, 118vw) auto',
            filter: 'sepia(1) hue-rotate(-18deg) saturate(0.9) brightness(0.52) contrast(1.08)',
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(207,127,69,0.08),transparent_46%),linear-gradient(180deg,rgba(10,12,15,0.16),rgba(10,12,15,0.34))]" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1180px] flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3 sm:mb-8">
          <div className="flex h-11 w-11 items-center justify-center border border-[rgba(207,127,69,0.35)] bg-[rgba(207,127,69,0.1)] font-mono text-[0.9rem] font-semibold text-[var(--color-accent)]">
            TA
          </div>
          <div>
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--color-accent)]">
              TraceAir
            </div>
            <div className="mt-1 font-mono text-[1.6rem] leading-none text-[var(--color-text-primary)] sm:text-[2rem]">
              Flight Upload
            </div>
          </div>
        </div>

        <section className="border border-[rgba(207,127,69,0.34)] bg-[rgba(10,12,15,0.92)] shadow-[0_22px_80px_rgba(0,0,0,0.34)]">
          <div className="pointer-events-none h-px bg-[linear-gradient(90deg,transparent,rgba(207,127,69,0.82),transparent)]" />

          <div className="px-5 py-5 sm:px-7 sm:py-6">
            <h1 className="font-mono text-[1.9rem] font-semibold tracking-[-0.03em] text-[var(--color-accent)] sm:text-[2.5rem]">
              What is this?
            </h1>
            <p className="mt-4 max-w-[900px] text-[0.98rem] leading-8 text-[var(--color-text-secondary)]">
              TraceAir loads binary and telemetry flight logs into a single review workspace. The mission page combines 3D playback, stage timeline, route map, telemetry charts, and AI analysis export.
            </p>
            <p className="mt-2 font-mono text-[0.8rem] text-[var(--color-text-muted)]">
              Supported formats: `.bin`, `.tlog`
            </p>
          </div>

          <div className="px-5 pb-5 sm:px-7 sm:pb-7">
            <label className="group block cursor-pointer border border-[rgba(207,127,69,0.34)] bg-[rgba(10,12,15,0.96)] transition hover:border-[rgba(207,127,69,0.52)]">
              <input
                type="file"
                accept=".bin,.BIN,.tlog,.TLOG"
                className="sr-only"
                onChange={handleUpload}
                disabled={uploading}
              />

              <div className="px-5 py-7 text-center sm:px-7 sm:py-9">
                <p className="font-mono text-[0.9rem] text-[var(--color-accent)]">
                  {uploading
                    ? 'Processing mission log...'
                    : 'Drop a flight log here or click to select'}
                </p>

                <div className="mt-6 inline-flex h-11 items-center justify-center border border-[rgba(207,127,69,0.35)] bg-[rgba(207,127,69,0.12)] px-5 font-mono text-[0.82rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-primary)]">
                  {uploading ? 'Uploading' : 'Choose File'}
                </div>
              </div>
            </label>

          </div>
        </section>

        {submitError ? (
          <p className="mt-4 border border-rose-500/20 bg-rose-500/8 px-4 py-3 text-[0.84rem] text-rose-200">
            {submitError}
          </p>
        ) : null}
      </div>
    </main>
  )
}
