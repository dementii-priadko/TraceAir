import type {
  AttitudePoint,
  FlightLog,
  FlightMode,
  FlightStage,
  IntegratedVelocityPoint,
} from '../types/flight'
import {
  formatAcceleration,
  formatDuration,
  formatMeters,
  formatSpeed,
} from './format'

export type SummaryMetric = {
  id: string
  label: string
  value: string
  hint: string
}

export type AltitudeChartPoint = {
  time_s: number
  altitude_msl: number
  relative_altitude: number
  satellites: number
}

export type SpeedChartPoint = {
  time_s: number
  horizontal_speed: number
  vertical_speed: number
}

export type ImuChartPoint = {
  time_s: number
  acc_x: number
  acc_y: number
  acc_z: number
}

export type IntegratedVelocityChartPoint = {
  time_s: number
  vel_x: number
  vel_y: number
  vel_z: number
  vel_total: number
  acc_mag: number
}

export type AttitudeChartPoint = {
  time_s: number
  roll: number
  pitch: number
  yaw: number
  des_roll: number
  des_pitch: number
}

export type TimelineItemType = 'event' | 'stage' | 'mode'

export type TimelineItem = {
  id: string
  time_s: number
  type: TimelineItemType
  title: string
  detail: string
}

export type ViewerFrame = {
  time_s: number
  position: {
    x: number
    y: number
    z: number
  }
  lat: number
  lng: number
  altitude_msl: number
  horizontal_speed: number
  vertical_speed: number
}

export type WorldMapPoint = {
  id: string
  label: string
  lat: number
  lng: number
}

export type WorldMapData = {
  route: Array<[number, number]>
  startPoint: WorldMapPoint
  endPoint: WorldMapPoint
}

export function adaptSummaryMetrics(flight: FlightLog): SummaryMetric[] {
  const { metrics } = flight

  return [
    {
      id: 'apogee',
      label: 'Apogee',
      value: formatMeters(metrics.apogee_msl_m),
      hint: 'Mean sea level',
    },
    {
      id: 'altitude-gain',
      label: 'Altitude Gain',
      value: formatMeters(metrics.max_altitude_gain_m),
      hint: 'Relative climb',
    },
    {
      id: 'horizontal-speed',
      label: 'Max Horizontal Speed',
      value: formatSpeed(metrics.max_horizontal_speed_ms),
      hint: 'IMU trapezoidal integration',
    },
    {
      id: 'acceleration',
      label: 'Peak Acceleration',
      value: formatAcceleration(metrics.max_acceleration_ms2),
      hint: `${metrics.max_acceleration_g.toFixed(2)} g`,
    },
    {
      id: 'distance',
      label: 'Total Distance',
      value: formatMeters(metrics.total_distance_m),
      hint: 'Integrated path',
    },
    {
      id: 'duration',
      label: 'Flight Duration',
      value: formatDuration(metrics.flight_duration_s),
      hint: 'Telemetry window',
    },
  ]
}

export function adaptAltitudeChartData(flight: FlightLog): AltitudeChartPoint[] {
  const baselineAltitude = flight.origin.alt

  return flight.trajectory.gps.map((point) => ({
    time_s: point.time_s,
    altitude_msl: point.alt_msl,
    relative_altitude: point.alt_msl - baselineAltitude,
    satellites: point.n_sats,
  }))
}

export function adaptSpeedChartData(flight: FlightLog): SpeedChartPoint[] {
  return flight.trajectory.gps.map((point) => ({
    time_s: point.time_s,
    horizontal_speed: point.h_speed,
    vertical_speed: point.v_speed,
  }))
}

export function adaptImuChartData(flight: FlightLog): ImuChartPoint[] {
  return flight.imu.raw_chart.map((point) => ({
    time_s: point.time_s,
    acc_x: point.acc_x,
    acc_y: point.acc_y,
    acc_z: point.acc_z,
  }))
}

export function adaptIntegratedVelocityChartData(
  flight: FlightLog,
): IntegratedVelocityChartPoint[] {
  return flight.imu.integrated_velocity.map((point) =>
    adaptIntegratedVelocityPoint(point),
  )
}

export function adaptAttitudeChartData(flight: FlightLog): AttitudeChartPoint[] {
  return flight.attitude.map((point: AttitudePoint) => ({
    time_s: point.time_s,
    roll: point.roll,
    pitch: point.pitch,
    yaw: point.yaw,
    des_roll: point.des_roll,
    des_pitch: point.des_pitch,
  }))
}

export function adaptTimelineItems(flight: FlightLog): TimelineItem[] {
  const stageItems = flight.stages.map((stage: FlightStage, index) => ({
    id: `stage-${index}`,
    time_s: stage.time_s,
    type: 'stage' as const,
    title: stage.stage_name,
    detail:
      stage.prev_stage === null
        ? `Entered stage ${stage.stage}`
        : `Transition from stage ${stage.prev_stage} to ${stage.stage}`,
  }))

  const modeItems = flight.modes.map((mode: FlightMode, index) => ({
    id: `mode-${index}`,
    time_s: mode.time_s,
    type: 'mode' as const,
    title: mode.mode_name,
    detail: `Mode ${mode.mode_num}`,
  }))

  return [...stageItems, ...modeItems].sort(
    (left, right) => left.time_s - right.time_s,
  )
}

export function adaptViewerFrames(flight: FlightLog): ViewerFrame[] {
  const source =
    flight.trajectory.sim.length > 0 ? flight.trajectory.sim : flight.trajectory.gps

  return source.map((point) => ({
    time_s: point.time_s,
    position: {
      x: point.enu.e,
      y: point.enu.u,
      z: point.enu.n,
    },
    lat: point.lat,
    lng: point.lng,
    altitude_msl: point.alt_msl,
    horizontal_speed: point.h_speed,
    vertical_speed: point.v_speed,
  }))
}

export function adaptWorldMapPoints(flight: FlightLog): WorldMapData {
  const route = flight.trajectory.gps
    .filter((point) =>
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      Math.abs(point.lat) <= 90 &&
      Math.abs(point.lng) <= 180,
    )
    .map((point) => [point.lat, point.lng] as [number, number])

  const firstRoutePoint = route.at(0)
  const lastRoutePoint = route.at(-1)

  const startPoint = firstRoutePoint
    ? {
        id: 'start',
        label: 'Start',
        lat: firstRoutePoint[0],
        lng: firstRoutePoint[1],
      }
    : {
        id: 'start',
        label: 'Start',
        lat: flight.origin.lat,
        lng: flight.origin.lng,
      }

  const endPoint = lastRoutePoint
    ? {
        id: 'end',
        label: 'End',
        lat: lastRoutePoint[0],
        lng: lastRoutePoint[1],
      }
    : {
        id: 'end',
        label: 'End',
        lat: flight.origin.lat,
        lng: flight.origin.lng,
      }

  return {
    route: route.length > 0 ? route : [[flight.origin.lat, flight.origin.lng]],
    startPoint,
    endPoint,
  }
}

function adaptIntegratedVelocityPoint(
  point: IntegratedVelocityPoint,
): IntegratedVelocityChartPoint {
  return {
    time_s: point.time_s,
    vel_x: point.vel_x,
    vel_y: point.vel_y,
    vel_z: point.vel_z,
    vel_total: point.vel_total,
    acc_mag: point.acc_mag,
  }
}
