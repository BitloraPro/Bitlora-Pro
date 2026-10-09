import { useState } from "react";
import { Flame, Snowflake, Hourglass, Vault } from "lucide-react";
import { Kpi, PageHead, useAdmin } from "@/components/layout/AdminLayout";
import { Empty, StatusBadge } from "@/components/common/Bits";
import { CoinIcon } from "@/components/common/Brand";
import { Table } from "@/components/trade/Tables";
import { Donut, DonutLegend, donutData } from "@/components/common/Donut";
import { api } from "@/lib/api";
import { fmtAmount, fmtCompact, fmtTime, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePatch } from "./AdminUsers";

const TABS = [["withdrawal", "Withdrawals"], ["deposit", "Deposits"], ["transfer", "Internal Transfers"], ["", "All"]];

function TxTable({ type }) {
  const [status, setStatus] = useState(type === "withdrawal" ? "pending" : "");
  const { data = [] } = useAdmin("txs", "/admin/transactions", { ...(type && { type }), ...(status && { status }) }, 8000);
  const patch = usePatch();
  return (
    <>
      {type === "withdrawal" && (
        <div className="flex gap-1 px-4 pt-3">{[["pending", "Pending Approval"], ["completed", "Approved"], ["rejected", "Rejected"], ["", "All"]].map(([k, l]) => (
          <button key={l} data-testid={`withdrawals-filter-${k || "all"}`} onClick={() => setStatus(k)} className={cn("tab-pill", status === k && "tab-pill-active text-[#f59e0b]")}>{l}</button>
        ))}</div>
      )}
      {data.length ? (
        <Table testid={`treasury-tx-${type || "all"}`} head={["Tx ID", "Type", "Coin", "Amount", "USD", "User", "Destination", "Status", "Time", "Actions"]}>
          {data.map((t) => (
            <tr key={t.id} className="row-hover border-b border-[#151d2e]">
              <td className="td font-num text-xs text-gray-400">{t.tx_hash.slice(0, 10)}…</td>
              <td className="td"><StatusBadge status={t.type} /></td>
              <td className="td"><span className="flex items-center gap-2"><CoinIcon symbol={t.asset} className="w-5 h-5" />{t.asset}</span></td>
              <td className="td font-num">{fmtAmount(t.amount)}</td><td className="td font-num">{fmtUsd(t.usd_value)}</td>
              <td className="td text-xs">{t.email}</td>
              <td className="td text-xs font-num text-gray-400 max-w-[160px] truncate">{t.type === "transfer" ? `${t.from_addr} → ${t.address}` : t.address || t.from_addr}</td>
              <td className="td"><StatusBadge status={t.status} /></td>
              <td className="td text-xs font-num text-gray-400">{fmtTime(t.created_at)}</td>
              <td className="td">{t.status === "pending" && t.type === "withdrawal" && (
                <div className="flex gap-1.5">
                  <button data-testid={`withdrawal-approve-${t.id}`} onClick={() => patch(() => api.post(`/admin/withdrawals/${t.id}/approve`), "Withdrawal approved")} className="text-xs px-3 py-1 rounded bg-[#10b981] text-white">Approve</button>
                  <button data-testid={`withdrawal-reject-${t.id}`} onClick={() => patch(() => api.post(`/admin/withdrawals/${t.id}/reject`), "Withdrawal rejected")} className="text-xs px-3 py-1 rounded bg-[#ef4444] text-white">Reject</button>
                </div>
              )}</td>
            </tr>
          ))}
        </Table>
      ) : <Empty text="No transactions" />}
    </>
  );
}

export default function AdminTreasury() {
  const [tab, setTab] = useState("withdrawal");
  const { data: t } = useAdmin("treasury", "/admin/treasury", undefined, 10000);
  const pie = donutData((t?.assets || []).map((a) => ({ name: a.asset, value: a.usd })), 5);
  return (
    <div data-testid="admin-treasury">
      <PageHead title="Wallet & Treasury Management" sub="Monitor custodial liabilities, hot/cold wallet split and the withdrawal approval matrix." />
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi testid="treasury-total" icon={Vault} label="Total Wallet Balance" value={fmtUsd(t?.total_usd, 0)} />
        <Kpi testid="treasury-hot" icon={Flame} label="Hot Wallet" value={fmtUsd(t?.hot_usd, 0)} sub={t && `${(t.hot_ratio * 100).toFixed(1)}% of reserves`} tone="green" />
        <Kpi testid="treasury-cold" icon={Snowflake} label="Cold Wallet" value={fmtUsd(t?.cold_usd, 0)} sub={t && `${((1 - t.hot_ratio) * 100).toFixed(1)}% of reserves`} tone="blue" />
        <Kpi testid="treasury-pending" icon={Hourglass} label="Pending Withdrawals" value={fmtUsd(t?.pending_withdrawals_usd)} sub={t && `${t.pending_withdrawals_count} requests`} tone="red" />
      </div>
      <div className="grid xl:grid-cols-[1fr_2fr] gap-4 mt-4">
        <div className="panel p-5"><div className="font-semibold mb-4">Reserve Composition</div><div className="flex items-center gap-5"><Donut data={pie} size={150} /><DonutLegend data={pie} valueFmt={(v) => fmtCompact(v)} /></div></div>
        <div className="panel">
          <div className="px-4 py-3 font-semibold border-b border-[#1f2937]">Hot & Cold Wallets by Asset</div>
          <Table testid="treasury-assets" head={["Asset", "Total Liability", "Hot Wallet", "Cold Wallet", "USD Value"]}>
            {(t?.assets || []).map((a) => (
              <tr key={a.asset} className="row-hover border-b border-[#151d2e]">
                <td className="td"><span className="flex items-center gap-2"><CoinIcon symbol={a.asset} className="w-5 h-5" />{a.asset}</span></td>
                <td className="td font-num">{fmtAmount(a.amount)}</td><td className="td font-num text-up">{fmtAmount(a.hot)}</td><td className="td font-num text-[#60a5fa]">{fmtAmount(a.cold)}</td><td className="td font-num">{fmtUsd(a.usd)}</td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
      <div className="panel mt-4">
        <div className="flex gap-1 px-4 pt-3 border-b border-[#1f2937]">
          {TABS.map(([k, l]) => <button key={l} data-testid={`treasury-tab-${k || "all"}`} onClick={() => setTab(k)} className={cn("px-3 py-2 text-sm border-b-2 -mb-px", tab === k ? "border-[#f59e0b] text-white" : "border-transparent text-gray-400")}>{l}</button>)}
        </div>
        <TxTable key={tab} type={tab} />
      </div>
    </div>
  );
}
