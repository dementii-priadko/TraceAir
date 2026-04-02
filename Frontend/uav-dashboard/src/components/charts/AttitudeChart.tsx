import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber } from '../../utils/format'
import type { AttitudeChartPoint } from '../../utils/flightAdapters'
import { SectionCard } from '../layout/SectionCard'

export type AttitudeChartProps = {
  data: AttitudeChartPoint[]
}

export function AttitudeChart({ data }: AttitudeChartProps) {
  return (
    <SectionCard
      title="Attitude"
      description="Roll / pitch / yaw"
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#1a2030" strokeDasharray="3 3" />
            <XAxis
              dataKey="time_s"
              tick={{ fill: '#586577', fontSize: 12 }}
              tickFormatter={(value: number) => `${formatNumber(value, 0)}s`}
              stroke="#1a2030"
            />
            <YAxis
              tick={{ fill: '#586577', fontSize: 12 }}
              tickFormatter={(value: number) => `${formatNumber(value, 0)}°`}
              stroke="#1a2030"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #1a2030',
                borderRadius: 6,
              }}
              formatter={(value, name) => [
                `${formatNumber(typeof value === 'number' ? value : 0, 1)}°`,
                String(name).toUpperCase(),
              ]}
              labelFormatter={(label) =>
                `T+${formatNumber(typeof label === 'number' ? label : 0, 1)} s`
              }
            />
            <Line type="monotone" dataKey="roll" stroke="#38bdf8" dot={false} />
            <Line type="monotone" dataKey="pitch" stroke="#22c55e" dot={false} />
            <Line type="monotone" dataKey="yaw" stroke="#f97316" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}
