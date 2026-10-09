import { useState } from "react";
import { Menu, Star } from "lucide-react";
import { usePhone } from "@/components/mobile/PhoneFrame";
import { useAuth } from "@/context/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useFuturesInfo, useFuturesOrders, usePositions, useSpotOrders, useTicker } from "@/hooks/useMarket";
import CandleChart, { IntervalTabs } from "@/components/common/CandleChart";
import { OrderBook, RecentTrades } from "@/components/common/OrderBook";
import { SpotOrderForm } from "@/components/trade/SpotOrderForm";
import { FuturesOrderForm } from "@/components/trade/FuturesOrderForm";
import { Empty } from "@/components/common/Bits";
import { api } from "@/lib/api";
import { fmtAmount, fmtPct, fmtPrice, upDown } from "@/lib/format";
import { cn } from "@/lib/utils";

function PairHeader({ futures }) {
  const { go, symbol } = usePhone();
  const t = useTicker(symbol);
  return (
    <div className="flex items-center justify-between px-4 py-1.5">
      <button onClick={() => go("market")} className="flex items-center gap-2 text-sm font-semibold" data-testid="m-pair-header"><Menu className="w-4 h-4" />{futures ? `${symbol} Perp` : `${t?.base || ""}/USDT`} <span className={cn("text-[11px] font-num", upDown(t?.change ?? 0))}>{fmtPct(t?.change)}</span></button>
      <Star className="w-4 h-4 text-[#f59e0b] fill-[#f59e0b]" />
    </div>
  );
}

function PriceBlock({ extra }) {
  const { symbol } = usePhone();
  const t = useTicker(symbol);
  return (
    <div className="flex justify-between px-4 pb-1">
      <div><div className={cn("text-2xl font-bold font-num", upDown(t?.change ?? 0))} data-testid="m-last-price">{fmtPrice(t?.price)}</div><div className="text-[10px] text-gray-500 font-num">≈ ${fmtPrice(t?.price)}</div></div>
      <div className="text-[9px] font-num grid grid-cols-2 gap-x-2 text-right">
        <span className="text-gray-500">24h High</span><span>{fmtPrice(t?.high)}</span><span className="text-gray-500">24h Low</span><span>{fmtPrice(t?.low)}</span>{extra}
      </div>
    </div>
  );
}

function Chart() {
  const { symbol } = usePhone();
  const [iv, setIv] = useState("15m");
  return (
    <>
      <IntervalTabs value={iv} onChange={setIv} className="px-3 justify-between" testid="m-interval" />
      <CandleChart symbol={symbol} interval={iv} height={190} compact />
    </>
  );
}

export function MTrade() {
  const { symbol } = usePhone();
  const { user } = useAuth();
  const [tab, setTab] = useState("book");
  const { data: orders = [] } = useSpotOrders("open");
  const { run } = useAction();
  return (
    <div data-testid="m-trade">
      <PairHeader /><PriceBlock /><Chart />
      <div className="flex gap-3 px-4 border-b border-[#1f2937] text-xs">
        {[["book", "Order Book"], ["trades", "Recent Trades"], ["orders", `Orders (${orders.length})`]].map(([k, l]) => <button key={k} data-testid={`m-trade-tab-${k}`} onClick={() => setTab(k)} className={cn("py-2 border-b-2 -mb-px", tab === k ? "border-[#f59e0b] text-white" : "border-transparent text-gray-500")}>{l}</button>)}
      </div>
      {tab === "book" && <OrderBook symbol={symbol} rows={5} />}
      {tab === "trades" && <RecentTrades symbol={symbol} rows={10} />}
      {tab === "orders" && (user && orders.length ? orders.map((o) => (
        <div key={o.id} className="flex justify-between items-center px-4 py-2 border-b border-[#151d2e] text-xs">
          <div><div className={o.side === "buy" ? "text-up" : "text-down"}>{o.side.toUpperCase()} {o.base}</div><div className="text-gray-500 font-num">{fmtAmount(o.amount)} @ {fmtPrice(o.price)}</div></div>
          <button onClick={() => run(() => api.delete(`/spot/order/${o.id}`), "Order canceled")} className="btn-ghost rounded px-2 py-1 text-[10px]">Cancel</button>
        </div>
      )) : <Empty text="No open orders" />)}
      <div className="p-4"><SpotOrderForm symbol={symbol} compact /></div>
    </div>
  );
}

function MPositions() {
  const { data = [] } = usePositions();
  const { run } = useAction();
  if (!data.length) return <Empty text="No open positions" className="py-6" />;
  return data.map((p) => (
    <div key={p.id} className="mx-4 my-2 panel p-3 text-[11px]" data-testid={`m-position-${p.symbol}`}>
      <div className="flex justify-between"><span className="font-semibold text-xs">{p.symbol} <span className={cn("px-1 rounded text-[9px]", p.side === "long" ? "bg-up text-up" : "bg-down text-down")}>{p.side} {p.leverage}x</span></span>
        <button onClick={() => run(() => api.post(`/futures/position/${p.id}/close`), "Position closed")} className="btn-ghost rounded px-2 text-[10px]">Close</button></div>
      <div className="grid grid-cols-3 gap-1 mt-2 font-num">
        <div><div className="text-gray-500">Unrealized PnL</div><div className={upDown(p.unrealized_pnl)}>{fmtPrice(p.unrealized_pnl)} ({fmtPct(p.roe)})</div></div>
        <div><div className="text-gray-500">Size</div><div>{fmtAmount(p.size, 4)}</div></div>
        <div className="text-right"><div className="text-gray-500">Liq. Price</div><div className="text-[#f59e0b]">{fmtPrice(p.liq_price)}</div></div>
        <div><div className="text-gray-500">Entry</div><div>{fmtPrice(p.entry_price)}</div></div>
        <div><div className="text-gray-500">Mark</div><div>{fmtPrice(p.mark_price)}</div></div>
        <div className="text-right"><div className="text-gray-500">Margin</div><div>{fmtPrice(p.margin)}</div></div>
      </div>
    </div>
  ));
}

export function MFutures() {
  const { symbol } = usePhone();
  const { data: f } = useFuturesInfo(symbol);
  const { data: pos = [] } = usePositions();
  const { data: ord = [] } = useFuturesOrders("open");
  const [tab, setTab] = useState("pos");
  return (
    <div data-testid="m-futures">
      <PairHeader futures />
      <PriceBlock extra={<><span className="text-gray-500">Funding</span><span className="text-[#f59e0b]">{f ? `${(f.funding_rate * 100).toFixed(4)}%` : "—"}</span></>} />
      <Chart />
      <div className="p-4"><FuturesOrderForm symbol={symbol} compact /></div>
      <div className="flex gap-3 px-4 border-b border-[#1f2937] text-xs">
        {[["pos", `Positions (${pos.length})`], ["ord", `Open Orders (${ord.length})`]].map(([k, l]) => <button key={k} onClick={() => setTab(k)} data-testid={`m-futures-tab-${k}`} className={cn("py-2 border-b-2 -mb-px", tab === k ? "border-[#f59e0b] text-white" : "border-transparent text-gray-500")}>{l}</button>)}
      </div>
      {tab === "pos" ? <MPositions /> : ord.length ? ord.map((o) => <div key={o.id} className="px-4 py-2 text-xs border-b border-[#151d2e] font-num">{o.side.toUpperCase()} {fmtAmount(o.size)} @ {fmtPrice(o.price)} · {o.leverage}x</div>) : <Empty text="No open orders" className="py-6" />}
    </div>
  );
}
