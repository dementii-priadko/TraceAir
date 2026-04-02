import type { FlightAnalysis } from '../types/flight'

export const mockAnalysis: FlightAnalysis = {
  id: 'mock-flight',
  model: 'local-mock',
  summary: `## General analysis

This local fallback dataset represents a nominal test flight used for frontend development when the backend API is unavailable.

## Key metrics

- Apogee near 2424.5 m MSL
- Peak acceleration near 28.7 m/s²
- Flight duration about 118.6 s

## Flight phases

The mock sequence includes preflight, boost, coast, recovery, and touchdown events so the timeline, summary cards, and charts stay representative.

## Anomaly detection

No anomalies are encoded in the fallback payload. Use backend-driven analysis for real mission diagnostics.`,
}
