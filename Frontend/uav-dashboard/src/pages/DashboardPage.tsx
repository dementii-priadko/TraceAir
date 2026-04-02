import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AnalysisPanel } from '../components/ai/AnalysisPanel'
import { AltitudeChart } from '../components/charts/AltitudeChart'
import { SpeedChart } from '../components/charts/SpeedChart'
import { WorldMapCard } from '../components/common/WorldMapCard'
import { TimelinePanel } from '../components/events/TimelinePanel'
import { SummaryCards } from '../components/summary/SummaryCards'
import { Viewer } from '../components/viewer/Viewer'
import type { ViewerHandle } from '../components/viewer/Viewer'
import { useSmoothProgress } from '../hooks/useSmoothProgress'
import { getFlight, getFlightAnalysis, getUploadStatus, uploadFlight } from '../services/flightService'
import type { FlightAnalysis, FlightLog } from '../types/flight'
import {
  adaptAltitudeChartData,
  adaptSpeedChartData,
  adaptSummaryMetrics,
  adaptTimelineItems,
  adaptViewerFrames,
  adaptWorldMapPoints,
} from '../utils/flightAdapters'
import {
  exportFlightRawJson,
  exportFlightTrajectoryCsv,
  exportFlightTrajectoryXlsx,
} from '../utils/export'
import { readStoredFlightLabels, storeFlightLabel } from '../utils/flightLabels'

