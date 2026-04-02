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
  className?: string
}

export function AltitudeChart({ data, className = '' }: AltitudeChartProps) {
  return (
    <SectionCard
      title="Altitude"
      description="Altitude above mean sea level sampled from the GPS track."
      className={className}
    >
      <div className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="altitudeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dd8d52" stopOpacity={0.42} />
                <stop offset="100%" stopColor="#dd8d52" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(246,232,205,0.08)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="time_s"
              tick={{ fill: '#8a8378', fontSize: 12 }}
              tickFormatter={(value: number) => `${formatNumber(value, 0)}s`}
              stroke="rgba(246,232,205,0.1)"
            />
            <YAxis
              tick={{ fill: '#8a8378', fontSize: 12 }}
              tickFormatter={(value: number) => formatNumber(value, 0)}
              stroke="rgba(246,232,205,0.1)"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(17, 19, 22, 0.96)',
                border: '1px solid rgba(246,232,205,0.12)',
                borderRadius: 16,
                color: '#f4eee1',
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
              stroke="#dd8d52"
              strokeWidth={2.5}
              fill="url(#altitudeFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}
