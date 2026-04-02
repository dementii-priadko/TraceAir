import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { FlightEvent, FlightStage } from '../../types/flight'
import type { ViewerFrame } from '../../utils/flightAdapters'
import {
  formatDuration,
  formatMeters,
  formatNumber,
  formatSpeed,
} from '../../utils/format'
import { SectionCard } from '../layout/SectionCard'

export type ViewerProps = {
  frames: ViewerFrame[]
  stages: FlightStage[]
  events: FlightEvent[]
  className?: string
}

type SceneHandles = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  drone: THREE.Group
  resizeObserver: ResizeObserver
  animationFrame: number
  groundMaterial: THREE.MeshBasicMaterial
}

type InterpolatedViewerFrame = ViewerFrame & {
  heading: THREE.Vector3
}

type MapBounds = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

type TileMode = 'map' | 'satellite'

const MIN_GROUND_SIZE = 800
const GROUND_PADDING_RATIO = 0.7
const TILE_SIZE = 256
const MAX_ALTITUDE_SCENE_RATIO = 0.35
const MAX_TILE_COUNT = 36
const MAX_CANVAS_PX = 8192

// ---------------------------------------------------------------------------
// Stage color mapping by name (case-insensitive). Falls back by index.
// ---------------------------------------------------------------------------
const STAGE_NAME_COLORS: Record<string, string> = {
  preflight: '#94a3b8', pad_idle: '#94a3b8', init: '#94a3b8',
  boost: '#f97316', coast: '#22d3ee', apogee: '#facc15',
  recovery: '#a78bfa', descent: '#a78bfa',
}
const STAGE_INDEX_FALLBACK = ['#94a3b8','#94a3b8','#f97316','#22d3ee','#facc15','#a78bfa','#64748b']

function stageColor(stage: FlightStage): string {
  return STAGE_NAME_COLORS[stage.stage_name.toLowerCase()] ?? STAGE_INDEX_FALLBACK[stage.stage] ?? '#64748b'
}
function stageColorByIndex(idx: number, stages: FlightStage[]): string {
  const s = stages.find((st) => st.stage === idx)
  return s ? stageColor(s) : '#64748b'
}

// ---------------------------------------------------------------------------
// Tile URL builders
// ---------------------------------------------------------------------------
function tileUrl(mode: TileMode, z: number, x: number, y: number): string {
  if (mode === 'satellite') {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
  }
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function createFallbackGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024
  const ctx = c.getContext('2d')
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, c.width, c.height)
    g.addColorStop(0, '#0d1524'); g.addColorStop(0.5, '#102338'); g.addColorStop(1, '#08111c')
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = 'rgba(148,163,184,0.14)'; ctx.lineWidth = 2
    for (let i = 0; i <= 16; i++) {
      const o = (c.width / 16) * i
      ctx.beginPath(); ctx.moveTo(o, 0); ctx.lineTo(o, c.height); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, o); ctx.lineTo(c.width, o); ctx.stroke()
    }
    ctx.fillStyle = 'rgba(226,232,240,0.6)'; ctx.font = '600 42px Manrope, sans-serif'
    ctx.fillText('SECTOR MAP', 48, 72)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

// ---------------------------------------------------------------------------
// Mercator
// ---------------------------------------------------------------------------
function mercatorY(lat: number) {
  const r = (clamp(lat, -85.05112878, 85.05112878) * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + r / 2))
}

function getPaddedMapBounds(frames: ViewerFrame[]): MapBounds {
  const lats = frames.map((f) => f.lat), lngs = frames.map((f) => f.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  // Very wide padding so the map fills the whole viewport
  const latPad = Math.max((maxLat - minLat) * 3, 0.012)
  const lngPad = Math.max((maxLng - minLng) * 3, 0.012)
  return { minLat: minLat - latPad, maxLat: maxLat + latPad, minLng: minLng - lngPad, maxLng: maxLng + lngPad }
}

function longitudeToTile(lng: number, z: number) { return ((lng + 180) / 360) * 2 ** z }
function latitudeToTile(lat: number, z: number) {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

function pickTileZoom(bounds: MapBounds): number {
  for (let z = 16; z >= 8; z--) {
    const x0 = Math.floor(longitudeToTile(bounds.minLng, z))
    const x1 = Math.floor(longitudeToTile(bounds.maxLng, z))
    const y0 = Math.floor(latitudeToTile(bounds.maxLat, z))
    const y1 = Math.floor(latitudeToTile(bounds.minLat, z))
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= MAX_TILE_COUNT) return z
  }
  return 8
}

function loadTileImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => res(img); img.onerror = () => rej(new Error(`Failed: ${url}`))
    img.src = url
  })
}

