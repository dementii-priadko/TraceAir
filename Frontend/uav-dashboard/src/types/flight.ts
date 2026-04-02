export type EnuCoordinates = {
  e: number
  n: number
  u: number
}

export type Quaternion = [number, number, number, number]

export type FlightMeta = {
  firmware: string
  version: string
  git_hash: number
  total_messages: number
}

export type FlightOrigin = {
  lat: number
  lng: number
  alt: number
}

export type SensorDescriptor = {
  rate_hz: number
  n_samples: number
  n_sats?: number
  units: Record<string, string>
}

export type FlightSensors = {
  gps: SensorDescriptor
  imu: SensorDescriptor
  baro: SensorDescriptor
}

export type FlightMetrics = {
  max_horizontal_speed_ms: number
  max_vertical_speed_ms: number
  max_acceleration_ms2: number
  max_acceleration_g: number
  max_altitude_gain_m: number
  total_distance_m: number
  flight_duration_s: number
  apogee_msl_m: number
}

export type GpsTrajectoryPoint = {
  time_s: number
  lat: number
  lng: number
  alt_msl: number
  enu: EnuCoordinates
  h_speed: number
  v_speed: number
  seg_dist: number
  n_sats: number
}

export type SimTrajectoryPoint = {
  time_s: number
  lat: number
  lng: number
  enu: EnuCoordinates
  alt_msl: number
  h_speed: number
  v_speed: number
  roll: number
  pitch: number
  yaw: number
  quat: Quaternion
}

export type FlightTrajectory = {
  gps: GpsTrajectoryPoint[]
  sim: SimTrajectoryPoint[]
}

export type ImuRawPoint = {
  time_s: number
  acc_x: number
  acc_y: number
  acc_z: number
  gyr_x: number
  gyr_y: number
  gyr_z: number
}

export type IntegratedVelocityPoint = {
  time_s: number
  vel_x: number
  vel_y: number
  vel_z: number
  vel_total: number
  acc_mag: number
}

export type FlightImu = {
  raw_chart: ImuRawPoint[]
  integrated_velocity: IntegratedVelocityPoint[]
}

export type AttitudePoint = {
  time_s: number
  roll: number
  pitch: number
  yaw: number
  des_roll: number
  des_pitch: number
}

export type PidSample = {
  time_s: number
  tar: number
  act: number
  err: number
  p: number
  i: number
  d: number
}

export type FlightPid = {
  roll: PidSample[]
  pitch: PidSample[]
  yaw: PidSample[]
}

export type FlightEvent = {
  time_s: number
  message: string
}

export type FlightStage = {
  time_s: number
  stage: number
  stage_name: string
  prev_stage: number | null
}

export type FlightMode = {
  time_s: number
  mode_num: number
  mode_name: string
}

export type FlightLog = {
  meta: FlightMeta
  origin: FlightOrigin
  sensors: FlightSensors
  metrics: FlightMetrics
  trajectory: FlightTrajectory
  imu: FlightImu
  attitude: AttitudePoint[]
  pid: FlightPid
  events: FlightEvent[]
  stages: FlightStage[]
  modes: FlightMode[]
  parameters: Record<string, number>
}

export type FlightAnalysis = {
  id: string
  model: string
  summary: string
}
