export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value)
}

export function formatMeters(value: number, maximumFractionDigits = 1): string {
  return `${formatNumber(value, maximumFractionDigits)} m`
}

export function formatSpeed(value: number, maximumFractionDigits = 1): string {
  return `${formatNumber(value, maximumFractionDigits)} m/s`
}

export function formatAcceleration(
  value: number,
  maximumFractionDigits = 2,
): string {
  return `${formatNumber(value, maximumFractionDigits)} m/s²`
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${formatNumber(seconds, 1)} s`
  }

  return `${minutes}m ${formatNumber(seconds, 0)}s`
}