async function createSectorTexture(bounds: MapBounds, mode: TileMode): Promise<THREE.CanvasTexture | null> {
  const zoom = pickTileZoom(bounds)
  const xS = Math.floor(longitudeToTile(bounds.minLng, zoom))
  const xE = Math.floor(longitudeToTile(bounds.maxLng, zoom))
  const yS = Math.floor(latitudeToTile(bounds.maxLat, zoom))
  const yE = Math.floor(latitudeToTile(bounds.minLat, zoom))
  const fW = (xE - xS + 1) * TILE_SIZE, fH = (yE - yS + 1) * TILE_SIZE
  if (fW <= 0 || fH <= 0 || fW > MAX_CANVAS_PX || fH > MAX_CANVAS_PX) return null

  const tmp = document.createElement('canvas'); tmp.width = fW; tmp.height = fH
  const ctx = tmp.getContext('2d'); if (!ctx) return null

  const jobs: Promise<void>[] = []
  for (let tx = xS; tx <= xE; tx++) {
    for (let ty = yS; ty <= yE; ty++) {
      const url = tileUrl(mode, zoom, tx, ty)
      jobs.push(loadTileImage(url).then((img) => {
        ctx.drawImage(img, (tx - xS) * TILE_SIZE, (ty - yS) * TILE_SIZE, TILE_SIZE, TILE_SIZE)
      }).catch(() => {})) // skip failed tiles silently
    }
  }
  await Promise.all(jobs)

  // Crop to exact bounds
  const cl = (longitudeToTile(bounds.minLng, zoom) - xS) * TILE_SIZE
  const ct = (latitudeToTile(bounds.maxLat, zoom) - yS) * TILE_SIZE
  const cr = (longitudeToTile(bounds.maxLng, zoom) - xS) * TILE_SIZE
  const cb = (latitudeToTile(bounds.minLat, zoom) - yS) * TILE_SIZE
  const cw = Math.round(cr - cl), ch = Math.round(cb - ct)
  if (cw <= 0 || ch <= 0) return null

  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch
  const out = canvas.getContext('2d'); if (!out) return null
  out.drawImage(tmp, Math.round(cl), Math.round(ct), cw, ch, 0, 0, cw, ch)
  // Subtle dark overlay for readability
  out.fillStyle = mode === 'satellite' ? 'rgba(0,0,0,0.15)' : 'rgba(5,9,19,0.2)'
  out.fillRect(0, 0, cw, ch)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------
function projectFrameToGround(
  frame: ViewerFrame, bounds: MapBounds, width: number, depth: number, altitudeScale: number,
): ViewerFrame {
  const mTop = mercatorY(bounds.maxLat), mBot = mercatorY(bounds.minLat), mCur = mercatorY(frame.lat)
  const u = clamp((frame.lng - bounds.minLng) / Math.max(bounds.maxLng - bounds.minLng, 1e-6), 0, 1)
  const v = clamp((mTop - mCur) / Math.max(mTop - mBot, 1e-6), 0, 1)
  return { ...frame, position: { x: (u - 0.5) * width, y: Math.max(frame.position.y, 0) * altitudeScale + 2, z: (v - 0.5) * depth } }
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------
function interpolateFrame(frames: ViewerFrame[], time: number): InterpolatedViewerFrame {
  if (frames.length === 1) return { ...frames[0], heading: new THREE.Vector3(1, 0, 0) }
  const t = clamp(time, frames[0].time_s, frames[frames.length - 1].time_s)
  let ri = frames.findIndex((f) => f.time_s >= t)
  if (ri <= 0) ri = 1; if (ri === -1) ri = frames.length - 1
  const li = Math.max(0, ri - 1), lf = frames[li], rf = frames[ri]
  const span = Math.max(rf.time_s - lf.time_s, 0.0001), p = clamp((t - lf.time_s) / span, 0, 1)
  const heading = new THREE.Vector3(rf.position.x - lf.position.x, rf.position.y - lf.position.y, rf.position.z - lf.position.z)
  if (heading.lengthSq() === 0) heading.set(1, 0, 0); else heading.normalize()
  return {
    time_s: t,
    position: { x: lerp(lf.position.x, rf.position.x, p), y: lerp(lf.position.y, rf.position.y, p), z: lerp(lf.position.z, rf.position.z, p) },
    lat: lerp(lf.lat, rf.lat, p), lng: lerp(lf.lng, rf.lng, p),
    altitude_msl: lerp(lf.altitude_msl, rf.altitude_msl, p),
    horizontal_speed: lerp(lf.horizontal_speed, rf.horizontal_speed, p),
    vertical_speed: lerp(lf.vertical_speed, rf.vertical_speed, p),
    heading,
  }
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------
function createPointMarker(color: string, radius = 3): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16), new THREE.MeshBasicMaterial({ color }))
}
function createArrowheadDrone(): THREE.Group {
  const drone = new THREE.Group()
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3, 10, 3), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
  cone.rotation.x = Math.PI / 2; drone.add(cone)
  drone.scale.setScalar(2.5)
  return drone
}

