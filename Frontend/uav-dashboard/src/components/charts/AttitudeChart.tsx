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
      title="Attitude Tracking"
      description="Observed roll, pitch, and yaw through the flight profile."
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
              tickFormatter={(value: number) => `${formatNumber(value, 0)}°`}
              stroke="#334155"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#020617',
                border: '1px solid #1e293b',
                borderRadius: 16,
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
