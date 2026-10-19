// Dashboard charts. Status colours are reserved for pass / warning / fail and are
// always paired with a legend label; categorical series use a fixed, validated order.
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ManagerStats, TrendPoint } from '@/types';

export const STATUS_COLORS = { passed: '#0ca30c', warnings: '#fab219', failed: '#d03b3b' };
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

const axis = { stroke: '#94a3b8', fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="#e2e8f0" strokeDasharray="0" vertical={false} />;
const tooltipStyle = { contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)' }, cursor: { fill: 'rgb(148 163 184 / 0.12)' } };
// Legend keeps series order and uses neutral text ink (colour carries identity via the swatch only).
const legend = <Legend iconType="circle" iconSize={8} itemSorter={null} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(v) => <span style={{ color: '#475569' }}>{v}</span>} />;

export function ValidationTrendChart({ data, height = 260 }: { data: TrendPoint[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Validation outcomes per week: passed, passed with warnings and failed runs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
          {grid}
          <XAxis dataKey="label" {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip {...tooltipStyle} />
          {legend}
          <Bar dataKey="passed" name="Passed" stackId="a" fill={STATUS_COLORS.passed} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="warnings" name="Passed with warnings" stackId="a" fill={STATUS_COLORS.warnings} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="failed" name="Failed" stackId="a" fill={STATUS_COLORS.failed} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectStatusChart({ data, height = 260 }: { data: ManagerStats['byProject']; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label="Document status by project">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...axis} />
          <YAxis type="category" dataKey="projectCode" width={78} {...axis} />
          <Tooltip {...tooltipStyle} labelFormatter={(l, p) => (p?.[0]?.payload as { projectName?: string })?.projectName ?? String(l)} />
          {legend}
          <Bar dataKey="inProgress" name="In progress" stackId="p" fill={SERIES[0]} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="awaiting" name="Awaiting approval" stackId="p" fill={SERIES[1]} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="approved" name="Approved" stackId="p" fill={SERIES[2]} stroke="#fff" strokeWidth={1} />
          <Bar dataKey="changes" name="Changes requested" stackId="p" fill={SERIES[3]} stroke="#fff" strokeWidth={1} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