// ---------------------------------------------------------------------------
// Stage helpers
// ---------------------------------------------------------------------------
function stageIndexAtTime(time: number, stages: FlightStage[]): number {
  let idx = 0
  for (let i = stages.length - 1; i >= 0; i--) { if (time >= stages[i].time_s) { idx = stages[i].stage; break } }
  return idx
}

function buildStageRouteSegments(
  positions: THREE.Vector3[], frames: ViewerFrame[], stages: FlightStage[],
): { geometry: LineGeometry; material: LineMaterial }[] {
  if (positions.length < 2) return []
  const segments: { geometry: LineGeometry; material: LineMaterial }[] = []
  let cur = stageIndexAtTime(frames[0].time_s, stages)
  let pts: number[] = [positions[0].x, positions[0].y, positions[0].z]

  const flush = () => {
    if (pts.length < 6) return
    const geo = new LineGeometry(); geo.setPositions(pts)
    const mat = new LineMaterial({ color: new THREE.Color(stageColorByIndex(cur, stages)).getHex(), linewidth: 3, transparent: true, opacity: 0.95 })
    segments.push({ geometry: geo, material: mat })
  }

  for (let i = 1; i < positions.length; i++) {
    const s = stageIndexAtTime(frames[i].time_s, stages)
    if (s !== cur) {
      pts.push(positions[i].x, positions[i].y, positions[i].z); flush()
      cur = s; pts = [positions[i].x, positions[i].y, positions[i].z]
    } else { pts.push(positions[i].x, positions[i].y, positions[i].z) }
  }
  flush()
  return segments
}

function findParachuteTime(events: FlightEvent[], stages: FlightStage[]): number | null {
  const ev = events.find((e) => /parachute.*release/i.test(e.message))
  if (ev) return ev.time_s
  const ds = stages.find((s) => /descent|recovery/i.test(s.stage_name))
  return ds ? ds.time_s : null
}

