import { divIcon, latLngBounds } from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from 'react-leaflet'
import type { WorldMapData } from '../../utils/flightAdapters'
import { tileLayers, type MapStyle } from '../../utils/mapTiles'
import { SectionCard } from '../layout/SectionCard'

export type WorldMapCardProps = {
  points: WorldMapData
  className?: string
  contentClassName?: string
}

function createMarkerIcon(label: string, tone: 'start' | 'end') {
  const color = tone === 'start' ? '#f4eee1' : '#dd8d52'

  return divIcon({
    className: '',
    html: `
      <div class="flight-map-marker">
        <span class="flight-map-marker__dot" style="background:${color}"></span>
        <span class="flight-map-marker__label">${label}</span>
      </div>
    `,
    iconSize: [120, 24],
    iconAnchor: [6, 6],
  })
}

type FitToPointsProps = {
  points: Array<[number, number]>
}

function FitToPoints({ points }: FitToPointsProps) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) {
      return
    }

    const bounds = latLngBounds(points)
    map.fitBounds(bounds, {
      padding: [48, 48],
      maxZoom: points.length === 1 ? 8 : 12,
    })
  }, [map, points])

  return null
}

export function WorldMapCard({
  points,
  className = '',
  contentClassName = '',
}: WorldMapCardProps) {
  const { route, startPoint, endPoint } = points
  const [mapStyle, setMapStyle] = useState<MapStyle>('osm')
  const activeLayer = tileLayers[mapStyle]
  const startIcon = useMemo(() => createMarkerIcon('Start', 'start'), [])
  const endIcon = useMemo(() => createMarkerIcon('End', 'end'), [])

  return (
    <SectionCard
      title="Ground Track"
      description="The GPS route projected onto a geographic base layer with launch and terminal markers."
      className={className}
      contentClassName={contentClassName}
      actions={
        <div className="flex items-center gap-px border border-[var(--color-border)] bg-[var(--color-border)]">
          <button
            type="button"
            onClick={() => setMapStyle('osm')}
            className={`px-3 py-1.5 text-[0.62rem] font-medium uppercase tracking-[0.18em] transition ${
              mapStyle === 'osm'
                ? 'bg-[rgba(207,127,69,0.16)] text-[var(--color-text-primary)]'
                : 'bg-[rgba(255,255,255,0.02)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setMapStyle('satellite')}
            className={`px-3 py-1.5 text-[0.62rem] font-medium uppercase tracking-[0.18em] transition ${
              mapStyle === 'satellite'
                ? 'bg-[rgba(207,127,69,0.16)] text-[var(--color-text-primary)]'
                : 'bg-[rgba(255,255,255,0.02)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            Satellite
          </button>
        </div>
      }
    >
      <div className="h-full overflow-hidden border border-[var(--color-border)] bg-[rgba(0,0,0,0.12)]">
        <MapContainer
          center={[startPoint.lat, startPoint.lng]}
          zoom={4}
          scrollWheelZoom
          className="h-full min-h-72 w-full"
        >
          <TileLayer
            attribution={activeLayer.attribution}
            url={activeLayer.url}
            subdomains={activeLayer.subdomains}
          />
          <FitToPoints points={route} />
          <Polyline
            positions={route}
            pathOptions={{
              color: '#dd8d52',
              weight: 4,
              opacity: 0.88,
            }}
          />
          <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon} />
          <Marker position={[endPoint.lat, endPoint.lng]} icon={endIcon} />
        </MapContainer>
      </div>
    </SectionCard>
  )
}
