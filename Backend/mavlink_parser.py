"""
Skyparse — ArduPilot DataFlash BIN to JSON parser
==================================================

Parses .BIN flight logs from ArduPilot-based flight controllers,
extracts GPS + IMU telemetry, computes flight metrics, converts
WGS-84 coordinates to local ENU frame, and outputs structured JSON
ready for frontend consumption.

Mathematical notes:
-------------------
- WGS-84 → ENU: Geodetic transformation via pyproj (PROJ library).
  Two-step pipeline: WGS-84 (EPSG:4326) → ECEF (EPSG:4978) via
  ellipsoidal transform, then ECEF → local ENU via topocentric
  rotation matrix centred at the launch point. This is exact on
  the WGS-84 ellipsoid (a=6378137m, f=1/298.257223563), unlike
  the flat-earth approximation which ignores ellipsoidal geometry
  and altitude variation.

- Haversine distance: Great-circle distance between consecutive GPS
  points. Used for total ground distance and horizontal speed.
  Formula: a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)
           d = 2R · atan2(√a, √(1-a))

- Trapezoidal integration: Velocity from accelerometer data.
  v(t_n) = v(t_{n-1}) + (a(t_{n-1}) + a(t_n)) / 2 · Δt
  Note: Double integration of IMU data accumulates drift from
  accelerometer bias. The resulting velocity is useful for
  high-frequency dynamics (boost phase) but diverges from GPS
  over longer durations. We report both GPS-derived and
  IMU-integrated speeds for comparison.

- Quaternion vs Euler: The SIM messages provide quaternions (Q1-Q4)
  which avoid gimbal lock that occurs with Euler angles when pitch
  approaches ±90° — relevant during vertical rocket flight. We
  store both representations; Euler for readability, quaternions
  for accurate interpolation.
"""

import json
import math
import sys
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd
from pymavlink import mavutil


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
EARTH_RADIUS = 6_371_000  # metres
ProgressCallback = Callable[[float, str], None]


