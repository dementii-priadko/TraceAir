import { useEffect, useState } from 'react'
import { DashboardPage } from './pages/DashboardPage'
import { LandingPage } from './pages/LandingPage'

function getFlightIdFromLocation(): string {
  const searchParams = new URLSearchParams(window.location.search)

  return (
    searchParams.get('flightId')?.trim() ||
    searchParams.get('flightid')?.trim() ||
    ''
  )
}

function getLandingErrorFromLocation(): string | null {
  const errorCode = new URLSearchParams(window.location.search).get('error')?.trim()

  if (errorCode === 'file-not-found') {
    return 'The requested flight file was not found. Upload a valid .bin or .tlog file to continue.'
  }

  return null
}

function navigateToFlight(flightId: string) {
  const normalizedFlightId = flightId.trim()

  if (!normalizedFlightId) {
    return
  }

  const url = new URL(window.location.href)
  url.searchParams.delete('flightid')
  url.searchParams.delete('error')
  url.searchParams.set('flightId', normalizedFlightId)
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function App() {
  const [flightId, setFlightId] = useState(() => getFlightIdFromLocation())
  const [landingError, setLandingError] = useState<string | null>(() => getLandingErrorFromLocation())

  useEffect(() => {
    function syncFlightId() {
      setFlightId(getFlightIdFromLocation())
      setLandingError(getLandingErrorFromLocation())
    }

    const searchParams = new URLSearchParams(window.location.search)
    const lowercaseFlightId = searchParams.get('flightid')?.trim()
    const canonicalFlightId = searchParams.get('flightId')?.trim()

    if (!canonicalFlightId && lowercaseFlightId) {
      navigateToFlight(lowercaseFlightId)
      return
    }

    window.addEventListener('popstate', syncFlightId)

    return () => {
      window.removeEventListener('popstate', syncFlightId)
    }
  }, [])

  if (!flightId) {
    return <LandingPage onOpenFlight={navigateToFlight} initialError={landingError} />
  }

  return <DashboardPage />
}

export default App