// ===========================================================================
// Component
// ===========================================================================
export function Viewer({ frames, stages, events, className = '' }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<SceneHandles | null>(null)
  const [currentTime, setCurrentTime] = useState(frames[0]?.time_s ?? 0)
  const [tileMode, setTileMode] = useState<TileMode>('map')

  const sceneModel = useMemo(() => {
    if (frames.length === 0) return null
    const bounds = getPaddedMapBounds(frames)
    const mW = Math.max(Math.abs(bounds.maxLng - bounds.minLng) / 360, 1e-7)
    const mH = Math.max(Math.abs(mercatorY(bounds.maxLat) - mercatorY(bounds.minLat)) / (2 * Math.PI), 1e-7)
    const ar = mW / mH
    const longest = Math.max(MIN_GROUND_SIZE, 800)
    const width = ar >= 1 ? longest : Math.max(longest * ar, 400)
    const depth = ar >= 1 ? Math.max(longest / ar, 400) : longest
    const maxAlt = Math.max(...frames.map((f) => Math.max(f.position.y, 0)), 1)
    const groundSize = Math.max(width, depth)
    const altitudeScale = Math.min((groundSize * MAX_ALTITUDE_SCENE_RATIO) / maxAlt, 0.5)
    return {
      bounds, width, depth, altitudeScale,
      centeredFrames: frames.map((f) => projectFrameToGround(f, bounds, width, depth, altitudeScale)),
    }
  }, [frames])

  const currentFrame = useMemo(
    () => sceneModel ? interpolateFrame(sceneModel.centeredFrames, currentTime) : null,
    [currentTime, sceneModel],
  )

  const minTime = frames[0]?.time_s ?? 0
  const maxTime = frames.at(-1)?.time_s ?? 0
  const sliderStep = frames.length > 1 ? Math.max((maxTime - minTime) / 2000, 0.001) : 0.01

  useEffect(() => { setCurrentTime(frames[0]?.time_s ?? 0) }, [frames])

  // ---- Scene setup --------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    if (!container || !sceneModel) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#050913')
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 10000)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.06
    controls.enablePan = true; controls.minDistance = 40; controls.maxDistance = 4000
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI * 0.45

    scene.add(new THREE.AmbientLight('#cbd5e1', 1))

    const positions = sceneModel.centeredFrames.map((f) => new THREE.Vector3(f.position.x, f.position.y, f.position.z))
    const xs = positions.map((p) => p.x), zs = positions.map((p) => p.z)
    const w = Math.max(Math.max(...xs) - Math.min(...xs), sceneModel.width * 0.5)
    const d = Math.max(Math.max(...zs) - Math.min(...zs), sceneModel.depth * 0.5)
    const pw = Math.max(sceneModel.width, w * (1 + GROUND_PADDING_RATIO))
    const pd = Math.max(sceneModel.depth, d * (1 + GROUND_PADDING_RATIO))

    // Ground
    const fallbackTex = createFallbackGroundTexture()
    const groundMat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: fallbackTex })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd, 1, 1), groundMat)
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.5, 0)
    scene.add(ground)

    // Grid
    const gridMat = new THREE.LineBasicMaterial({ color: '#334155', transparent: true, opacity: 0.4 })
    const gp: THREE.Vector3[] = []; const div = 16
    for (let i = 0; i <= div; i++) {
      const z = -pd / 2 + (pd / div) * i
      gp.push(new THREE.Vector3(-pw / 2, 0.1, z), new THREE.Vector3(pw / 2, 0.1, z))
    }
    for (let i = 0; i <= div; i++) {
      const x = -pw / 2 + (pw / div) * i
      gp.push(new THREE.Vector3(x, 0.1, -pd / 2), new THREE.Vector3(x, 0.1, pd / 2))
    }
    const gridGeo = new THREE.BufferGeometry().setFromPoints(gp)
    scene.add(new THREE.LineSegments(gridGeo, gridMat))

    const frameMat = new THREE.LineBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.25 })
    const mapFrame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(pw, pd)), frameMat)
    mapFrame.rotation.x = -Math.PI / 2; mapFrame.position.set(0, 0.2, 0)
    scene.add(mapFrame)

    // Route segments
    const routeSegs = buildStageRouteSegments(positions, sceneModel.centeredFrames, stages)
    for (const s of routeSegs) {
      s.material.resolution.set(container.clientWidth || 1, container.clientHeight || 1)
      scene.add(new Line2(s.geometry, s.material))
    }

    const disposables: { dispose: () => void }[] = []

    // Start & Landing
    const startM = createPointMarker('#22c55e', 3.5); startM.position.copy(positions[0]); scene.add(startM)
    disposables.push(startM.geometry, startM.material as THREE.Material)
    const endM = createPointMarker('#ef4444', 3.5); endM.position.copy(positions[positions.length - 1]); scene.add(endM)
    disposables.push(endM.geometry, endM.material as THREE.Material)

    // Apogee
    const apIdx = sceneModel.centeredFrames.reduce((best, f, i, arr) => (f.altitude_msl > arr[best].altitude_msl ? i : best), 0)
    const apM = createPointMarker('#facc15', 4); apM.position.copy(positions[apIdx]); scene.add(apM)
    disposables.push(apM.geometry, apM.material as THREE.Material)
    const apDropGeo = new THREE.BufferGeometry().setFromPoints([positions[apIdx].clone(), new THREE.Vector3(positions[apIdx].x, 0, positions[apIdx].z)])
    const apDrop = new THREE.Line(apDropGeo, new THREE.LineDashedMaterial({ color: '#facc15', transparent: true, opacity: 0.35, dashSize: 4, gapSize: 3 }))
    apDrop.computeLineDistances(); scene.add(apDrop)
    disposables.push(apDropGeo, apDrop.material as THREE.Material)

    // Parachute
    const chuteTime = findParachuteTime(events, stages)
    if (chuteTime !== null) {
      let ci = 0, bd = Infinity
      for (let i = 0; i < sceneModel.centeredFrames.length; i++) { const dt = Math.abs(sceneModel.centeredFrames[i].time_s - chuteTime); if (dt < bd) { bd = dt; ci = i } }
      const cm = createPointMarker('#c084fc', 4); cm.position.copy(positions[ci]); scene.add(cm)
      disposables.push(cm.geometry, cm.material as THREE.Material)
      const cdGeo = new THREE.BufferGeometry().setFromPoints([positions[ci].clone(), new THREE.Vector3(positions[ci].x, 0, positions[ci].z)])
      const cd = new THREE.Line(cdGeo, new THREE.LineDashedMaterial({ color: '#c084fc', transparent: true, opacity: 0.35, dashSize: 4, gapSize: 3 }))
      cd.computeLineDistances(); scene.add(cd)
      disposables.push(cdGeo, cd.material as THREE.Material)
    }

    // Drone
    const drone = createArrowheadDrone(); scene.add(drone)

    // Camera
    const center = new THREE.Vector3(0, 0, 0)
    const camDir = new THREE.Vector3(0.6, 1.2, 0.8).normalize()
    const fitCamera = () => {
      const maxDim = Math.max(pw, pd, 120)
      const fov = THREE.MathUtils.degToRad(camera.fov)
      const dH = maxDim / (2 * Math.tan(fov / 2))
      const dW = dH / Math.max(camera.aspect, 0.75)
      camera.position.copy(center.clone().add(camDir.clone().multiplyScalar(Math.max(dH, dW) * 1.15)))
      camera.lookAt(center); controls.target.copy(center); controls.update()
    }

    let disposed = false
    void createSectorTexture(sceneModel.bounds, tileMode).then((tex) => {
      if (!tex || disposed) return
      fallbackTex.dispose(); groundMat.map = tex; groundMat.needsUpdate = true
    }).catch(() => {})

    const resize = () => {
      const { clientWidth: cw, clientHeight: ch } = container
      if (cw === 0 || ch === 0) return
      camera.aspect = cw / ch; camera.updateProjectionMatrix()
      renderer.setSize(cw, ch, false)
      for (const s of routeSegs) s.material.resolution.set(cw, ch)
      fitCamera()
    }
    const ro = new ResizeObserver(resize); ro.observe(container); resize()

    const render = () => { controls.update(); renderer.render(scene, camera); af = requestAnimationFrame(render) }
    let af = requestAnimationFrame(render)

    sceneRef.current = { renderer, scene, camera, controls, drone, resizeObserver: ro, animationFrame: af, groundMaterial: groundMat }

    return () => {
      disposed = true; cancelAnimationFrame(af); ro.disconnect(); controls.dispose()
      for (const s of routeSegs) { s.geometry.dispose(); s.material.dispose() }
      ground.geometry.dispose(); groundMat.map?.dispose(); groundMat.dispose()
      gridGeo.dispose(); gridMat.dispose()
      mapFrame.geometry.dispose(); frameMat.dispose()
      for (const d of disposables) d.dispose()
      renderer.dispose(); sceneRef.current = null; container.innerHTML = ''
    }
  }, [frames, stages, events, sceneModel])

  // ---- Tile mode swap (texture only, no scene rebuild) --------------------
  useEffect(() => {
    if (!sceneRef.current || !sceneModel) return
    const { groundMaterial } = sceneRef.current
    let cancelled = false
    void createSectorTexture(sceneModel.bounds, tileMode).then((tex) => {
      if (!tex || cancelled || !sceneRef.current) return
      groundMaterial.map?.dispose()
      groundMaterial.map = tex
      groundMaterial.needsUpdate = true
    }).catch(() => {})
    return () => { cancelled = true }
  }, [tileMode, sceneModel])

  // ---- Drone update -------------------------------------------------------
  useEffect(() => {
    if (!currentFrame || !sceneRef.current) return
    const { drone } = sceneRef.current
    drone.position.set(currentFrame.position.x, currentFrame.position.y, currentFrame.position.z)
    const fwd = new THREE.Vector3(0, 0, 1), tgt = currentFrame.heading.clone().normalize()
    drone.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(fwd, tgt))
  }, [currentFrame])

  // ---- Render -------------------------------------------------------------
  if (frames.length === 0) {
    return (
      <SectionCard title="3D Flight Viewer" description="Three.js sector view with terrain, route, and time-based drone position." className={className}>
        <div className="rounded-xl border border-dashed border-slate-800 bg-[#070b14] p-5 text-sm text-slate-300">
          No trajectory samples are available for the current flight.
        </div>
      </SectionCard>
    )
  }

  const uniqueStages = stages.filter((s, i, arr) => arr.findIndex((x) => x.stage === s.stage) === i)

  return (
    <SectionCard title="3D Flight Viewer" description="Sector terrain, full route, and a scrubbable drone position rendered in Three.js." className={className}>
      <div className="space-y-4">
        {/* Tile mode toggle */}
        <div className="flex items-center justify-end gap-2 px-1">
          <button
            onClick={() => setTileMode('map')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tileMode === 'map'
                ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Map
          </button>
          <button
            onClick={() => setTileMode('satellite')}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tileMode === 'satellite'
                ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Satellite
          </button>
        </div>

        <div ref={containerRef} className="h-[34rem] overflow-hidden rounded-xl border border-slate-900 bg-[#070b14]" />

        <div className="grid gap-4 rounded-xl border border-slate-900 bg-[#070b14] p-4 lg:grid-cols-[minmax(0,1fr)_36rem] lg:items-end">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-slate-500">
              <span>Flight Timeline</span>
              <span className="tabular-nums">{formatDuration(currentTime)}</span>
            </div>
            <input
              type="range" min={minTime} max={maxTime} step={sliderStep} value={currentTime}
              onChange={(e) => setCurrentTime(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-sky-400"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-900 bg-[#090d17] p-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Samples</p>
              <p className="mt-2 text-2xl font-semibold text-slate-100">{formatNumber(frames.length, 0)}</p>
            </div>
            <div className="rounded-lg border border-slate-900 bg-[#090d17] p-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Altitude</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{currentFrame ? formatMeters(currentFrame.altitude_msl) : '--'}</p>
            </div>
            <div className="rounded-lg border border-slate-900 bg-[#090d17] p-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Ground Speed</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">{currentFrame ? formatSpeed(currentFrame.horizontal_speed) : '--'}</p>
            </div>
            <div className="rounded-lg border border-slate-900 bg-[#090d17] p-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Position</p>
              <p className="mt-2 text-sm font-semibold text-slate-100">
                {currentFrame ? `${formatNumber(currentFrame.lat, 5)} / ${formatNumber(currentFrame.lng, 5)}` : '--'}
              </p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-1 text-xs text-slate-400">
          {uniqueStages.map((s) => (
            <span key={s.stage} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: stageColor(s) }} />
              {s.stage_name}
            </span>
          ))}
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />Start</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />Landing</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />Apogee</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-purple-400" />Chute Deploy</span>
        </div>
      </div>
    </SectionCard>
  )
}