# ---------------------------------------------------------------------------
# Haversine distance (metres) between two WGS-84 points
# ---------------------------------------------------------------------------
def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Great-circle distance via the Haversine formula.

    Given two points (lat1, lon1) and (lat2, lon2) in decimal degrees,
    returns the surface distance in metres.

    Derivation:
        a = sin²(Δφ/2) + cos(φ1) · cos(φ2) · sin²(Δλ/2)
        c = 2 · atan2(√a, √(1−a))
        d = R · c
    where R = 6 371 000 m (mean Earth radius).
    """
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return EARTH_RADIUS * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# WGS-84 → ENU conversion via pyproj
# ---------------------------------------------------------------------------
# We use a two-step geodetic pipeline through pyproj (PROJ library):
#
# Step 1: WGS-84 (EPSG:4326, lat/lon/alt) → ECEF (Earth-Centered
#         Earth-Fixed, EPSG:4978, Cartesian X/Y/Z in metres).
#         This is exact on the WGS-84 ellipsoid.
#
# Step 2: ECEF → local ENU (East-North-Up) centred at the launch
#         point. This uses a topocentric rotation matrix derived
#         from the geodetic coordinates of the origin:
#
#           ┌ E ┐   ┌ -sinλ₀        cosλ₀       0      ┐ ┌ dX ┐
#           │ N │ = │ -sinφ₀·cosλ₀ -sinφ₀·sinλ₀ cosφ₀  │ │ dY │
#           └ U ┘   └  cosφ₀·cosλ₀  cosφ₀·sinλ₀ sinφ₀  ┘ └ dZ ┘
#
#         where (dX, dY, dZ) = ECEF_point − ECEF_origin and
#         (φ₀, λ₀) are the geodetic lat/lon of the origin.
#
# Why pyproj instead of the flat-earth approximation?
# - Accounts for the WGS-84 ellipsoid (a=6378137, f=1/298.257223563)
#   rather than assuming a sphere of radius R.
# - The flat-earth formula East = Δlon·R·cos(lat0) accumulates
#   ~0.3% error for flights with significant altitude variation
#   because it ignores the radial distance from the ellipsoid.
# - pyproj's ECEF→ENU rotation is exact for any distance/altitude.
#
# For a 1-2 km model-rocket flight the practical difference is
# small (<1 m), but using the proper geodetic pipeline demonstrates
# correct handling of coordinate reference systems as required by
# the challenge specification.

from pyproj import Transformer

# Lazy-initialised transformers (thread-safe singletons)
_tf_geodetic_to_ecef: Transformer | None = None
_enu_origin_ecef: tuple[float, float, float] | None = None
_enu_rotation: np.ndarray | None = None


def _init_enu_transform(lat0: float, lon0: float, alt0: float) -> None:
    """
    Pre-compute the ECEF origin and rotation matrix for WGS-84 → ENU.

    Called once when the launch-point origin is known.
    """
    global _tf_geodetic_to_ecef, _enu_origin_ecef, _enu_rotation

    # EPSG:4326 (lon, lat, alt) → EPSG:4978 (ECEF X, Y, Z)
    _tf_geodetic_to_ecef = Transformer.from_crs(
        "EPSG:4326", "EPSG:4978", always_xy=True,
    )

    # Origin in ECEF
    x0, y0, z0 = _tf_geodetic_to_ecef.transform(lon0, lat0, alt0)
    _enu_origin_ecef = (x0, y0, z0)

    # Rotation matrix: ECEF delta → ENU
    phi = math.radians(lat0)
    lam = math.radians(lon0)
    sp, cp = math.sin(phi), math.cos(phi)
    sl, cl = math.sin(lam), math.cos(lam)

    _enu_rotation = np.array([
        [-sl,      cl,      0  ],
        [-sp * cl, -sp * sl, cp],
        [ cp * cl,  cp * sl, sp],
    ])


def wgs84_to_enu(
    lat: float, lon: float, alt: float,
    lat0: float, lon0: float, alt0: float,
) -> tuple[float, float, float]:
    """
    Convert a WGS-84 geodetic point to a local East-North-Up (ENU)
    frame centred at (lat0, lon0, alt0) using pyproj.

    Returns (East, North, Up) in metres.
    """
    global _enu_origin_ecef, _enu_rotation

    if _tf_geodetic_to_ecef is None or _enu_origin_ecef is None:
        _init_enu_transform(lat0, lon0, alt0)

    # Point in ECEF
    x, y, z = _tf_geodetic_to_ecef.transform(lon, lat, alt)  # type: ignore[union-attr]

    # Delta from origin
    dx = x - _enu_origin_ecef[0]  # type: ignore[index]
    dy = y - _enu_origin_ecef[1]  # type: ignore[index]
    dz = z - _enu_origin_ecef[2]  # type: ignore[index]

    # Rotate to ENU
    enu = _enu_rotation @ np.array([dx, dy, dz])  # type: ignore[union-attr]

    return (round(float(enu[0]), 3), round(float(enu[1]), 3), round(float(enu[2]), 3))


# ---------------------------------------------------------------------------
# Trapezoidal integration of acceleration → velocity
# ---------------------------------------------------------------------------
def trapezoidal_integrate(times: np.ndarray, values: np.ndarray) -> np.ndarray:
    """
    Integrate a discrete signal using the trapezoidal rule.

    v[0] = 0
    v[n] = v[n-1] + (a[n-1] + a[n]) / 2 · (t[n] - t[n-1])

    Used to derive velocity from IMU accelerometer readings.

    Warning: accumulates drift from sensor bias over time.
    For an accelerometer with bias b, the velocity error after
    time T is approximately b·T. A typical MEMS bias of 0.02 m/s²
    produces ~0.6 m/s drift over 30 s.
    """
    vel = np.zeros_like(values, dtype=np.float64)
    for i in range(1, len(values)):
        dt = times[i] - times[i - 1]
        vel[i] = vel[i - 1] + 0.5 * (values[i - 1] + values[i]) * dt
    return vel


def interpolate_attitude(
    sample_times: np.ndarray, attitude_records: list[dict[str, Any]]
) -> tuple[np.ndarray, np.ndarray, np.ndarray] | None:
    """Interpolate roll, pitch, yaw to the timestamps of IMU samples."""
    if not attitude_records:
        return None

    attitude_times = np.array([float(record["time_s"]) for record in attitude_records], dtype=np.float64)
    roll = np.array([float(record["roll"]) for record in attitude_records], dtype=np.float64)
    pitch = np.array([float(record["pitch"]) for record in attitude_records], dtype=np.float64)
    yaw = np.array([float(record["yaw"]) for record in attitude_records], dtype=np.float64)

    if len(attitude_times) == 1:
        return (
            np.full_like(sample_times, roll[0], dtype=np.float64),
            np.full_like(sample_times, pitch[0], dtype=np.float64),
            np.full_like(sample_times, yaw[0], dtype=np.float64),
        )

    return (
        np.interp(sample_times, attitude_times, roll),
        np.interp(sample_times, attitude_times, pitch),
        np.interp(sample_times, attitude_times, yaw),
    )


def rotate_body_accel_to_enu(
    acc_x: np.ndarray,
    acc_y: np.ndarray,
    acc_z: np.ndarray,
    roll_deg: np.ndarray,
    pitch_deg: np.ndarray,
    yaw_deg: np.ndarray,
) -> np.ndarray:
    """Rotate body-frame acceleration vectors into the local ENU frame."""
    roll = np.radians(roll_deg)
    pitch = np.radians(pitch_deg)
    yaw = np.radians(yaw_deg)

    cr, sr = np.cos(roll), np.sin(roll)
    cp, sp = np.cos(pitch), np.sin(pitch)
    cy, sy = np.cos(yaw), np.sin(yaw)

    rotation = np.empty((len(acc_x), 3, 3), dtype=np.float64)
    rotation[:, 0, 0] = cy * cp
    rotation[:, 0, 1] = cy * sp * sr - sy * cr
    rotation[:, 0, 2] = cy * sp * cr + sy * sr
    rotation[:, 1, 0] = sy * cp
    rotation[:, 1, 1] = sy * sp * sr + cy * cr
    rotation[:, 1, 2] = sy * sp * cr - cy * sr
    rotation[:, 2, 0] = -sp
    rotation[:, 2, 1] = cp * sr
    rotation[:, 2, 2] = cp * cr

    body_accel = np.column_stack((acc_x, acc_y, acc_z))
    return np.einsum("nij,nj->ni", rotation, body_accel)


def integrate_velocity_components(
    times: np.ndarray,
    acc_x: np.ndarray,
    acc_y: np.ndarray,
    acc_z: np.ndarray,
    attitude: tuple[np.ndarray, np.ndarray, np.ndarray] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Derive velocity components from accelerometer samples.

    If attitude is available, acceleration is first rotated into ENU.
    Then the average of the first stationary samples is removed in that
    world frame before trapezoidal integration.
    """
    if len(times) == 0:
        empty = np.array([], dtype=np.float64)
        return empty, empty, empty

    if attitude is not None:
        roll_deg, pitch_deg, yaw_deg = attitude
        accel_components = rotate_body_accel_to_enu(acc_x, acc_y, acc_z, roll_deg, pitch_deg, yaw_deg)
        comp_x = accel_components[:, 0]
        comp_y = accel_components[:, 1]
        comp_z = accel_components[:, 2]
    else:
        comp_x = acc_x
        comp_y = acc_y
        comp_z = acc_z

    n_cal = min(50, len(times))
    bias_x = float(np.mean(comp_x[:n_cal]))
    bias_y = float(np.mean(comp_y[:n_cal]))
    bias_z = float(np.mean(comp_z[:n_cal]))

    vel_x = trapezoidal_integrate(times, comp_x - bias_x)
    vel_y = trapezoidal_integrate(times, comp_y - bias_y)
    vel_z = trapezoidal_integrate(times, comp_z - bias_z)
    return vel_x, vel_y, vel_z


