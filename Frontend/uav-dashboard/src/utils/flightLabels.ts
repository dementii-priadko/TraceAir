const FLIGHT_FILE_LABEL_STORAGE_KEY = 'traceair-flight-file-labels'

export function readStoredFlightLabels(): Record<string, string> {
  try {
    const raw = window.sessionStorage.getItem(FLIGHT_FILE_LABEL_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

export function storeFlightLabel(flightId: string, fileLabel: string) {
  if (!flightId.trim() || !fileLabel.trim()) return

  const nextLabels = {
    ...readStoredFlightLabels(),
    [flightId]: fileLabel,
  }

  window.sessionStorage.setItem(
    FLIGHT_FILE_LABEL_STORAGE_KEY,
    JSON.stringify(nextLabels),
  )
}