export function DashboardPage() {
  const [flight, setFlight] = useState<FlightLog | null>(null)
  const [analysis, setAnalysis] = useState<FlightAnalysis | null>(null)
  const [selectedFileLabel, setSelectedFileLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingStage, setProcessingStage] = useState('')
  const displayProcessingProgress = useSmoothProgress(processingProgress, uploading)
  const [exportOpen, setExportOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const viewerRef = useRef<ViewerHandle | null>(null)
  const currentFlightId =
    new URLSearchParams(window.location.search).get('flightId')?.trim() || ''

  useEffect(() => {
    const abortController = new AbortController()

    async function loadDashboardData() {
      setLoading(true)
      setError(null)

      try {
        const [apiFlight, apiAnalysis] = await Promise.all([
          getFlight(currentFlightId),
          getFlightAnalysis(currentFlightId),
        ])

        if (abortController.signal.aborted) {
          return
        }

        setFlight(apiFlight)
        setAnalysis(apiAnalysis)
      } catch (requestError) {
        if (abortController.signal.aborted) {
          return
        }

        const requestMessage =
          requestError instanceof Error
            ? requestError.message
            : 'Backend request failed'

        if (currentFlightId && /(?:^|\b)(404|not found)(?:\b|$)/i.test(requestMessage)) {
          const url = new URL(window.location.href)
          url.searchParams.delete('flightId')
          url.searchParams.delete('flightid')
          url.searchParams.set('error', 'file-not-found')
          window.history.replaceState({}, '', url)
          window.dispatchEvent(new PopStateEvent('popstate'))
          return
        }

        setFlight(null)
        setAnalysis(null)
        setError(requestMessage)
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadDashboardData()

    return () => {
      abortController.abort()
    }
  }, [currentFlightId])

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setUploading(true)
    setUploadError(null)
    setUploadProgress(0)
    setProcessingProgress(0)
    setProcessingStage('Uploading flight log')

    try {
      setSelectedFileLabel(file.name)
      const response = await uploadFlight(file, setUploadProgress)

      let attempts = 0
      while (attempts < 600) {
        const status = await getUploadStatus(response.job_id)
        setProcessingStage(status.stage)
        setProcessingProgress(status.progress)

        if (status.status === 'completed' && status.flight_id) {
          const nextFlightId = status.flight_id
          setProcessingProgress(100)
          storeFlightLabel(nextFlightId, file.name)
          const url = new URL(window.location.href)
          url.searchParams.set('flightId', nextFlightId)
          window.history.replaceState({}, '', url)
          window.dispatchEvent(new PopStateEvent('popstate'))
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
      setUploadError(
        uploadRequestError instanceof Error
          ? uploadRequestError.message
          : 'Upload request failed',
      )
    } finally {
      event.target.value = ''
      setUploading(false)
      setUploadProgress(0)
      setProcessingProgress(0)
      setProcessingStage('')
    }
  }

  function handleExport(format: 'csv' | 'xlsx' | 'raw') {
    if (!flight) {
      return
    }

    if (format === 'csv') {
      exportFlightTrajectoryCsv(flight, currentFlightId, firmwareLabel)
      setExportOpen(false)
      return
    }

    if (format === 'xlsx') {
      exportFlightTrajectoryXlsx(flight, currentFlightId, firmwareLabel)
      setExportOpen(false)
      return
    }

    exportFlightRawJson(flight, currentFlightId, firmwareLabel)
    setExportOpen(false)
  }

  function handleTimelineSelect(time_s: number) {
    viewerRef.current?.seekTo(time_s)
  }

  function handleNavigateHome() {
    const url = new URL(window.location.href)
    url.searchParams.delete('flightId')
    url.searchParams.delete('flightid')
    url.searchParams.delete('error')
    window.history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const summaryMetrics = flight ? adaptSummaryMetrics(flight) : []
  const altitudeChartData = flight ? adaptAltitudeChartData(flight) : []
  const speedChartData = flight ? adaptSpeedChartData(flight) : []
  const timelineItems = flight ? adaptTimelineItems(flight) : []
  const viewerFrames = flight ? adaptViewerFrames(flight) : []
  const worldMapPoints = flight ? adaptWorldMapPoints(flight) : null
  const firmwareLabel = flight
    ? flight.meta.firmware.replace(/\s*\([^)]*\)\s*$/, '')
    : 'Unavailable'
  const storedFlightLabel = currentFlightId
    ? readStoredFlightLabels()[currentFlightId] ?? ''
    : ''
  const activeFlightLabel =
    selectedFileLabel || storedFlightLabel || 'Uploaded flight log'

  return (
    <main className="min-h-screen overflow-x-hidden bg-transparent text-[var(--color-text-primary)]">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-8">
        <header className="relative overflow-hidden border border-[var(--color-border)] bg-[var(--hero-gradient)] px-4 py-4 shadow-[var(--page-shadow)] sm:overflow-visible sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(207,127,69,0.85),transparent)]" />
          <div className="pointer-events-none absolute right-[-8rem] top-[-8rem] h-64 w-64 rounded-full bg-[rgba(207,127,69,0.08)] blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-6rem] left-[12%] h-40 w-40 rounded-full bg-[rgba(117,84,54,0.1)] blur-3xl" />
          <button
            type="button"
            onClick={handleNavigateHome}
            className="relative mb-5 inline-flex items-center gap-3 border border-[rgba(207,127,69,0.32)] bg-[rgba(10,12,15,0.28)] px-3 py-2 text-left transition hover:border-[rgba(207,127,69,0.54)] hover:bg-[rgba(10,12,15,0.38)]"
          >
            <span className="flex h-9 w-9 items-center justify-center border border-[rgba(207,127,69,0.35)] bg-[rgba(207,127,69,0.1)] font-mono text-[0.82rem] font-semibold text-[var(--color-accent)]">
              TA
            </span>
            <span>
              <span className="block font-mono text-[0.68rem] uppercase tracking-[0.24em] text-[var(--color-accent)]">
                TraceAir
              </span>
              <span className="mt-1 block text-[0.74rem] text-[var(--color-text-secondary)]">
                Main page
              </span>
            </span>
          </button>
          <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_auto] xl:items-end">
            <div className="space-y-4">
              <div className="space-y-3">
                <h1 className="max-w-4xl font-[var(--font-display)] text-[1.55rem] font-semibold leading-[0.98] tracking-[-0.035em] text-[var(--color-text-primary)] sm:text-[2.7rem]">
                  TraceAir mission playback for post-flight analysis.
                </h1>
                <p className="max-w-2xl text-[0.88rem] leading-relaxed text-[var(--color-text-secondary)] sm:text-[1rem]">
                  Review the vehicle path, stage changes, route geometry, and backend analysis in one compact surface built around the selected flight.
                </p>
              </div>
              <div className="grid gap-px border border-[var(--color-border)] bg-[var(--color-border)] text-[0.78rem] text-[var(--color-text-secondary)] sm:max-w-xs">
                <div className="bg-[rgba(255,255,255,0.02)] px-3 py-2">
                  File
                  <div className="mt-1 truncate text-[var(--color-text-primary)]">{activeFlightLabel}</div>
                </div>
                <div className="bg-[rgba(255,255,255,0.02)] px-3 py-2">
                  Firmware
                  <div className="mt-1 text-[var(--color-text-primary)]">{firmwareLabel}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
              <div className="relative w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setExportOpen((value) => !value)}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[var(--color-border)] bg-[var(--control-bg)] px-4 text-[0.78rem] font-medium text-[var(--color-text-secondary)] transition hover:border-[rgba(207,127,69,0.45)] hover:text-[var(--color-text-primary)] sm:w-auto sm:text-[0.8rem]"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8m0 0L5 7m3 3 3-3M3 12h10" />
                  </svg>
                  Export
                </button>
                {exportOpen ? (
                  <div className="absolute left-0 top-full z-20 mt-2 min-w-36 overflow-hidden border border-[var(--color-border)] bg-[rgba(10,12,15,0.98)] shadow-xl shadow-black/30 backdrop-blur-xl sm:left-auto sm:right-0">
                    <button
                      type="button"
                      onClick={() => handleExport('csv')}
                      className="block w-full px-4 py-2.5 text-left text-[0.8rem] text-[var(--color-text-secondary)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--color-text-primary)]"
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport('xlsx')}
                      className="block w-full px-4 py-2.5 text-left text-[0.8rem] text-[var(--color-text-secondary)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--color-text-primary)]"
                    >
                      XLSX
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport('raw')}
                      className="block w-full px-4 py-2.5 text-left text-[0.8rem] text-[var(--color-text-secondary)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--color-text-primary)]"
                    >
                      Raw JSON
                    </button>
                  </div>
                ) : null}
              </div>
              <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 border border-[rgba(207,127,69,0.42)] bg-[rgba(207,127,69,0.12)] px-4 text-[0.78rem] font-medium text-[var(--color-text-primary)] transition hover:bg-[rgba(207,127,69,0.18)] sm:w-auto sm:text-[0.8rem]">
                <input
                  type="file"
                  accept=".bin,.BIN,.tlog,.TLOG"
                  className="sr-only"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                {uploading ? 'Uploading…' : 'Upload .bin / .tlog'}
              </label>
            </div>
          </div>
        </header>

        {uploadError ? (
          <p className="border border-rose-500/20 bg-rose-500/8 px-4 py-3 text-[0.84rem] text-rose-200">{uploadError}</p>
        ) : null}

        {uploading ? (
          <section className="border border-[var(--color-border)] bg-[rgba(255,255,255,0.02)] px-4 py-4 sm:px-6">
            <div className="grid gap-3 lg:grid-cols-2">
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
          </section>
        ) : null}

        {error && !flight ? (
          <section className="border border-amber-500/16 bg-amber-500/[0.06] px-5 py-5 text-amber-100/85 sm:px-6">
            <p className="font-medium text-[var(--color-text-primary)]">Flight data could not be loaded.</p>
            <p className="mt-2 text-[0.9rem] leading-relaxed">
              {error}
            </p>
            <p className="mt-2 text-[0.84rem] text-amber-100/75">
              Upload a valid `.bin` or `.tlog` file to open a real mission instead of a placeholder dataset.
            </p>
          </section>
        ) : null}

        {flight ? (
          <>
            <SummaryCards metrics={summaryMetrics} />

            <section className="grid gap-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)] xl:items-stretch">
                <div className="flex h-full min-h-0 flex-col gap-4">
                  <Viewer
                    ref={viewerRef}
                    frames={viewerFrames}
                    stages={flight.stages}
                    events={flight.events}
                  />
                  {worldMapPoints ? (
                    <WorldMapCard
                      points={worldMapPoints}
                      className="flex min-h-0 flex-1 flex-col"
                      contentClassName="flex-1 min-h-0"
                    />
                  ) : null}
                </div>

                <div className="flex flex-col gap-4">
                  <TimelinePanel
                    items={timelineItems}
                    onSelectTime={handleTimelineSelect}
                  />
                  <SpeedChart data={speedChartData} />
                  <AltitudeChart data={altitudeChartData} />
                </div>
              </div>

              <AnalysisPanel
                analysis={analysis}
                loading={loading}
                flightId={currentFlightId}
                firmwareLabel={firmwareLabel}
                fileLabel={activeFlightLabel}
              />
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
