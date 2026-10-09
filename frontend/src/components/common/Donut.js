import { Cell, Pie, PieChart } from "recharts";
import { fmtPct } from "@/lib/format";

export const DONUT_COLORS = ["#f59e0b", "#6366f1", "#10b981", "#06b6d4", "#ec4899", "#ef4444", "#8b5cf6"];

export function donutData(items, max = 4) {
  const total = items.reduce((s, a) => s + a.value, 0) || 1;
  const top = items.slice(0, max);
  const rest = items.slice(max).reduce((s, a) => s + a.value, 0);
  const rows = rest > 0 ? [...top, { name: "Others", value: rest }] : top;
  return rows.map((r) => ({ ...r, pct: (r.value / total) * 100 }));
}

export function Donut({ data, size = 140, thickness = 16 }) {
  const rows = data.length ? data : [{ name: "Empty", value: 1 }];
  return (
    <div style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie data={rows} dataKey="value" innerRadius={size / 2 - thickness} outerRadius={size / 2} stroke="none" paddingAngle={data.length > 1 ? 2 : 0} startAngle={90} endAngle={-270} isAnimationActive>
            {rows.map((r, i) => <Cell key={r.name} fill={data.length ? DONUT_COLORS[i % DONUT_COLORS.length] : "#1f2937"} />)}
          </Pie>
        </PieChart>
    </div>
  );
}

export function DonutLegend({ data, valueFmt }) {
  return (
    <div className="space-y-2 flex-1">
      {data.map((d, i) => (
        <div key={d.name} className="grid grid-cols-[12px_1fr_auto_56px] gap-2 items-center text-xs">
          <span className="w-2 h-2 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
          <span className="text-gray-300">{d.name}</span>
          <span className="font-num text-gray-400">{valueFmt(d.value)}</span>
          <span className="font-num text-gray-500 text-right">{fmtPct(d.pct, false)}</span>
        </div>
      ))}
    </div>
  );
}
