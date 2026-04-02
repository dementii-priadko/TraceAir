import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatAcceleration, formatNumber } from '../../utils/format'
import type { ImuChartPoint } from '../../utils/flightAdapters'
import { SectionCard } from '../layout/SectionCard'

export type ImuChartProps = {
  data: ImuChartPoint[]
}

export function ImuChart({ data }: ImuChartProps) {
  return (
    <SectionCard
      title="IMU Acceleration"
      description="Accelerometer axes from the raw IMU stream."
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
              tickFormatter={(value: number) => formatNumber(value, 1)}
              stroke="#334155"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#020617',
                border: '1px solid #1e293b',
                borderRadius: 16,
              }}
              formatter={(value, name) => [
                formatAcceleration(typeof value === 'number' ? value : 0),
                String(name).replace('acc_', 'ACC ').toUpperCase(),
              ]}
              labelFormatter={(label) =>
                `T+${formatNumber(typeof label === 'number' ? label : 0, 1)} s`
              }
            />
            <Line type="monotone" dataKey="acc_x" stroke="#38bdf8" dot={false} />
            <Line type="monotone" dataKey="acc_y" stroke="#a78bfa" dot={false} />
            <Line type="monotone" dataKey="acc_z" stroke="#f43f5e" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}
