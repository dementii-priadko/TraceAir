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
import { mockAnalysis } from '../data/mockAnalysis'
import flightData from '../data/mockFlight.json'
import { getFlight, getFlightAnalysis, uploadFlight } from '../services/flightService'
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

const mockFlight = flightData as unknown as FlightLog

type DataSource = 'api' | 'mock'

export function DashboardPage() {
  const [flight, setFlight] = useState<FlightLog>(mockFlight)
  const [analysis, setAnalysis] = useState<FlightAnalysis | null>(mockAnalysis)
  const [dataSource, setDataSource] = useState<DataSource>('mock')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
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
        setDataSource('api')
      } catch (requestError) {
        if (abortController.signal.aborted) {
          return
        }

        setFlight(mockFlight)
        setAnalysis(mockAnalysis)
        setDataSource('mock')
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Backend request failed',
        )
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

    try {
      const response = await uploadFlight(file)
      const nextFlightId = response.id
      const url = new URL(window.location.href)
      url.searchParams.set('flightId', nextFlightId)
      window.history.replaceState({}, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    } catch (uploadRequestError) {
      setUploadError(
        uploadRequestError instanceof Error
          ? uploadRequestError.message
          : 'Upload request failed',
      )
    } finally {
      event.target.value = ''
      setUploading(false)
    }
  }

  function handleExport(format: 'csv' | 'xlsx' | 'raw') {
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

  const summaryMetrics = adaptSummaryMetrics(flight)
  const altitudeChartData = adaptAltitudeChartData(flight)
  const speedChartData = adaptSpeedChartData(flight)
  const timelineItems = adaptTimelineItems(flight)
  const viewerFrames = adaptViewerFrames(flight)
  const worldMapPoints = adaptWorldMapPoints(flight)
  const firmwareLabel = flight.meta.firmware.replace(/\s*\([^)]*\)\s*$/, '')

  return (
    <main className="min-h-screen bg-transparent text-[var(--color-text-primary)]">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-8">
        <header className="relative overflow-visible border border-[var(--color-border)] bg-[var(--hero-gradient)] px-5 py-5 shadow-[var(--page-shadow)] sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(207,127,69,0.85),transparent)]" />
          <div className="pointer-events-none absolute right-[-8rem] top-[-8rem] h-64 w-64 rounded-full bg-[rgba(207,127,69,0.08)] blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-6rem] left-[12%] h-40 w-40 rounded-full bg-[rgba(117,84,54,0.1)] blur-3xl" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_auto] xl:items-end">
            <div className="space-y-4">
              <div className="space-y-3">
                <h1 className="max-w-4xl font-[var(--font-display)] text-[2rem] font-semibold leading-[0.98] tracking-[-0.035em] text-[var(--color-text-primary)] sm:text-[2.7rem]">
                  TraceAir mission playback for post-flight analysis.
                </h1>
                <p className="max-w-2xl text-[0.96rem] leading-relaxed text-[var(--color-text-secondary)] sm:text-[1rem]">
                  Review the vehicle path, stage changes, route geometry, and backend analysis in one compact surface built around the selected flight.
                </p>
              </div>
              <div className="grid gap-px border border-[var(--color-border)] bg-[var(--color-border)] text-[0.78rem] text-[var(--color-text-secondary)] sm:max-w-xs">
                <div className="bg-[rgba(255,255,255,0.02)] px-3 py-2">
                  Firmware
                  <div className="mt-1 text-[var(--color-text-primary)]">{firmwareLabel}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen((value) => !value)}
                  className="inline-flex h-10 items-center gap-2 border border-[var(--color-border)] bg-[var(--control-bg)] px-4 text-[0.8rem] font-medium text-[var(--color-text-secondary)] transition hover:border-[rgba(207,127,69,0.45)] hover:text-[var(--color-text-primary)]"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8m0 0L5 7m3 3 3-3M3 12h10" />
                  </svg>
                  Export
                </button>
                {exportOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-2 min-w-36 overflow-hidden border border-[var(--color-border)] bg-[rgba(10,12,15,0.98)] shadow-xl shadow-black/30 backdrop-blur-xl">
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
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 border border-[rgba(207,127,69,0.42)] bg-[rgba(207,127,69,0.12)] px-4 text-[0.8rem] font-medium text-[var(--color-text-primary)] transition hover:bg-[rgba(207,127,69,0.18)]">
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

        {error ? (
          <div className="border border-amber-500/16 bg-amber-500/[0.06] px-4 py-3 text-[0.84rem] text-amber-100/85">
            Using local mock data — {error}
          </div>
        ) : null}

        <SummaryCards metrics={summaryMetrics} />

        <section className="grid gap-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
            <Viewer
              ref={viewerRef}
              frames={viewerFrames}
              stages={flight.stages}
              events={flight.events}
              className="h-full"
            />
            <div className="flex flex-col gap-3">
              <SpeedChart data={speedChartData} />
              <TimelinePanel
                items={timelineItems}
                onSelectTime={handleTimelineSelect}
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
            <WorldMapCard points={worldMapPoints} />
            <AltitudeChart data={altitudeChartData} />
          </div>

          <AnalysisPanel
            analysis={analysis}
            loading={loading}
            source={dataSource}
            flightId={currentFlightId}
            firmwareLabel={firmwareLabel}
          />
        </section>
      </div>
    </main>
  )
}