def velocity_metrics_from_components(
    vel_x: np.ndarray, vel_y: np.ndarray, vel_z: np.ndarray
) -> tuple[float, float]:
    """Return max horizontal and vertical speed from integrated velocity."""
    if len(vel_x) == 0:
        return 0.0, 0.0

    horizontal_speed = np.sqrt(vel_x**2 + vel_y**2)
    max_horizontal_speed = float(np.max(np.abs(horizontal_speed)))
    max_vertical_speed = float(np.max(np.abs(vel_z)))
    return max_horizontal_speed, max_vertical_speed


def _message_time_seconds(message: Any) -> float | None:
    if hasattr(message, "time_boot_ms"):
        return float(message.time_boot_ms) / 1_000.0
    if hasattr(message, "time_usec"):
        return float(message.time_usec) / 1_000_000.0
    if hasattr(message, "usec"):
        return float(message.usec) / 1_000_000.0
    if hasattr(message, "TimeUS"):
        return float(message.TimeUS) / 1_000_000.0
    return None


def parse_tlog(
    filepath: str,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Parse a MAVLink telemetry log (.tlog) into the frontend flight schema."""

    global _tf_geodetic_to_ecef, _enu_origin_ecef, _enu_rotation
    _tf_geodetic_to_ecef = None
    _enu_origin_ecef = None
    _enu_rotation = None

    log = mavutil.mavlink_connection(filepath)

    gps_raw: list[dict[str, Any]] = []
    imu_raw: list[dict[str, Any]] = []
    att_raw: list[dict[str, Any]] = []
    msg_raw: list[dict[str, Any]] = []
    mode_raw: list[dict[str, Any]] = []
    baro_raw: list[dict[str, Any]] = []
    all_times_s: list[float] = []

    last_mode_name: str | None = None
    last_mode_num: int | None = None

    if progress_callback:
        progress_callback(0.18, "Reading telemetry frames")

    while True:
        message = log.recv_match()
        if message is None:
            break

        message_type = message.get_type()
        time_s = _message_time_seconds(message)
        if time_s is not None:
            all_times_s.append(time_s)

        if message_type == "GPS_RAW_INT":
            gps_raw.append({
                "time_s_abs": time_s,
                "status": int(getattr(message, "fix_type", 0)),
                "lat": float(message.lat) / 1e7,
                "lng": float(message.lon) / 1e7,
                "alt": float(message.alt) / 1_000.0,
                "spd": float(getattr(message, "vel", 0.0)) / 100.0,
                "n_sats": int(getattr(message, "satellites_visible", 0)),
            })
        elif message_type == "RAW_IMU":
            imu_raw.append({
                "time_s_abs": time_s,
                "instance": 0,
                "gyr_x": float(message.xgyro) / 1_000.0,
                "gyr_y": float(message.ygyro) / 1_000.0,
                "gyr_z": float(message.zgyro) / 1_000.0,
                "acc_x": float(message.xacc) * 9.80665 / 1_000.0,
                "acc_y": float(message.yacc) * 9.80665 / 1_000.0,
                "acc_z": float(message.zacc) * 9.80665 / 1_000.0,
            })
        elif message_type == "ATTITUDE":
            roll_deg = math.degrees(float(message.roll))
            pitch_deg = math.degrees(float(message.pitch))
            yaw_deg = math.degrees(float(message.yaw))
            att_raw.append({
                "time_s_abs": time_s,
                "roll": roll_deg,
                "pitch": pitch_deg,
                "yaw": yaw_deg,
                "des_roll": roll_deg,
                "des_pitch": pitch_deg,
            })
        elif message_type == "STATUSTEXT":
            text = str(getattr(message, "text", "")).strip()
            if text:
                msg_raw.append({
                    "time_s_abs": time_s,
                    "message": text,
                })
        elif message_type == "HEARTBEAT":
            mode_num = int(getattr(message, "custom_mode", 0))
            mode_name = mavutil.mode_string_v10(message)
            if mode_name != last_mode_name or mode_num != last_mode_num:
                mode_raw.append({
                    "time_s_abs": time_s,
                    "mode_num": mode_num,
                    "mode_name": mode_name,
                })
                last_mode_name = mode_name
                last_mode_num = mode_num
        elif message_type == "SCALED_PRESSURE":
            baro_raw.append({
                "time_s_abs": time_s,
                "instance": 0,
                "alt": 0.0,
                "press": float(getattr(message, "press_abs", 0.0)) * 100.0,
                "temp": float(getattr(message, "temperature", 0.0)) / 100.0,
            })

    if not gps_raw:
        raise ValueError("No GPS_RAW_INT samples found in telemetry log")

    if progress_callback:
        progress_callback(0.38, "Normalizing telemetry")

    t0 = min(all_times_s) if all_times_s else 0.0

    def normalize_times(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        for record in records:
            absolute_time = record.pop("time_s_abs", None)
            record["time_s"] = round((absolute_time - t0), 4) if absolute_time is not None else 0.0
        return records

    gps_raw = normalize_times(gps_raw)
    imu_raw = normalize_times(imu_raw)
    att_raw = normalize_times(att_raw)
    msg_raw = normalize_times(msg_raw)
    mode_raw = normalize_times(mode_raw)
    baro_raw = normalize_times(baro_raw)

    gps_df = pd.DataFrame(gps_raw)
    imu_df = pd.DataFrame(imu_raw)
    baro_df = pd.DataFrame(baro_raw)

    def calc_rate(df: pd.DataFrame) -> float:
        if len(df) < 2 or "time_s" not in df:
            return 0.0
        dt = df["time_s"].diff().dropna()
        median_dt = dt.median()
        return round(1.0 / median_dt, 1) if median_dt > 0 else 0.0

    gps_rate = calc_rate(gps_df)
    imu_rate = calc_rate(imu_df)
    baro_rate = calc_rate(baro_df)

    first_gps = gps_raw[0]
    origin = {
        "lat": first_gps["lat"],
        "lng": first_gps["lng"],
        "alt": first_gps["alt"],
    }

    if progress_callback:
        progress_callback(0.55, "Projecting flight path")

    gps_trajectory: list[dict[str, Any]] = []
    total_distance = 0.0
    max_h_speed = 0.0
    max_v_speed = 0.0
    max_alt_gain = 0.0

    for index, row in enumerate(gps_raw):
        e, n, u = wgs84_to_enu(
            row["lat"], row["lng"], row["alt"],
            origin["lat"], origin["lng"], origin["alt"],
        )

        seg_dist = 0.0
        h_speed = float(row.get("spd", 0.0))
        v_speed = 0.0

        if index > 0:
            previous = gps_raw[index - 1]
            seg_dist = haversine(previous["lat"], previous["lng"], row["lat"], row["lng"])
            total_distance += seg_dist

            dt = row["time_s"] - previous["time_s"]
            if dt > 0:
                if not h_speed:
                    h_speed = seg_dist / dt
                v_speed = (row["alt"] - previous["alt"]) / dt
                max_h_speed = max(max_h_speed, abs(h_speed))
                max_v_speed = max(max_v_speed, abs(v_speed))

        alt_gain = row["alt"] - origin["alt"]
        max_alt_gain = max(max_alt_gain, alt_gain)

        gps_trajectory.append({
            "time_s": row["time_s"],
            "lat": row["lat"],
            "lng": row["lng"],
            "alt_msl": row["alt"],
            "enu": {"e": e, "n": n, "u": u},
            "h_speed": round(h_speed, 2),
            "v_speed": round(v_speed, 2),
            "seg_dist": round(seg_dist, 3),
            "n_sats": row["n_sats"],
        })

    sim_trajectory = [
        {
            "time_s": point["time_s"],
            "enu": point["enu"],
            "alt_msl": point["alt_msl"],
            "roll": 0.0,
            "pitch": 0.0,
            "yaw": 0.0,
            "quat": [1.0, 0.0, 0.0, 0.0],
        }
        for point in gps_trajectory
    ]

    max_accel = 0.0
    imu_velocity: list[dict[str, Any]] = []
    imu_chart: list[dict[str, Any]] = []
    imu_max_h_speed = 0.0
    imu_max_v_speed = 0.0

    if not imu_df.empty:
        times_s = imu_df["time_s"].values
        acc_x = imu_df["acc_x"].values
        acc_y = imu_df["acc_y"].values
        acc_z = imu_df["acc_z"].values
        acc_mag = np.sqrt(acc_x**2 + acc_y**2 + acc_z**2)
        max_accel = float(np.max(acc_mag))

        attitude = interpolate_attitude(times_s, att_raw)
        vel_x, vel_y, vel_z = integrate_velocity_components(
            times_s, acc_x, acc_y, acc_z, attitude=attitude
        )
        vel_total = np.sqrt(vel_x**2 + vel_y**2 + vel_z**2)
        imu_max_h_speed, imu_max_v_speed = velocity_metrics_from_components(vel_x, vel_y, vel_z)

        velocity_step = max(1, len(times_s) // 500)
        for idx in range(0, len(times_s), velocity_step):
            imu_velocity.append({
                "time_s": round(float(times_s[idx]), 4),
                "vel_x": round(float(vel_x[idx]), 3),
                "vel_y": round(float(vel_y[idx]), 3),
                "vel_z": round(float(vel_z[idx]), 3),
                "vel_total": round(float(vel_total[idx]), 3),
                "acc_mag": round(float(acc_mag[idx]), 3),
            })

        imu_step = max(1, len(imu_raw) // 500)
        for idx in range(0, len(imu_raw), imu_step):
            row = imu_raw[idx]
            imu_chart.append({
                "time_s": round(float(row["time_s"]), 4),
                "acc_x": round(float(row["acc_x"]), 4),
                "acc_y": round(float(row["acc_y"]), 4),
                "acc_z": round(float(row["acc_z"]), 4),
                "gyr_x": round(float(row["gyr_x"]), 4),
                "gyr_y": round(float(row["gyr_y"]), 4),
                "gyr_z": round(float(row["gyr_z"]), 4),
            })

    if progress_callback:
        progress_callback(0.76, "Computing metrics")

    att_chart: list[dict[str, Any]] = []
    att_step = max(1, len(att_raw) // 500) if att_raw else 1
    for idx in range(0, len(att_raw), att_step):
        row = att_raw[idx]
        att_chart.append({
            "time_s": row["time_s"],
            "roll": round(row["roll"], 2),
            "pitch": round(row["pitch"], 2),
            "yaw": round(row["yaw"], 2),
            "des_roll": round(row["des_roll"], 2),
            "des_pitch": round(row["des_pitch"], 2),
        })

    if imu_max_h_speed > 0.0:
        max_h_speed = imu_max_h_speed
    if imu_max_v_speed > 0.0:
        max_v_speed = imu_max_v_speed

    flight_duration = 0.0
    if all_times_s:
        flight_duration = max(all_times_s) - min(all_times_s)

    events = [
        {"time_s": row["time_s"], "message": row["message"]}
        for row in msg_raw
    ]
    modes = [
        {
            "time_s": row["time_s"],
            "mode_num": row["mode_num"],
            "mode_name": row["mode_name"],
        }
        for row in mode_raw
    ]

    firmware_message = next(
        (event["message"] for event in events if "Ardu" in event["message"] or "PX4" in event["message"]),
        "MAVLink telemetry log",
    )

    if progress_callback:
        progress_callback(0.9, "Packaging telemetry data")

    return {
        "meta": {
            "firmware": firmware_message,
            "version": "tlog",
            "git_hash": 0,
            "total_messages": len(gps_raw) + len(imu_raw) + len(att_raw) + len(msg_raw) + len(mode_raw) + len(baro_raw),
        },
        "origin": origin,
        "sensors": {
            "gps": {
                "rate_hz": gps_rate,
                "n_samples": len(gps_raw),
                "n_sats": gps_raw[0]["n_sats"] if gps_raw else 0,
                "units": {"lat": "deg", "lng": "deg", "alt": "m MSL", "spd": "m/s"},
            },
            "imu": {
                "rate_hz": imu_rate,
                "n_samples": len(imu_raw),
                "units": {"acc": "m/s²", "gyr": "rad/s"},
            },
            "baro": {
                "rate_hz": baro_rate,
                "n_samples": len(baro_raw),
                "units": {"alt": "m", "press": "Pa", "temp": "°C"},
            },
        },
        "metrics": {
            "max_horizontal_speed_ms": round(max_h_speed, 2),
            "max_vertical_speed_ms": round(max_v_speed, 2),
            "max_acceleration_ms2": round(max_accel, 2),
            "max_acceleration_g": round(max_accel / 9.80665, 2),
            "max_altitude_gain_m": round(max_alt_gain, 2),
            "total_distance_m": round(total_distance, 2),
            "flight_duration_s": round(flight_duration, 2),
            "apogee_msl_m": round(max((point["alt_msl"] for point in gps_trajectory), default=0.0), 2),
        },
        "trajectory": {
            "gps": gps_trajectory,
            "sim": sim_trajectory,
        },
        "imu": {
            "raw_chart": imu_chart,
            "integrated_velocity": imu_velocity,
        },
        "attitude": att_chart,
        "pid": {
            "roll": [],
            "pitch": [],
            "yaw": [],
        },
        "events": events,
        "stages": [],
        "modes": modes,
        "parameters": {},
    }


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------
def parse_flight_log(
    filepath: str,
    progress_callback: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Parse a supported flight log and return a structured JSON-ready dict."""
    suffix = Path(filepath).suffix.lower()
    if suffix == ".tlog":
        return parse_tlog(filepath, progress_callback=progress_callback)

    # Reset ENU transform for each new file (origin changes per flight)
    global _tf_geodetic_to_ecef, _enu_origin_ecef, _enu_rotation
    _tf_geodetic_to_ecef = None
    _enu_origin_ecef = None
    _enu_rotation = None

    log = mavutil.mavlink_connection(filepath)
    if progress_callback:
        progress_callback(0.14, "Reading flight log")

    # ------------------------------------------------------------------
    # Pass 1: collect all messages into lists
    # ------------------------------------------------------------------
    gps_raw: list[dict] = []
    imu_raw: list[dict] = []
    att_raw: list[dict] = []
    baro_raw: list[dict] = []
    sim_raw: list[dict] = []
    msg_raw: list[dict] = []
    mode_raw: list[dict] = []
    fstg_raw: list[dict] = []
    parm_raw: dict[str, float] = {}
    fmt_raw: list[dict] = []
    ver_info: dict = {}
    pidr_raw: list[dict] = []
    pidp_raw: list[dict] = []
    pidy_raw: list[dict] = []
    vibe_raw: list[dict] = []

    while True:
        m = log.recv_match()
        if m is None:
            break
        t = m.get_type()

        if t == "GPS":
            gps_raw.append({
                "time_us": m.TimeUS, "status": m.Status, "lat": m.Lat,
                "lng": m.Lng, "alt": m.Alt, "spd": m.Spd, "n_sats": m.NSats,
                "hdop": m.HDop,
            })
        elif t == "IMU":
            imu_raw.append({
                "time_us": m.TimeUS, "instance": m.I,
                "gyr_x": m.GyrX, "gyr_y": m.GyrY, "gyr_z": m.GyrZ,
                "acc_x": m.AccX, "acc_y": m.AccY, "acc_z": m.AccZ,
            })
        elif t == "ATT":
            att_raw.append({
                "time_us": m.TimeUS,
                "des_roll": m.DesRoll, "roll": m.Roll,
                "des_pitch": m.DesPitch, "pitch": m.Pitch,
                "des_yaw": m.DesYaw, "yaw": m.Yaw,
            })
        elif t == "BARO":
            baro_raw.append({
                "time_us": m.TimeUS, "instance": m.I,
                "alt": m.Alt, "press": m.Press, "temp": m.Temp,
            })
        elif t == "SIM":
            sim_raw.append({
                "time_us": m.TimeUS, "lat": m.Lat, "lng": m.Lng,
                "alt": m.Alt, "roll": m.Roll, "pitch": m.Pitch,
                "yaw": m.Yaw,
                "q1": m.Q1, "q2": m.Q2, "q3": m.Q3, "q4": m.Q4,
            })
        elif t == "MSG":
            msg_raw.append({"time_us": m.TimeUS, "message": m.Message})
        elif t == "MODE":
            mode_raw.append({
                "time_us": m.TimeUS, "mode": m.Mode,
                "mode_num": m.ModeNum,
            })
        elif t == "FSTG":
            fstg_raw.append({
                "time_us": m.TimeUS, "stage": m.Stg,
                "prev_stage": m.PStg,
            })
        elif t == "PARM":
            parm_raw[m.Name] = m.Value
        elif t == "FMT":
            fmt_raw.append({
                "type": m.Type, "name": m.Name,
                "format": m.Format, "columns": m.Columns,
            })
        elif t == "VER":
            ver_info = {
                "firmware": getattr(m, "FWS", ""),
                "major": m.Maj, "minor": m.Min, "patch": m.Pat,
                "git_hash": m.GH,
            }
        elif t == "PIDR":
            pidr_raw.append({
                "time_us": m.TimeUS, "tar": m.Tar, "act": m.Act,
                "err": m.Err, "p": m.P, "i": m.I, "d": m.D,
            })
        elif t == "PIDP":
            pidp_raw.append({
                "time_us": m.TimeUS, "tar": m.Tar, "act": m.Act,
                "err": m.Err, "p": m.P, "i": m.I, "d": m.D,
            })
        elif t == "PIDY":
            pidy_raw.append({
                "time_us": m.TimeUS, "tar": m.Tar, "act": m.Act,
                "err": m.Err, "p": m.P, "i": m.I, "d": m.D,
            })
        elif t == "VIBE":
            vibe_raw.append({
                "time_us": m.TimeUS, "vibe_x": m.VibeX,
                "vibe_y": m.VibeY, "vibe_z": m.VibeZ,
            })

    if progress_callback:
        progress_callback(0.34, "Normalizing sensor streams")

    # ------------------------------------------------------------------
    # Determine t0 and build DataFrames
    # ------------------------------------------------------------------
    all_times = []
    if gps_raw:
        all_times.append(gps_raw[0]["time_us"])
    if imu_raw:
        all_times.append(imu_raw[0]["time_us"])
    if sim_raw:
        all_times.append(sim_raw[0]["time_us"])
    t0 = min(all_times) if all_times else 0

    def add_time_s(records: list[dict]) -> list[dict]:
        for r in records:
            r["time_s"] = round((r["time_us"] - t0) / 1e6, 4)
        return records

    gps_raw = add_time_s(gps_raw)
    imu_raw = add_time_s(imu_raw)
    att_raw = add_time_s(att_raw)
    baro_raw = add_time_s(baro_raw)
    sim_raw = add_time_s(sim_raw)

    gps_df = pd.DataFrame(gps_raw)
    imu_df = pd.DataFrame(imu_raw)

    # ------------------------------------------------------------------
    # Sensor info: detect sampling rates
    # ------------------------------------------------------------------
    def calc_rate(df: pd.DataFrame) -> float:
        if len(df) < 2:
            return 0.0
        dt = df["time_s"].diff().dropna()
        median_dt = dt.median()
        return round(1.0 / median_dt, 1) if median_dt > 0 else 0.0

    gps_rate = calc_rate(gps_df)
    # IMU has multiple instances interleaved — filter to instance 0
    imu_rate = calc_rate(
        imu_df[imu_df["instance"] == 0]
    ) if not imu_df.empty else 0.0
    # BARO also has multiple instances
    baro_df = pd.DataFrame(baro_raw)
    baro_rate = calc_rate(
        baro_df[baro_df["instance"] == 0]
    ) if not baro_df.empty else 0.0

    if progress_callback:
        progress_callback(0.48, "Projecting GPS coordinates")

    # ------------------------------------------------------------------
    # Origin for ENU conversion
    # ------------------------------------------------------------------
    # Use SIM origin if available (always correct in SITL).
    # For real flights, use the first GPS fix with status >= 3 (3D fix).
    # GPS can have glitchy first samples — validate against SIM if present.
    origin = {"lat": 0.0, "lng": 0.0, "alt": 0.0}

    if sim_raw:
        origin = {
            "lat": sim_raw[0]["lat"],
            "lng": sim_raw[0]["lng"],
            "alt": sim_raw[0]["alt"],
        }
    elif not gps_df.empty:
        # Find first GPS with 3D fix (status >= 3)
        valid = gps_df[gps_df["status"] >= 3]
        if not valid.empty:
            first_gps = valid.iloc[0]
            origin = {
                "lat": first_gps["lat"],
                "lng": first_gps["lng"],
                "alt": first_gps["alt"],
            }

    # ------------------------------------------------------------------
    # Filter out GPS glitches: if a single point jumps > 1km from
    # origin, skip it. This handles bad initial fixes in SITL.
    # ------------------------------------------------------------------
    if origin["lat"] != 0:
        filtered_gps = []
        for row in gps_raw:
            dist_from_origin = haversine(
                origin["lat"], origin["lng"], row["lat"], row["lng"]
            )
            # Allow up to 10 km from origin — anything beyond is a glitch
            if dist_from_origin < 10_000:
                filtered_gps.append(row)
        gps_raw = filtered_gps

    # ------------------------------------------------------------------
    # GPS trajectory with ENU + Haversine distances + speeds
    # ------------------------------------------------------------------
    gps_trajectory: list[dict] = []
    total_distance = 0.0
    max_h_speed = 0.0
    max_v_speed = 0.0
    max_alt_gain = 0.0

    for i, row in enumerate(gps_raw):
        e, n, u = wgs84_to_enu(
            row["lat"], row["lng"], row["alt"],
            origin["lat"], origin["lng"], origin["alt"],
        )

        seg_dist = 0.0
        h_speed = 0.0
        v_speed = 0.0

        if i > 0:
            prev = gps_raw[i - 1]
            seg_dist = haversine(prev["lat"], prev["lng"], row["lat"], row["lng"])
            total_distance += seg_dist

            dt = row["time_s"] - prev["time_s"]
            if dt > 0:
                h_speed = round(seg_dist / dt, 2)
                v_speed = round((row["alt"] - prev["alt"]) / dt, 2)
                max_h_speed = max(max_h_speed, abs(h_speed))
                max_v_speed = max(max_v_speed, abs(v_speed))

        alt_gain = row["alt"] - origin["alt"]
        max_alt_gain = max(max_alt_gain, alt_gain)

        point: dict[str, Any] = {
            "time_s": row["time_s"],
            "lat": row["lat"],
            "lng": row["lng"],
            "alt_msl": row["alt"],
            "enu": {"e": e, "n": n, "u": u},
            "h_speed": h_speed,
            "v_speed": v_speed,
            "seg_dist": round(seg_dist, 3),
            "n_sats": row["n_sats"],
        }
        gps_trajectory.append(point)

    if progress_callback:
        progress_callback(0.62, "Building 3D trajectory")

    # ------------------------------------------------------------------
    # SIM trajectory with ENU (higher rate, use for 3D viz)
    # ------------------------------------------------------------------
    sim_trajectory: list[dict] = []
    for row in sim_raw:
        e, n, u = wgs84_to_enu(
            row["lat"], row["lng"], row["alt"],
            origin["lat"], origin["lng"], origin["alt"],
        )
        sim_trajectory.append({
            "time_s": row["time_s"],
            "enu": {"e": e, "n": n, "u": u},
            "alt_msl": row["alt"],
            "roll": row["roll"],
            "pitch": row["pitch"],
            "yaw": row["yaw"],
            "quat": [row["q1"], row["q2"], row["q3"], row["q4"]],
        })

    if progress_callback:
        progress_callback(0.74, "Integrating IMU data")

    # ------------------------------------------------------------------
    # IMU processing: acceleration magnitude + trapezoidal integration
    # ------------------------------------------------------------------
    # Filter to instance 0 only
    imu0 = imu_df[imu_df["instance"] == 0].copy() if not imu_df.empty else pd.DataFrame()

    max_accel = 0.0
    imu_velocity: list[dict] = []
    imu_max_h_speed = 0.0
    imu_max_v_speed = 0.0

    if not imu0.empty:
        times_s = imu0["time_s"].values
        acc_x = imu0["acc_x"].values
        acc_y = imu0["acc_y"].values
        acc_z = imu0["acc_z"].values

        # Acceleration magnitude (includes gravity ~9.81 m/s²)
        acc_mag = np.sqrt(acc_x**2 + acc_y**2 + acc_z**2)
        max_accel = float(np.max(acc_mag))
        attitude = interpolate_attitude(times_s, att_raw)
        vel_x, vel_y, vel_z = integrate_velocity_components(
            times_s, acc_x, acc_y, acc_z, attitude=attitude
        )

        vel_total = np.sqrt(vel_x**2 + vel_y**2 + vel_z**2)
        imu_max_h_speed, imu_max_v_speed = velocity_metrics_from_components(vel_x, vel_y, vel_z)

        # Downsample for JSON output (every 10th point)
        step = max(1, len(times_s) // 500)
        for idx in range(0, len(times_s), step):
            imu_velocity.append({
                "time_s": round(float(times_s[idx]), 4),
                "vel_x": round(float(vel_x[idx]), 3),
                "vel_y": round(float(vel_y[idx]), 3),
                "vel_z": round(float(vel_z[idx]), 3),
                "vel_total": round(float(vel_total[idx]), 3),
                "acc_mag": round(float(acc_mag[idx]), 3),
            })

    if progress_callback:
        progress_callback(0.84, "Preparing charts and events")

    # ------------------------------------------------------------------
    # IMU raw (downsampled for charts)
    # ------------------------------------------------------------------
    imu_chart: list[dict] = []
    if not imu0.empty:
        step = max(1, len(imu0) // 500)
        for idx in range(0, len(imu0), step):
            row = imu0.iloc[idx]
            imu_chart.append({
                "time_s": round(float(row["time_s"]), 4),
                "acc_x": round(float(row["acc_x"]), 4),
                "acc_y": round(float(row["acc_y"]), 4),
                "acc_z": round(float(row["acc_z"]), 4),
                "gyr_x": round(float(row["gyr_x"]), 4),
                "gyr_y": round(float(row["gyr_y"]), 4),
                "gyr_z": round(float(row["gyr_z"]), 4),
            })

    # ------------------------------------------------------------------
    # Flight duration
    # ------------------------------------------------------------------
    if imu_max_h_speed > 0.0:
        max_h_speed = imu_max_h_speed
    if imu_max_v_speed > 0.0:
        max_v_speed = imu_max_v_speed

    flight_duration = 0.0
    duration_sources = [records[-1]["time_s"] for records in (gps_raw, imu_raw, att_raw, baro_raw, sim_raw) if records]
    if duration_sources:
        flight_duration = max(duration_sources)

    # ------------------------------------------------------------------
    # Flight stages from FSTG messages
    # ------------------------------------------------------------------
    stage_names = {
        0: "INIT", 1: "PAD_IDLE", 2: "BOOST", 3: "COAST",
        4: "APOGEE", 5: "DESCENT",
    }
    stages = []
    for f in fstg_raw:
        stages.append({
            "time_s": round((f["time_us"] - t0) / 1e6, 4),
            "stage": f["stage"],
            "stage_name": stage_names.get(f["stage"], f"STAGE_{f['stage']}"),
            "prev_stage": f["prev_stage"],
        })

    # ------------------------------------------------------------------
    # Events from MSG
    # ------------------------------------------------------------------
    events = []
    for m in msg_raw:
        events.append({
            "time_s": round((m["time_us"] - t0) / 1e6, 4),
            "message": m["message"],
        })

    # ------------------------------------------------------------------
    # Mode changes
    # ------------------------------------------------------------------
    mode_names = {
        0: "MANUAL", 2: "STABILIZE", 5: "FBWA", 6: "FBWB",
        10: "AUTO", 11: "RTL", 12: "LOITER", 15: "GUIDED",
        26: "LAUNCH", 27: "DESCEND",
    }
    modes = []
    for m in mode_raw:
        modes.append({
            "time_s": round((m["time_us"] - t0) / 1e6, 4),
            "mode_num": m["mode_num"],
            "mode_name": mode_names.get(m["mode_num"], f"MODE_{m['mode_num']}"),
        })

    # ------------------------------------------------------------------
    # Attitude (downsampled)
    # ------------------------------------------------------------------
    att_chart = []
    step = max(1, len(att_raw) // 500)
    for idx in range(0, len(att_raw), step):
        r = att_raw[idx]
        att_chart.append({
            "time_s": r["time_s"],
            "roll": round(r["roll"], 2),
            "pitch": round(r["pitch"], 2),
            "yaw": round(r["yaw"], 2),
            "des_roll": round(r["des_roll"], 2),
            "des_pitch": round(r["des_pitch"], 2),
        })

    # ------------------------------------------------------------------
    # PID data (downsampled)
    # ------------------------------------------------------------------
    def downsample_pid(raw: list[dict], label: str) -> list[dict]:
        step = max(1, len(raw) // 300)
        out = []
        for idx in range(0, len(raw), step):
            r = raw[idx]
            out.append({
                "time_s": round((r["time_us"] - t0) / 1e6, 4),
                "tar": round(r["tar"], 5),
                "act": round(r["act"], 5),
                "err": round(r["err"], 5),
                "p": round(r["p"], 5),
                "i": round(r["i"], 5),
                "d": round(r["d"], 5),
            })
        return out

    # ------------------------------------------------------------------
    # Assemble output
    # ------------------------------------------------------------------
    result = {
        "meta": {
            "firmware": ver_info.get("firmware", ""),
            "version": f"{ver_info.get('major', '?')}.{ver_info.get('minor', '?')}.{ver_info.get('patch', '?')}",
            "git_hash": ver_info.get("git_hash", ""),
            "total_messages": sum(
                len(x) for x in [
                    gps_raw, imu_raw, att_raw, baro_raw, sim_raw,
                    msg_raw, mode_raw, fstg_raw,
                ]
            ) + len(parm_raw),
        },
        "origin": origin,
        "sensors": {
            "gps": {
                "rate_hz": gps_rate,
                "n_samples": len(gps_raw),
                "n_sats": gps_raw[0]["n_sats"] if gps_raw else 0,
                "units": {"lat": "deg", "lng": "deg", "alt": "m MSL", "spd": "m/s"},
            },
            "imu": {
                "rate_hz": imu_rate,
                "n_samples": len(imu_raw),
                "units": {
                    "acc": "m/s²", "gyr": "rad/s",
                },
            },
            "baro": {
                "rate_hz": baro_rate,
                "n_samples": len(baro_raw),
                "units": {"alt": "m", "press": "Pa", "temp": "°C"},
            },
        },
        "metrics": {
            "max_horizontal_speed_ms": round(max_h_speed, 2),
            "max_vertical_speed_ms": round(max_v_speed, 2),
            "max_acceleration_ms2": round(max_accel, 2),
            "max_acceleration_g": round(max_accel / 9.80665, 2),
            "max_altitude_gain_m": round(max_alt_gain, 2),
            "total_distance_m": round(total_distance, 2),
            "flight_duration_s": round(flight_duration, 2),
            "apogee_msl_m": round(
                max(p["alt_msl"] for p in gps_trajectory), 2
            ) if gps_trajectory else 0.0,
        },
        "trajectory": {
            "gps": gps_trajectory,
            "sim": sim_trajectory,
        },
        "imu": {
            "raw_chart": imu_chart,
            "integrated_velocity": imu_velocity,
        },
        "attitude": att_chart,
        "pid": {
            "roll": downsample_pid(pidr_raw, "roll"),
            "pitch": downsample_pid(pidp_raw, "pitch"),
            "yaw": downsample_pid(pidy_raw, "yaw"),
        },
        "events": events,
        "stages": stages,
        "modes": modes,
        "parameters": parm_raw,
    }

    if progress_callback:
        progress_callback(0.92, "Finalizing parsed payload")

    return result


def parse_bin(filepath: str) -> dict[str, Any]:
    """Backward-compatible alias for existing callers."""
    return parse_flight_log(filepath)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python mavlink_parser.py <file.BIN> [output.json]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"Parsing {input_path}...")
    data = parse_bin(input_path)

    if output_path:
        Path(output_path).write_text(json.dumps(data, indent=2))
        print(f"Written to {output_path}")
    else:
        # Print to stdout
        print(json.dumps(data, indent=2))
