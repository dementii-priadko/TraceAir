import { divIcon, latLngBounds } from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from 'react-leaflet'
import type { WorldMapPoint } from '../../utils/flightAdapters'
import { SectionCard } from '../layout/SectionCard'

export type WorldMapCardProps = {
  points: WorldMapPoint[]
}

type MapStyle = 'osm' | 'satellite'

const tileLayers: Record<
  MapStyle,
  { attribution: string; url: string }
> = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
}

function createMarkerIcon(label: string, tone: 'start' | 'end') {
  const color = tone === 'start' ? '#e2e8f0' : '#7dd3fc'

  return divIcon({
    className: '',
    html: `
      <div class="flight-map-marker">
        <span class="flight-map-marker__dot" style="background:${color}"></span>
        <span class="flight-map-marker__label">${label}</span>
      </div>
    `,
    iconSize: [96, 24],
    iconAnchor: [12, 12],
  })
}

type FitToPointsProps = {
  points: WorldMapPoint[]
}

function FitToPoints({ points }: FitToPointsProps) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) {
      return
    }

    const bounds = latLngBounds(points.map((point) => [point.lat, point.lng]))
    map.fitBounds(bounds, {
      padding: [48, 48],
      maxZoom: points.length === 1 ? 8 : 12,
    })
  }, [map, points])

  return null
}

export function WorldMapCard({ points }: WorldMapCardProps) {
  const [startPoint, endPoint] = points
  const [mapStyle, setMapStyle] = useState<MapStyle>('osm')
  const activeLayer = tileLayers[mapStyle]
  const startIcon = useMemo(() => createMarkerIcon('Start', 'start'), [])
  const endIcon = useMemo(() => createMarkerIcon('End', 'end'), [])

  return (
    <SectionCard
      title="Map"
      description="Start and end positions projected on a simplified global view."
      actions={
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#070c15] p-1">
          <button
            type="button"
            onClick={() => setMapStyle('osm')}
            className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
              mapStyle === 'osm'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-500'
            }`}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setMapStyle('satellite')}
            className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
              mapStyle === 'satellite'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-500'
            }`}
          >
            Satellite
          </button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-lg border border-slate-900 bg-[#070b14]">
        <MapContainer
          center={[startPoint.lat, startPoint.lng]}
          zoom={4}
          scrollWheelZoom
          className="h-72 w-full"
        >
          <TileLayer attribution={activeLayer.attribution} url={activeLayer.url} />
          <FitToPoints points={points} />
          <Polyline
            positions={[
              [startPoint.lat, startPoint.lng],
              [endPoint.lat, endPoint.lng],
            ]}
            pathOptions={{
              color: '#7dd3fc',
              weight: 2,
              opacity: 0.75,
              dashArray: '8 8',
            }}
          />
          <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon} />
          <Marker position={[endPoint.lat, endPoint.lng]} icon={endIcon} />
        </MapContainer>
      </div>
    </SectionCard>
  )
}
