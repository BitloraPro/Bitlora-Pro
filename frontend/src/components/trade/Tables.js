import { useState } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/hooks/useAction";
import { useFuturesOrders, useMyTrades, usePositionHistory, usePositions, useSpotOrders } from "@/hooks/useMarket";
import { fmtAmount, fmtPct, fmtPrice, fmtTime, upDown } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Empty, StatusBadge } from "@/components/common/Bits";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumField } from "./SpotOrderForm";

export function Table({ head, children, testid }) {
  return (
    <div className="overflow-x-auto scrollbar-thin" data-testid={testid}>
      <table className="w-full">
        <thead><tr className="border-b border-[#1f2937]">{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function SpotOrdersTable({ status = "open" }) {
  const { data = [] } = useSpotOrders(status);
  const { run } = useAction();
  if (!data.length) return <Empty text={status === "open" ? "No open orders" : "No order history"} />;
  return (
    <Table testid={`spot-orders-${status}`} head={["Date", "Pair", "Type", "Side", "Price", "Amount", "Filled", "Total", "Status", "Action"]}>
      {data.map((o) => (
        <tr key={o.id} className="row-hover border-b border-[#151d2e]">
          <td className="td text-gray-400 font-num text-xs">{fmtTime(o.created_at)}</td>
          <td className="td font-medium">{o.base}/USDT</td>
          <td className="td text-gray-300 capitalize">{o.type.replace("_", "-")}{o.stop_price ? <span className="text-gray-500 text-xs"> @{fmtPrice(o.stop_price)}</span> : null}</td>
          <td className={cn("td capitalize font-medium", o.side === "buy" ? "text-up" : "text-down")}>{o.side}</td>
          <td className="td font-num">{fmtPrice(o.avg_price || o.price)}</td>
          <td className="td font-num">{fmtAmount(o.amount)}</td>
          <td className="td font-num">{fmtAmount(o.filled)}</td>
          <td className="td font-num">{fmtPrice((o.avg_price || o.price) * o.amount)}</td>
          <td className="td"><StatusBadge status={o.status} /></td>
          <td className="td">{o.status === "open" && <button data-testid={`cancel-order-${o.id}`} onClick={() => run(() => api.delete(`/spot/order/${o.id}`), "Order canceled")} className="text-xs btn-ghost px-3 py-1 rounded">Cancel</button>}</td>
        </tr>
      ))}
    </Table>
  );
}

export function TradeHistoryTable({ market = "spot" }) {
  const { data = [] } = useMyTrades(market);
  if (!data.length) return <Empty text="No trades yet" />;
  return (
    <Table testid={`trade-history-${market}`} head={["Time", "Pair", "Side", "Price", "Amount", "Total", "Fee", market === "futures" ? "Realized PnL" : "Role"]}>
      {data.map((t) => (
        <tr key={t.id} className="row-hover border-b border-[#151d2e]">
          <td className="td text-gray-400 font-num text-xs">{fmtTime(t.created_at)}</td>
          <td className="td font-medium">{t.symbol.replace("USDT", "/USDT")}</td>
          <td className={cn("td capitalize", t.side === "buy" ? "text-up" : "text-down")}>{t.side}</td>
          <td className="td font-num">{fmtPrice(t.price)}</td>
          <td className="td font-num">{fmtAmount(t.amount)}</td>
          <td className="td font-num">{fmtPrice(t.quote)}</td>
          <td className="td font-num text-gray-400">{fmtAmount(t.fee, 6)} {t.fee_asset}</td>
          <td className={cn("td font-num", t.realized_pnl != null && upDown(t.realized_pnl))}>{market === "futures" ? (t.realized_pnl != null ? fmtPrice(t.realized_pnl) : "Open") : "Taker"}</td>
        </tr>
      ))}
    </Table>
  );
}

function TpSlDialog({ pos, onClose }) {
  const [tp, setTp] = useState(pos?.tp ?? "");
  const [sl, setSl] = useState(pos?.sl ?? "");
  const { run, busy } = useAction();
  return (
    <Dialog open={!!pos} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#111827] border-[#1f2937] text-white">
        <DialogHeader><DialogTitle>TP / SL — {pos?.symbol}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <NumField label="Take Profit" value={tp} onChange={setTp} suffix="USDT" testid="tpsl-tp-input" />
          <NumField label="Stop Loss" value={sl} onChange={setSl} suffix="USDT" testid="tpsl-sl-input" />
          <button data-testid="tpsl-save" disabled={busy} onClick={() => run(() => api.put(`/futures/position/${pos.id}/tpsl`, { tp: tp ? Number(tp) : null, sl: sl ? Number(sl) : null }), "TP/SL updated").then((r) => r && onClose())} className="w-full h-10 btn-orange rounded-lg">Confirm</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PositionsTable() {
  const { data = [] } = usePositions();
  const { run } = useAction();
  const [edit, setEdit] = useState(null);
  if (!data.length) return <Empty text="No open positions" />;
  return (
    <>
      <Table testid="positions-table" head={["Symbol", "Size", "Entry Price", "Mark Price", "Liq. Price", "Margin", "Margin Ratio", "PnL (ROE)", "TP/SL", "Action"]}>
        {data.map((p) => (
          <tr key={p.id} className="row-hover border-b border-[#151d2e]">
            <td className="td"><div className="font-medium">{p.symbol}</div><div className={cn("text-[11px]", p.side === "long" ? "text-up" : "text-down")}>{p.side === "long" ? "Long" : "Short"} {p.leverage}x · <span className="capitalize text-gray-400">{p.margin_mode}</span></div></td>
            <td className="td font-num">{fmtAmount(p.size, 4)}</td>
            <td className="td font-num">{fmtPrice(p.entry_price)}</td>
            <td className="td font-num">{fmtPrice(p.mark_price)}</td>
            <td className="td font-num text-[#f59e0b]">{fmtPrice(p.liq_price)}</td>
            <td className="td font-num">{fmtPrice(p.margin)}</td>
            <td className="td"><StatusBadge status={p.risk} /> <span className="font-num text-xs text-gray-400">{p.margin_ratio.toFixed(2)}%</span></td>
            <td className={cn("td font-num", upDown(p.unrealized_pnl))} data-testid={`position-pnl-${p.symbol}`}>{p.unrealized_pnl >= 0 ? "+" : ""}{fmtPrice(p.unrealized_pnl)} ({fmtPct(p.roe)})</td>
            <td className="td text-xs font-num text-gray-400"><button onClick={() => setEdit(p)} data-testid={`position-tpsl-${p.symbol}`} className="hover:text-[#f59e0b]">{p.tp ? fmtPrice(p.tp) : "--"} / {p.sl ? fmtPrice(p.sl) : "--"}</button></td>
            <td className="td"><button data-testid={`position-close-${p.symbol}`} onClick={() => run(() => api.post(`/futures/position/${p.id}/close`), (r) => `Closed · PnL ${fmtPrice(r.data.pnl)} USDT`)} className="text-xs btn-ghost px-3 py-1 rounded">Close</button></td>
          </tr>
        ))}
      </Table>
      <TpSlDialog key={edit?.id} pos={edit} onClose={() => setEdit(null)} />
    </>
  );
}

export function FuturesOrdersTable() {
  const { data = [] } = useFuturesOrders("open");
  const { run } = useAction();
  if (!data.length) return <Empty text="No open orders" />;
  return (
    <Table testid="futures-orders-table" head={["Date", "Symbol", "Side", "Price", "Size", "Leverage", "Mode", "Action"]}>
      {data.map((o) => (
        <tr key={o.id} className="row-hover border-b border-[#151d2e]">
          <td className="td text-xs font-num text-gray-400">{fmtTime(o.created_at)}</td>
          <td className="td">{o.symbol}</td>
          <td className={cn("td capitalize", o.side === "long" ? "text-up" : "text-down")}>{o.side}</td>
          <td className="td font-num">{fmtPrice(o.price)}</td>
          <td className="td font-num">{fmtAmount(o.size)}</td>
          <td className="td font-num">{o.leverage}x</td>
          <td className="td capitalize">{o.margin_mode}</td>
          <td className="td"><button onClick={() => run(() => api.delete(`/futures/order/${o.id}`), "Order canceled")} className="text-xs btn-ghost px-3 py-1 rounded" data-testid={`cancel-futures-order-${o.id}`}>Cancel</button></td>
        </tr>
      ))}
    </Table>
  );
}

export function PositionHistoryTable() {
  const { data = [] } = usePositionHistory();
  if (!data.length) return <Empty text="No closed positions" />;
  return (
    <Table testid="position-history-table" head={["Closed", "Symbol", "Side", "Entry", "Close", "Leverage", "Realized PnL", "Status"]}>
      {data.map((p) => (
        <tr key={p.id} className="row-hover border-b border-[#151d2e]">
          <td className="td text-xs font-num text-gray-400">{fmtTime(p.closed_at)}</td>
          <td className="td">{p.symbol}</td>
          <td className={cn("td capitalize", p.side === "long" ? "text-up" : "text-down")}>{p.side}</td>
          <td className="td font-num">{fmtPrice(p.entry_price)}</td>
          <td className="td font-num">{fmtPrice(p.close_price)}</td>
          <td className="td font-num">{p.leverage}x</td>
          <td className={cn("td font-num", upDown(p.realized_pnl))}>{fmtPrice(p.realized_pnl)}</td>
          <td className="td"><StatusBadge status={p.status} /></td>
        </tr>
      ))}
    </Table>
  );
}
