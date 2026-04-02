import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber, formatSpeed } from '../../utils/format'
import type { SpeedChartPoint } from '../../utils/flightAdapters'
import { SectionCard } from '../layout/SectionCard'

export type SpeedChartProps = {
  data: SpeedChartPoint[]
}

export function SpeedChart({ data }: SpeedChartProps) {
  return (
    <SectionCard
      title="Velocity Envelope"
      description="Horizontal and vertical speed from the GPS trajectory."
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
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
              formatter={(value, name) => [
                formatSpeed(typeof value === 'number' ? value : 0),
                name === 'horizontal_speed' ? 'Horizontal' : 'Vertical',
              ]}
              labelFormatter={(label) =>
                `T+${formatNumber(typeof label === 'number' ? label : 0, 1)} s`
              }
            />
            <Line
              type="monotone"
              dataKey="horizontal_speed"
              name="horizontal_speed"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="vertical_speed"
              name="vertical_speed"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}
