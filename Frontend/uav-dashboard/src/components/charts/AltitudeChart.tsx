import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMeters, formatNumber } from '../../utils/format'
import type { AltitudeChartPoint } from '../../utils/flightAdapters'
import { SectionCard } from '../layout/SectionCard'

export type AltitudeChartProps = {
  data: AltitudeChartPoint[]
}

export function AltitudeChart({ data }: AltitudeChartProps) {
  return (
    <SectionCard
      title="Altitude Profile"
      description="GPS-derived altitude over mission time."
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="altitudeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="time_s"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(value: number) => `${formatNumber(value, 0)}s`}
              stroke="#334155"
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(value: number) => formatNumber(value, 0)}
              stroke="#334155"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#020617',
                border: '1px solid #1e293b',
                borderRadius: 16,
              }}
              formatter={(value) => [
                formatMeters(typeof value === 'number' ? value : 0),
                'Altitude MSL',
              ]}
              labelFormatter={(label) =>
                `T+${formatNumber(typeof label === 'number' ? label : 0, 1)} s`
              }
            />
            <Area
              type="monotone"
              dataKey="altitude_msl"
              stroke="#38bdf8"
              strokeWidth={2}
              fill="url(#altitudeFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}
