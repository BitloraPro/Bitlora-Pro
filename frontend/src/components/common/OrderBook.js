import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useDepth, useMarketTrades, useTicker } from "@/hooks/useMarket";
import { fmtAmount, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

function Rows({ rows, side, max, onPick, base }) {
  return rows.map(([p, q, cum]) => (
    <button key={`${side}${p}`} onClick={() => onPick?.(p)} className="relative grid grid-cols-3 w-full text-[11px] font-num py-[3px] px-3 hover:bg-[#1a2232] text-left" data-testid={`orderbook-${side}-row`}>
      <span className={cn("absolute inset-y-0 right-0", side === "ask" ? "bg-[rgba(239,68,68,0.13)]" : "bg-[rgba(16,185,129,0.13)]")} style={{ width: `${(cum / max) * 100}%` }} />
      <span className={cn("relative", side === "ask" ? "text-down" : "text-up")}>{fmtPrice(p)}</span>
      <span className="relative text-right text-gray-300">{fmtAmount(q, 4)}</span>
      <span className="relative text-right text-gray-400">{fmtAmount(cum, base === "BTC" ? 4 : 2)}</span>
    </button>
  ));
}

export function OrderBook({ symbol, rows = 12, onPick }) {
  const { data } = useDepth(symbol);
  const t = useTicker(symbol);
  const base = symbol.replace("USDT", "");
  const { asks, bids, max } = useMemo(() => {
    if (!data) return { asks: [], bids: [], max: 1 };
    let c = 0;
    const a = data.asks.slice(0, rows).map(([p, q]) => [p, q, (c += q)]).reverse();
    c = 0;
    const b = data.bids.slice(0, rows).map(([p, q]) => [p, q, (c += q)]);
    return { asks: a, bids: b, max: Math.max(a[0]?.[2] || 1, b[b.length - 1]?.[2] || 1) };
  }, [data, rows]);
  const mid = data ? (data.asks[0]?.[0] + data.bids[0]?.[0]) / 2 : t?.price;
  const spread = data ? data.asks[0]?.[0] - data.bids[0]?.[0] : 0;
  return (
    <div data-testid="order-book">
      <div className="grid grid-cols-3 text-[10px] text-gray-500 px-3 py-1.5 uppercase tracking-wider">
        <span>Price (USDT)</span><span className="text-right">Amount ({base})</span><span className="text-right">Total</span>
      </div>
      <Rows rows={asks} side="ask" max={max} onPick={onPick} base={base} />
      <div className="flex items-center justify-between px-3 py-2 border-y border-[#1f2937] my-1">
        <span className={cn("font-num text-lg font-semibold flex items-center gap-1", (t?.change ?? 0) >= 0 ? "text-up" : "text-down")} data-testid="orderbook-mid-price">
          {fmtPrice(mid)} {(t?.change ?? 0) >= 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
        </span>
        <span className="text-[10px] text-gray-500 font-num">Spread {fmtPrice(spread)}</span>
      </div>
      <Rows rows={bids} side="bid" max={max} onPick={onPick} base={base} />
    </div>
  );
}

export function RecentTrades({ symbol, rows = 24 }) {
  const { data = [] } = useMarketTrades(symbol);
  return (
    <div data-testid="recent-trades">
      <div className="grid grid-cols-3 text-[10px] text-gray-500 px-3 py-1.5 uppercase tracking-wider">
        <span>Price</span><span className="text-right">Amount</span><span className="text-right">Time</span>
      </div>
      {data.slice(0, rows).map((tr) => (
        <div key={tr.id} className="grid grid-cols-3 text-[11px] font-num py-[3px] px-3">
          <span className={tr.side === "buy" ? "text-up" : "text-down"}>{fmtPrice(tr.price)}</span>
          <span className="text-right text-gray-300">{fmtAmount(tr.qty, 5)}</span>
          <span className="text-right text-gray-500">{new Date(tr.time).toLocaleTimeString("en-GB")}</span>
        </div>
      ))}
    </div>
  );
}
