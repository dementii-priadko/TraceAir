import type { FlightAnalysis, FlightLog } from '../types/flight'

const DEFAULT_API_BASE_URL = ''

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL

export const API_BASE_URL =
  rawApiBaseUrl !== undefined ? rawApiBaseUrl.trim() : DEFAULT_API_BASE_URL

export const DEFAULT_FLIGHT_ID =
  import.meta.env.VITE_DEFAULT_FLIGHT_ID?.trim() ||
  'a2ed9650-0638-4597-8374-995d8e6660a4'

export type UploadFlightResponse = {
  id: string
}

async function getErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as { detail?: string }

    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail
    }
  } else {
    const text = await response.text()

    if (text.trim()) {
      return text
    }
  }

  return fallbackMessage
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, `Request failed: ${response.status}`),
    )
  }

  return (await response.json()) as T
}

export function getFlight(flightId: string): Promise<FlightLog> {
  return fetchJson<FlightLog>(`/api/flights/${flightId}`)
}

export function getFlightAnalysis(flightId: string): Promise<FlightAnalysis> {
  return fetchJson<FlightAnalysis>(`/api/flights/${flightId}/analysis`)
}

export async function uploadFlight(file: File): Promise<UploadFlightResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, `Upload failed: ${response.status}`),
    )
  }

  return (await response.json()) as UploadFlightResponse
}
