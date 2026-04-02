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
      title="Velocity"
      description="Horizontal and vertical speed trends derived from GPS telemetry."
    >
      <div className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
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
              stroke="#e7c66c"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="vertical_speed"
              name="vertical_speed"
              stroke="#dd8d52"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}
