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
    <main className="min-h-screen bg-transparent text-[var(--color-text-primary)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] flex-col justify-center px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <section className="relative overflow-hidden border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.01))] shadow-[var(--page-shadow)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(207,127,69,0.85),transparent)]" />
          <div className="pointer-events-none absolute right-[-6rem] top-[-6rem] h-72 w-72 rounded-full bg-[rgba(207,127,69,0.1)] blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-4rem] left-[8%] h-44 w-44 rounded-full bg-[rgba(117,84,54,0.12)] blur-3xl" />
          <div className="pointer-events-none absolute inset-y-0 left-[54%] hidden w-px bg-[linear-gradient(180deg,transparent,rgba(241,227,201,0.08),transparent)] xl:block" />

          <div className="relative grid min-h-[640px] items-stretch xl:grid-cols-[minmax(0,1.05fr)_minmax(520px,0.95fr)]">
            <div className="flex flex-col justify-center px-5 py-8 sm:px-8 sm:py-10 xl:px-12 xl:py-12">
              <div className="space-y-8">
                <div className="space-y-4">
                  <p className="font-mono text-[0.72rem] uppercase tracking-[0.28em] text-[var(--color-accent)]">
                    TraceAir
                  </p>
                  <h1 className="max-w-[640px] font-[var(--font-display)] text-[2.9rem] font-semibold leading-[0.88] tracking-[0.015em] text-[var(--color-text-primary)] sm:text-[4.7rem]">
                    Flight logs,
                    <br />
                    turned into
                    <br />
                    mission review.
                  </h1>
                  <p className="max-w-[560px] text-[1rem] leading-8 text-[var(--color-text-secondary)]">
                    Upload a .bin or .tlog file and get a clean post-flight workspace with playback, telemetry, AI analysis, and exportable reporting.
                  </p>
                </div>

                <div className="grid max-w-[620px] gap-px border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-3">
                  <div className="bg-[rgba(255,255,255,0.02)] px-4 py-4">
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
                      Replay
                    </p>
                    <p className="mt-3 text-[0.84rem] leading-6 text-[var(--color-text-secondary)]">
                      Flight path, stages, event sequence
                    </p>
                  </div>
                  <div className="bg-[rgba(255,255,255,0.02)] px-4 py-4">
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
                      Data
                    </p>
                    <p className="mt-3 text-[0.84rem] leading-6 text-[var(--color-text-secondary)]">
                      Speed, altitude, route geometry
                    </p>
                  </div>
                  <div className="bg-[rgba(255,255,255,0.02)] px-4 py-4">
                    <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">
                      Findings
                    </p>
                    <p className="mt-3 text-[0.84rem] leading-6 text-[var(--color-text-secondary)]">
                      Generated analysis and export
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center px-5 pb-5 sm:px-8 sm:pb-8 xl:px-12 xl:py-12">
              <label className="group relative flex w-full cursor-pointer overflow-hidden border border-[rgba(207,127,69,0.18)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] transition hover:border-[rgba(207,127,69,0.42)] hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]">
                <input
                  type="file"
                  accept=".bin,.BIN,.tlog,.TLOG"
                  className="sr-only"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(207,127,69,0.72),transparent)] opacity-70" />
                <div className="pointer-events-none absolute right-[-4rem] top-[-4rem] h-44 w-44 rounded-full bg-[rgba(207,127,69,0.08)] blur-3xl transition group-hover:bg-[rgba(207,127,69,0.14)]" />
                <div className="flex min-h-[460px] w-full flex-col justify-between p-6 sm:p-8 lg:p-10">
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-mono text-[0.7rem] uppercase tracking-[0.24em] text-[var(--color-accent)]">
                        Upload
                      </p>
                      <div className="flex h-12 w-12 items-center justify-center border border-[var(--color-border)] bg-[rgba(207,127,69,0.08)] text-[var(--color-accent)]">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 16V7" />
                          <path d="m8.5 10.5 3.5-3.5 3.5 3.5" />
                          <path d="M4 17.5h16" />
                        </svg>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h2 className="max-w-[460px] font-[var(--font-display)] text-[2rem] font-semibold leading-[0.95] tracking-[-0.05em] text-[var(--color-text-primary)] sm:text-[2.9rem]">
                        {uploading
                          ? 'Processing your mission log.'
                          : 'Drop in a .bin or .tlog file to generate a mission page.'}
                      </h2>
                      <p className="max-w-[470px] text-[0.95rem] leading-8 text-[var(--color-text-secondary)]">
                        Upload once and move straight into review.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-px border border-[var(--color-border)] bg-[var(--color-border)]">
                    <div className="grid gap-4 bg-[rgba(9,11,14,0.58)] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <div>
                        <p className="text-[0.9rem] leading-7 text-[var(--color-text-primary)]">
                          .bin or .tlog telemetry log
                        </p>
                      </div>
                      <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-[var(--color-accent)]">
                        `/api/upload`
                      </p>
                    </div>
                  </div>
                </div>
              </label>
            </div>
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
