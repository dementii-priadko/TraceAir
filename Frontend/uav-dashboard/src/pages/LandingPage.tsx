import { useEffect, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useSmoothProgress } from '../hooks/useSmoothProgress'
import { getUploadStatus, uploadFlight } from '../services/flightService'
import { storeFlightLabel } from '../utils/flightLabels'

export type LandingPageProps = {
  onOpenFlight: (flightId: string) => void
  initialError?: string | null
}

export function LandingPage({
  onOpenFlight,
  initialError = null,
}: LandingPageProps) {
  const [uploading, setUploading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(initialError)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingStage, setProcessingStage] = useState('')
  const displayProcessingProgress = useSmoothProgress(processingProgress, uploading)

  useEffect(() => {
    setSubmitError(initialError)
  }, [initialError])

  useEffect(() => {
    function preventBrowserDrop(event: globalThis.DragEvent) {
      event.preventDefault()
    }

    window.addEventListener('dragover', preventBrowserDrop)
    window.addEventListener('drop', preventBrowserDrop)

    return () => {
      window.removeEventListener('dragover', preventBrowserDrop)
      window.removeEventListener('drop', preventBrowserDrop)
    }
  }, [])

  async function handleUpload(file: File) {
    if (!file) {
      return
    }

    setUploading(true)
    setIsDragActive(false)
    setSubmitError(null)
    setUploadProgress(0)
    setProcessingProgress(0)
    setProcessingStage('Uploading flight log')

    try {
      const response = await uploadFlight(file, setUploadProgress)
      setProcessingStage('Upload complete, starting parser')
      setProcessingProgress(10)

      let attempts = 0
      while (attempts < 600) {
        const status = await getUploadStatus(response.job_id)
        setProcessingStage(status.stage)
        setProcessingProgress(status.progress)

        if (status.status === 'completed' && status.flight_id) {
          setProcessingProgress(100)
          storeFlightLabel(status.flight_id, file.name)
          onOpenFlight(status.flight_id)
          return
        }

        if (status.status === 'failed') {
          throw new Error(status.error || 'Flight processing failed')
        }

        await new Promise((resolve) => window.setTimeout(resolve, 700))
        attempts += 1
      }

      throw new Error('Flight processing timed out')
    } catch (uploadRequestError) {
      setSubmitError(
        uploadRequestError instanceof Error
          ? uploadRequestError.message
          : 'Upload request failed',
      )
    } finally {
      setUploading(false)
      setUploadProgress(0)
      setProcessingProgress(0)
      setProcessingStage('')
    }
  }

  async function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    await handleUpload(file)
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    if (!uploading) {
      setIsDragActive(true)
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (!uploading) {
      setIsDragActive(true)
    }
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault()

    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    setIsDragActive(false)
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragActive(false)

    if (uploading) {
      return
    }

    const file = event.dataTransfer.files?.[0]
    if (!file) {
      return
    }

    await handleUpload(file)
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

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1180px] flex-col justify-center px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-5 flex items-center gap-3 sm:mb-8">
          <div className="flex h-10 w-10 items-center justify-center border border-[rgba(207,127,69,0.35)] bg-[rgba(207,127,69,0.1)] font-mono text-[0.82rem] font-semibold text-[var(--color-accent)] sm:h-11 sm:w-11 sm:text-[0.9rem]">
            TA
          </div>
          <div>
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--color-accent)]">
              TraceAir
            </div>
            <div className="mt-1 font-mono text-[1.35rem] leading-none text-[var(--color-text-primary)] sm:text-[2rem]">
              Flight Upload
            </div>
          </div>
        </div>

        <section className="border border-[rgba(207,127,69,0.34)] bg-[rgba(10,12,15,0.92)] shadow-[0_22px_80px_rgba(0,0,0,0.34)]">
          <div className="pointer-events-none h-px bg-[linear-gradient(90deg,transparent,rgba(207,127,69,0.82),transparent)]" />

          <div className="px-4 py-4 sm:px-7 sm:py-6">
            <h1 className="font-mono text-[1.55rem] font-semibold tracking-[-0.03em] text-[var(--color-accent)] sm:text-[2.5rem]">
              What is this?
            </h1>
            <p className="mt-3 max-w-[900px] text-[0.92rem] leading-7 text-[var(--color-text-secondary)] sm:mt-4 sm:text-[0.98rem] sm:leading-8">
              TraceAir loads binary and telemetry flight logs into a single review workspace. The mission page combines 3D playback, stage timeline, route map, telemetry charts, and AI analysis export.
            </p>
            <p className="mt-2 font-mono text-[0.8rem] text-[var(--color-text-muted)]">
              Supported formats: `.bin`, `.tlog`
            </p>
          </div>

          <div className="px-4 pb-4 sm:px-7 sm:pb-7">
            <label
              className={`group block cursor-pointer border bg-[rgba(10,12,15,0.96)] transition ${
                isDragActive
                  ? 'border-[rgba(231,183,140,0.88)] shadow-[0_0_0_1px_rgba(231,183,140,0.42)_inset]'
                  : 'border-[rgba(207,127,69,0.34)] hover:border-[rgba(207,127,69,0.52)]'
              }`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".bin,.BIN,.tlog,.TLOG"
                className="sr-only"
                onChange={handleFileInputChange}
                disabled={uploading}
              />

              <div className="px-4 py-6 text-center sm:px-7 sm:py-9">
                <p className="font-mono text-[0.78rem] leading-6 text-[var(--color-accent)] sm:text-[0.9rem]">
                  {uploading
                    ? 'Processing mission log...'
                    : isDragActive
                      ? 'Release to upload flight log'
                      : 'Drop a flight log here or click to select'}
                </p>

                <div className="mt-5 inline-flex h-11 items-center justify-center border border-[rgba(207,127,69,0.35)] bg-[rgba(207,127,69,0.12)] px-5 font-mono text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-primary)] sm:mt-6 sm:text-[0.82rem] sm:tracking-[0.14em]">
                  {uploading ? 'Uploading' : 'Choose File'}
                </div>
              </div>
            </label>

            {uploading ? (
              <div className="mt-4 space-y-3 border border-[rgba(207,127,69,0.22)] bg-[rgba(255,255,255,0.02)] px-4 py-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                    <span>Upload</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                    <div
                      className="h-full bg-[linear-gradient(90deg,rgba(207,127,69,0.82),rgba(231,183,140,0.92))] transition-[width] duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                    <span>{processingStage || 'Processing flight log'}</span>
                    <span>{displayProcessingProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                    <div
                      className="h-full bg-[linear-gradient(90deg,rgba(117,84,54,0.86),rgba(207,127,69,0.96))] transition-[width] duration-500"
                      style={{ width: `${displayProcessingProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
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
