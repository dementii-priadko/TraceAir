import type { FlightLog } from '../types/flight'
import * as XLSX from 'xlsx'

function sanitizeFilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function buildTrajectoryRows(flight: FlightLog) {
  return flight.trajectory.gps.map((point) => ({
    time_s: point.time_s,
    lat: point.lat,
    lng: point.lng,
    alt_msl: point.alt_msl,
    enu_e: point.enu.e,
    enu_n: point.enu.n,
    enu_u: point.enu.u,
    h_speed: point.h_speed,
    v_speed: point.v_speed,
    seg_dist: point.seg_dist,
    n_sats: point.n_sats,
  }))
}

function escapeCsvCell(value: string | number): string {
  const stringValue = String(value)

  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
}

export function exportFlightRawJson(
  flight: FlightLog,
  flightId: string,
  firmwareLabel: string,
): void {
  const filename = `${sanitizeFilePart(firmwareLabel) || 'flight'}-${sanitizeFilePart(flightId)}.json`

  downloadTextFile(
    filename,
    `${JSON.stringify(flight, null, 2)}\n`,
    'application/json;charset=utf-8',
  )
}

export function exportFlightTrajectoryCsv(
  flight: FlightLog,
  flightId: string,
  firmwareLabel: string,
): void {
  const rows = buildTrajectoryRows(flight)
  const headers = Object.keys(rows[0] ?? {
    time_s: '',
    lat: '',
    lng: '',
    alt_msl: '',
    enu_e: '',
    enu_n: '',
    enu_u: '',
    h_speed: '',
    v_speed: '',
    seg_dist: '',
    n_sats: '',
  })

  const csv = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((header) => escapeCsvCell(row[header as keyof typeof row])).join(','),
    ),
  ].join('\n')

  const filename = `${sanitizeFilePart(firmwareLabel) || 'flight'}-${sanitizeFilePart(flightId)}-trajectory.csv`

  downloadTextFile(filename, `${csv}\n`, 'text/csv;charset=utf-8')
}

export function exportFlightTrajectoryXlsx(
  flight: FlightLog,
  flightId: string,
  firmwareLabel: string,
): void {
  const rows = buildTrajectoryRows(flight)
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, worksheet, 'trajectory')

  const filename = `${sanitizeFilePart(firmwareLabel) || 'flight'}-${sanitizeFilePart(flightId)}-trajectory.xlsx`
  XLSX.writeFile(workbook, filename)
}
