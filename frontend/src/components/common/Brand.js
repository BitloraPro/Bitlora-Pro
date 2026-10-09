import { useState } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className = "w-8 h-8" }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="bl-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fcd34d" />
          <stop offset="0.55" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <path d="M11 4h12.5c5 0 8.5 3 8.5 7.4 0 2.8-1.4 4.9-3.6 6 3.1 1 5.1 3.6 5.1 7 0 5-4 8.6-9.7 8.6H11z" fill="url(#bl-g)" />
      <path d="M17 10.5h5.6c1.9 0 3.1 1.1 3.1 2.8s-1.2 2.9-3.1 2.9H17zM17 21.4h6.4c2.2 0 3.6 1.2 3.6 3.1 0 1.9-1.4 3.1-3.6 3.1H17z" fill="#0b0f19" />
      <rect x="14" y="1" width="3" height="5" rx="1" fill="url(#bl-g)" />
      <rect x="20" y="1" width="3" height="5" rx="1" fill="url(#bl-g)" />
      <rect x="14" y="32" width="3" height="6" rx="1" fill="url(#bl-g)" />
      <rect x="20" y="32" width="3" height="6" rx="1" fill="url(#bl-g)" />
    </svg>
  );
}

export function Logo({ className, size = "text-xl", sub }) {
  return (
    <div className={cn("flex items-center gap-2 select-none", className)} data-testid="brand-logo">
      <LogoMark className={size === "text-xl" ? "w-8 h-8" : "w-10 h-10"} />
      <div className="leading-none">
        <div className={cn("font-bold tracking-tight text-white", size)}>Bitlora <span className="text-[#f59e0b]">Pro</span></div>
        {sub && <div className="text-[10px] text-gray-400 mt-1 tracking-wide">{sub}</div>}
      </div>
    </div>
  );
}

const COLORS = ["#f59e0b", "#6366f1", "#10b981", "#ef4444", "#06b6d4", "#ec4899", "#8b5cf6", "#eab308"];

export function CoinIcon({ symbol, className = "w-6 h-6" }) {
  const [failed, setFailed] = useState(false);
  const s = (symbol || "?").toLowerCase();
  if (failed) {
    const color = COLORS[s.charCodeAt(0) % COLORS.length];
    return (
      <div className={cn("rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0", className)} style={{ background: color }}>
        {s.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return <img src={`https://assets.coincap.io/assets/icons/${s}@2x.png`} alt={symbol} className={cn("rounded-full shrink-0", className)} onError={() => setFailed(true)} loading="lazy" />;
}
