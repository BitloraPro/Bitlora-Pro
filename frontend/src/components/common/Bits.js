import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/format";

export function Sparkline({ data, width = 120, height = 36, className, strokeWidth = 1.5 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} className={className} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - ((v - min) / range) * (height - 4) - 2]);
  const up = data[data.length - 1] >= data[0];
  const color = up ? "#10b981" : "#ef4444";
  const line = pts.map((p) => p.join(",")).join(" ");
  const id = `sg-${up ? "u" : "d"}-${width}-${height}`;
  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${line} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

export function Change({ value, className, badge }) {
  const up = value >= 0;
  if (badge)
    return (
      <span className={cn("font-num text-xs px-2 py-1 rounded-md", up ? "bg-[#10b981] text-white" : "bg-[#ef4444] text-white", className)}>{fmtPct(value)}</span>
    );
  return <span className={cn("font-num", up ? "text-up" : "text-down", className)}>{fmtPct(value)}</span>;
}

export function StatusBadge({ status, className }) {
  const map = {
    active: "bg-up text-up", verified: "bg-up text-up", completed: "bg-up text-up", filled: "bg-up text-up", healthy: "bg-up text-up", success: "bg-up text-up", resolved: "bg-up text-up", open: "bg-[#f59e0b1f] text-[#f59e0b]",
    pending: "bg-[#f59e0b1f] text-[#f59e0b]", warning: "bg-[#f59e0b1f] text-[#f59e0b]", degraded: "bg-[#f59e0b1f] text-[#f59e0b]", medium: "bg-[#f59e0b1f] text-[#f59e0b]", live: "bg-down text-down",
    rejected: "bg-down text-down", suspended: "bg-down text-down", banned: "bg-down text-down", failed: "bg-down text-down", canceled: "bg-[#374151] text-gray-300", down: "bg-down text-down", high: "bg-down text-down",
    liquidated: "bg-down text-down", closed: "bg-[#374151] text-gray-300", unverified: "bg-[#374151] text-gray-300", low: "bg-up text-up", deposit: "bg-up text-up", withdrawal: "bg-down text-down", transfer: "bg-[#3b82f61f] text-[#60a5fa]", bonus: "bg-[#f59e0b1f] text-[#f59e0b]",
  };
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium capitalize", map[status] || "bg-[#374151] text-gray-300", className)}>{status}</span>;
}

export function Empty({ text = "No records yet", className }) {
  return <div className={cn("py-10 text-center text-sm text-gray-500", className)}>{text}</div>;
}
