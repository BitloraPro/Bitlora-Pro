import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Star } from "lucide-react";
import { useTicker, useWallet } from "@/hooks/useMarket";
import { useAuth } from "@/context/AuthContext";
import CandleChart, { IntervalTabs } from "@/components/common/CandleChart";
import { OrderBook, RecentTrades } from "@/components/common/OrderBook";
import { SpotOrderForm } from "@/components/trade/SpotOrderForm";
import { SpotOrdersTable, Table, TradeHistoryTable } from "@/components/trade/Tables";
import { PairSelector, StatItem } from "@/components/trade/PairSelector";
import { Empty } from "@/components/common/Bits";
import { CoinIcon } from "@/components/common/Brand";
import { fmtAmount, fmtCompact, fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function useDocTitle(t) {
  useEffect(() => { if (t) document.title = t; }, [t]);
}

function AssetsTab() {
  const { data: w } = useWallet();
  if (!w?.spot.length) return <Empty text="No assets" />;
  return (
    <Table testid="spot-assets-table" head={["Asset", "Available", "In Orders", "Total", "Value (USD)"]}>
      {w.spot.map((a) => (
        <tr key={a.asset} className="row-hover border-b border-[#151d2e]">
          <td className="td"><span className="flex items-center gap-2"><CoinIcon symbol={a.asset} className="w-5 h-5" />{a.asset}</span></td>
          <td className="td font-num">{fmtAmount(a.free)}</td><td className="td font-num">{fmtAmount(a.locked)}</td>
          <td className="td font-num">{fmtAmount(a.total)}</td><td className="td font-num">{fmtUsd(a.usd)}</td>
        </tr>
      ))}
    </Table>
  );
}

export function BottomTabs({ tabs, initial }) {
  const [tab, setTab] = useState(initial || tabs[0][0]);
  const { user } = useAuth();
  const Comp = tabs.find((t) => t[0] === tab)[2];
  return (
    <div className="panel">
      <div className="flex gap-1 px-3 pt-2 border-b border-[#1f2937]">
        {tabs.map(([k, l]) => <button key={k} data-testid={`bottom-tab-${k}`} onClick={() => setTab(k)} className={cn("px-3 py-2 text-sm border-b-2 -mb-px", tab === k ? "border-[#f59e0b] text-white" : "border-transparent text-gray-400")}>{l}</button>)}
      </div>
      <div className="min-h-[180px]">{user ? <Comp /> : <Empty text="Log in to view your orders and positions" />}</div>
    </div>
  );
}

export default function SpotTrade() {
  const { symbol = "BTCUSDT" } = useParams();
  const nav = useNavigate();
  const t = useTicker(symbol);
  const [interval, setInterval] = useState("15m");
  const [side, setSide] = useState("book");
  const [picked, setPicked] = useState(null);
  useDocTitle(t ? `${fmtPrice(t.price)} | ${t.base}/USDT | Bitlora Pro` : "Bitlora Pro");
  return (
    <div className="p-2 lg:p-3 space-y-2 max-w-[1800px] mx-auto" data-testid="spot-trade-page">
      <div className="panel px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
        <PairSelector symbol={symbol} onSelect={(s) => nav(`/trade/${s}`)} />
        <div><div className={cn("font-num text-2xl font-semibold", (t?.change ?? 0) >= 0 ? "text-up" : "text-down")} data-testid="spot-last-price">{fmtPrice(t?.price)}</div><div className="text-[11px] text-gray-500 font-num">≈ {fmtUsd(t?.price)}</div></div>
        <StatItem label="24h Change" value={`${fmtPrice(t?.change_abs)} ${fmtPct(t?.change)}`} className={(t?.change ?? 0) >= 0 ? "text-up" : "text-down"} />
        <StatItem label="24h High" value={fmtPrice(t?.high)} />
        <StatItem label="24h Low" value={fmtPrice(t?.low)} />
        <StatItem label={`24h Volume (${t?.base || ""})`} value={fmtAmount(t?.volume, 2)} />
        <StatItem label="24h Volume (USDT)" value={fmtCompact(t?.quote_volume, "")} />
        <Star className="ml-auto w-5 h-5 text-[#f59e0b]" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_290px_340px] gap-2">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f2937]">
            <IntervalTabs value={interval} onChange={setInterval} />
            <span className="text-[11px] text-gray-500 font-num">O {fmtPrice(t?.open)} H {fmtPrice(t?.high)} L {fmtPrice(t?.low)} C {fmtPrice(t?.price)}</span>
          </div>
          <CandleChart symbol={symbol} interval={interval} height={470} />
        </div>
        <div className="panel overflow-hidden">
          <div className="flex gap-1 p-2 border-b border-[#1f2937]">
            {[["book", "Order Book"], ["trades", "Recent Trades"]].map(([k, l]) => <button key={k} data-testid={`spot-panel-${k}`} onClick={() => setSide(k)} className={cn("tab-pill", side === k && "tab-pill-active")}>{l}</button>)}
          </div>
          {side === "book" ? <OrderBook symbol={symbol} rows={12} onPick={setPicked} /> : <RecentTrades symbol={symbol} rows={28} />}
        </div>
        <div className="panel p-4"><SpotOrderForm symbol={symbol} picked={picked} /></div>
      </div>
      <BottomTabs tabs={[["open", "Open Orders", () => <SpotOrdersTable status="open" />], ["history", "Order History", () => <SpotOrdersTable status="history" />], ["trades", "Trade History", () => <TradeHistoryTable market="spot" />], ["assets", "Assets", AssetsTab]]} />
    </div>
  );
}
