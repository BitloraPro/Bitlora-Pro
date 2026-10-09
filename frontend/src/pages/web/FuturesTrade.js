import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useFuturesInfo, usePositions, useTicker, useWallet } from "@/hooks/useMarket";
import CandleChart, { IntervalTabs } from "@/components/common/CandleChart";
import { OrderBook } from "@/components/common/OrderBook";
import { FuturesOrderForm } from "@/components/trade/FuturesOrderForm";
import { FuturesOrdersTable, PositionHistoryTable, PositionsTable, TradeHistoryTable } from "@/components/trade/Tables";
import { PairSelector, StatItem } from "@/components/trade/PairSelector";
import { useWalletDialogs } from "@/components/wallet/WalletDialogs";
import { BottomTabs, useDocTitle } from "./SpotTrade";
import { fmtCompact, fmtPct, fmtPrice, upDown } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

function Countdown({ to }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const ms = Math.max(0, new Date(to) - now);
  const p = (n) => String(Math.floor(n)).padStart(2, "0");
  return <>{p(ms / 3.6e6)}:{p((ms / 6e4) % 60)}:{p((ms / 1e3) % 60)}</>;
}

function RiskPanel() {
  const { data: w } = useWallet();
  const { data: pos = [] } = usePositions();
  const dialogs = useWalletDialogs();
  const maint = pos.reduce((s, p) => s + p.notional * 0.005, 0);
  const ratio = w?.futures.equity > 0 ? (maint / w.futures.equity) * 100 : 0;
  const nearest = [...pos].sort((a, b) => Math.abs(a.mark_price - a.liq_price) / a.mark_price - Math.abs(b.mark_price - b.liq_price) / b.mark_price)[0];
  return (
    <div className="panel p-4 space-y-3" data-testid="futures-risk-panel">
      <div className="flex justify-between items-center"><div className="text-sm font-semibold">Account & Risk</div><button onClick={() => dialogs.open("transfer")} data-testid="futures-transfer-btn" className="text-xs text-[#f59e0b]">Transfer</button></div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <StatItem label="Margin Balance" value={`${fmtPrice(w?.futures.equity)} USDT`} />
        <StatItem label="Unrealized PnL" value={fmtPrice(w?.futures.unrealized_pnl)} className={upDown(w?.futures.unrealized_pnl || 0)} />
        <StatItem label="Position Margin" value={fmtPrice(w?.futures.locked)} />
        <StatItem label="Maint. Margin" value={fmtPrice(maint)} />
      </div>
      <div>
        <div className="flex justify-between text-[11px] text-gray-500 mb-1"><span>Margin Ratio</span><span className={cn("font-num", ratio > 60 ? "text-down" : ratio > 25 ? "text-[#f59e0b]" : "text-up")} data-testid="futures-margin-ratio">{ratio.toFixed(2)}%</span></div>
        <Progress value={Math.min(100, ratio)} className="h-1.5 bg-[#1f2937]" />
      </div>
      {nearest && (
        <div className="flex gap-2 text-[11px] text-gray-400 bg-[#f59e0b14] border border-[#f59e0b33] rounded-md p-2">
          <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0" />
          <span>Closest liquidation: {nearest.symbol} at <span className="font-num text-[#f59e0b]">{fmtPrice(nearest.liq_price)}</span> ({fmtPct((Math.abs(nearest.mark_price - nearest.liq_price) / nearest.mark_price) * 100, false)} away)</span>
        </div>
      )}
      {dialogs.node}
    </div>
  );
}

export default function FuturesTrade() {
  const { symbol = "BTCUSDT" } = useParams();
  const nav = useNavigate();
  const t = useTicker(symbol);
  const { data: f } = useFuturesInfo(symbol);
  const [interval, setInterval] = useState("15m");
  const [picked, setPicked] = useState(null);
  useDocTitle(t ? `${fmtPrice(t.price)} | ${symbol} Perp | Bitlora Pro` : "Bitlora Pro");
  return (
    <div className="p-2 lg:p-3 space-y-2 max-w-[1800px] mx-auto" data-testid="futures-trade-page">
      <div className="panel px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
        <PairSelector symbol={symbol} onSelect={(s) => nav(`/futures/${s}`)} futures />
        <div><div className={cn("font-num text-2xl font-semibold", (t?.change ?? 0) >= 0 ? "text-up" : "text-down")} data-testid="futures-last-price">{fmtPrice(t?.price)}</div><div className={cn("text-[11px] font-num", upDown(t?.change ?? 0))}>{fmtPct(t?.change)}</div></div>
        <StatItem label="Mark Price" value={fmtPrice(f?.mark_price)} />
        <StatItem label="Index Price" value={fmtPrice(f?.index_price)} />
        <StatItem label="Funding / Countdown" value={f ? <><span className="text-[#f59e0b]">{(f.funding_rate * 100).toFixed(4)}%</span> / <Countdown to={f.next_funding_time} /></> : "—"} />
        <StatItem label="24h High / Low" value={`${fmtPrice(f?.high)} / ${fmtPrice(f?.low)}`} />
        <StatItem label="24h Volume (USDT)" value={fmtCompact(f?.quote_volume, "")} />
        <StatItem label="Open Interest (Bitlora)" value={fmtCompact(f?.open_interest_usd)} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_290px_340px] gap-2">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1f2937]"><IntervalTabs value={interval} onChange={setInterval} /><span className="text-[11px] text-gray-500">TradingView-style · Live</span></div>
          <CandleChart symbol={symbol} interval={interval} height={500} />
        </div>
        <div className="panel overflow-hidden"><div className="px-3 py-2.5 text-sm font-semibold border-b border-[#1f2937]">Order Book</div><OrderBook symbol={symbol} rows={13} onPick={setPicked} /></div>
        <div className="space-y-2">
          <div className="panel p-4"><FuturesOrderForm symbol={symbol} picked={picked} /></div>
          <RiskPanel />
        </div>
      </div>
      <BottomTabs tabs={[["positions", "Positions", PositionsTable], ["orders", "Open Orders", FuturesOrdersTable], ["phist", "Position History", PositionHistoryTable], ["trades", "Trade History", () => <TradeHistoryTable market="futures" />]]} />
    </div>
  );
}
