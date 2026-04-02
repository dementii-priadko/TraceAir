export type MapStyle = 'osm' | 'satellite'

export type TileLayerConfig = {
  attribution: string
  subdomains?: string[]
  url: string
}

export const tileLayers: Record<MapStyle, TileLayerConfig> = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    subdomains: ['a', 'b', 'c'],
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
}

export function resolveTileUrl(
  style: MapStyle,
  z: number,
  x: number,
  y: number,
): string {
  const layer = tileLayers[style]
  const subdomain = layer.subdomains?.[(x + y) % layer.subdomains.length] ?? ''

  return layer.url
    .replace('{s}', subdomain)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}
