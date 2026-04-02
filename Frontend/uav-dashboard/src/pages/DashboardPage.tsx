import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AnalysisPanel } from '../components/ai/AnalysisPanel'
import { AltitudeChart } from '../components/charts/AltitudeChart'
import { SpeedChart } from '../components/charts/SpeedChart'
import { WorldMapCard } from '../components/common/WorldMapCard'
import { TimelinePanel } from '../components/events/TimelinePanel'
import { SummaryCards } from '../components/summary/SummaryCards'
import { Viewer } from '../components/viewer/Viewer'
import { mockAnalysis } from '../data/mockAnalysis'
import flightData from '../data/mockFlight.json'
import {
  DEFAULT_FLIGHT_ID,
  getFlight,
  getFlightAnalysis,
  uploadFlight,
} from '../services/flightService'
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
  const initialFlightId =
    new URLSearchParams(window.location.search).get('flightId')?.trim() ||
    DEFAULT_FLIGHT_ID

  const [flight, setFlight] = useState<FlightLog>(mockFlight)
  const [analysis, setAnalysis] = useState<FlightAnalysis | null>(mockAnalysis)
  const [dataSource, setDataSource] = useState<DataSource>('mock')
  const [currentFlightId, setCurrentFlightId] = useState(initialFlightId)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

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
      setCurrentFlightId(nextFlightId)
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

  const summaryMetrics = adaptSummaryMetrics(flight)
  const altitudeChartData = adaptAltitudeChartData(flight)
  const speedChartData = adaptSpeedChartData(flight)
  const timelineItems = adaptTimelineItems(flight)
  const viewerFrames = adaptViewerFrames(flight)
  const worldMapPoints = adaptWorldMapPoints(flight)
  const firmwareLabel = flight.meta.firmware.replace(/\s*\([^)]*\)\s*$/, '')

  return (
    <main className="min-h-screen bg-transparent text-slate-100">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-5 lg:px-6">
        <section className="rounded-lg border border-slate-900 bg-[#0b1018] px-5 py-4">
          <div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center xl:pl-20">
            <div className="flex min-h-[5.75rem] items-center justify-center">
              <div className="flex items-center justify-center">
                <p className="text-[2.7rem] font-semibold tracking-tight text-white sm:text-[3.4rem]">
                  TraceAir
                </p>
              </div>
            </div>

            <div className="min-w-0 max-w-4xl px-20 sm:px-24 xl:px-48">
              <div>
                <h1 className="text-[2rem] leading-[1.05] font-semibold tracking-tight text-white sm:text-[2.2rem] xl:text-[2.35rem]">
                  <span className="block whitespace-nowrap">
                    UAV / rocket mission overview
                  </span>
                  <span className="mt-1 block text-[0.82em] text-slate-300">
                    ({firmwareLabel})
                  </span>
                </h1>
              </div>
            </div>

            <div className="grid min-w-0 gap-3 xl:min-w-[470px] xl:max-w-[520px]">
              <div className="flex min-h-[5.75rem] items-center justify-center gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportOpen((value) => !value)}
                    className="inline-flex min-h-11 min-w-28 items-center justify-center rounded-md border border-slate-800 bg-[#111827] px-4 py-2.5 text-base font-medium text-slate-200 transition hover:bg-slate-800"
                  >
                    Export
                  </button>
                  {exportOpen ? (
                    <div className="absolute right-0 top-full z-20 mt-2 min-w-36 rounded-md border border-slate-800 bg-[#111827] p-1">
                      <button
                        type="button"
                        onClick={() => handleExport('csv')}
                        className="block w-full rounded-sm px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport('xlsx')}
                        className="block w-full rounded-sm px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                      >
                        XLSX
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport('raw')}
                        className="block w-full rounded-sm px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                      >
                        Raw JSON
                      </button>
                    </div>
                  ) : null}
                </div>
                <label className="inline-flex min-h-11 min-w-28 cursor-pointer items-center justify-center rounded-md border border-slate-800 bg-[#111827] px-4 py-2.5 text-base font-medium text-slate-200 transition hover:bg-slate-800">
                  <input
                    type="file"
                    accept=".bin,.BIN"
                    className="sr-only"
                    onChange={handleUpload}
                    disabled={uploading}
                  />
                  {uploading ? 'Uploading...' : 'Upload'}
                </label>
              </div>
              {uploadError ? (
                <p className="text-center text-sm text-rose-300">{uploadError}</p>
              ) : null}
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-lg border border-amber-500/15 bg-[#1a1209] px-4 py-3 text-sm text-amber-100">
            Backend request failed and the page switched to local mock data. {error}
          </section>
        ) : null}

        <SummaryCards metrics={summaryMetrics} />

        <section className="grid gap-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
            <Viewer frames={viewerFrames} stages={flight.stages} events={flight.events} className="h-full" />
            <div className="space-y-4">
              <SpeedChart data={speedChartData} />
              <TimelinePanel items={timelineItems} />
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
          />
        </section>
      </div>
    </main>
  )
}
