import type { FlightAnalysis, FlightLog } from '../types/flight'

const DEFAULT_API_BASE_URL = ''

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL

export const API_BASE_URL =
  rawApiBaseUrl !== undefined ? rawApiBaseUrl.trim() : DEFAULT_API_BASE_URL

export const DEFAULT_FLIGHT_ID =
  import.meta.env.VITE_DEFAULT_FLIGHT_ID?.trim() ||
  'a2ed9650-0638-4597-8374-995d8e6660a4'

export type UploadFlightResponse = {
  job_id: string
}

export type UploadJobStatus = {
  id: string
  filename: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  stage: string
  progress: number
  flight_id: string | null
  error: string | null
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

export function getUploadStatus(jobId: string): Promise<UploadJobStatus> {
  return fetchJson<UploadJobStatus>(`/api/uploads/${jobId}`)
}

export async function uploadFlight(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadFlightResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return new Promise<UploadFlightResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}/api/upload`)
    xhr.responseType = 'json'

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) {
        return
      }

      onProgress(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onerror = () => {
      reject(new Error('Upload request failed'))
    }

    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const payload = xhr.response as UploadFlightResponse | null
        if (!payload?.job_id) {
          reject(new Error('Upload response is missing job id'))
          return
        }

        onProgress?.(100)
        resolve(payload)
        return
      }

      const response = new Response(xhr.responseText, {
        status: xhr.status,
        headers: {
          'content-type': xhr.getResponseHeader('content-type') || 'text/plain',
        },
      })
      reject(new Error(await getErrorMessage(response, `Upload failed: ${xhr.status}`)))
    }

    xhr.send(formData)
  })
}
