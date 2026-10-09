import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { BadgeCheck, CheckCircle2, Code2, FileCheck2, Gauge, KeyRound, LayoutGrid, ListOrdered, LogOut, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAccountOverview, useTransactions, useWallet } from "@/hooks/useMarket";
import { useWalletDialogs } from "@/components/wallet/WalletDialogs";
import { Donut, DonutLegend, donutData } from "@/components/common/Donut";
import { CoinIcon } from "@/components/common/Brand";
import { Empty, StatusBadge } from "@/components/common/Bits";
import { PositionsTable, SpotOrdersTable, Table, TradeHistoryTable } from "@/components/trade/Tables";
import { BottomTabs } from "./SpotTrade";
import { ApiSection, KycSection, SecuritySection } from "./AccountSecurity";
import { Progress } from "@/components/ui/progress";
import { fmtAmount, fmtCompact, fmtPct, fmtTime, fmtUsd, upDown } from "@/lib/format";
import { cn } from "@/lib/utils";

const SECTIONS = [["overview", "Overview", LayoutGrid], ["assets", "Assets", Wallet], ["orders", "Orders", ListOrdered], ["security", "Security", ShieldCheck], ["api", "API Management", Code2], ["verification", "Verification", FileCheck2]];

function BalanceCard() {
  const { data: w } = useWallet();
  const dialogs = useWalletDialogs();
  return (
    <div className="panel p-6" data-testid="account-balance-card">
      <div className="eyebrow">Total Balance</div>
      <div className="text-4xl font-bold font-num mt-2" data-testid="account-total-balance">{fmtUsd(w?.total_usd)}</div>
      <div className="text-xs mt-1 font-num text-gray-400">≈ {fmtAmount(w?.total_btc, 6)} BTC · <span className={upDown(w?.change_24h_usd || 0)}>{fmtPct(w?.change_24h_pct)} ({fmtUsd(w?.change_24h_usd)}) today</span></div>
      <div className="grid grid-cols-3 gap-2 mt-6">
        <button data-testid="account-deposit-btn" onClick={() => dialogs.open("deposit")} className="btn-orange h-10 rounded-lg text-sm">Deposit</button>
        <button data-testid="account-withdraw-btn" onClick={() => dialogs.open("withdraw")} className="btn-ghost h-10 rounded-lg text-sm">Withdraw</button>
        <button data-testid="account-transfer-btn" onClick={() => dialogs.open("transfer")} className="btn-ghost h-10 rounded-lg text-sm">Transfer</button>
      </div>
      {dialogs.node}
    </div>
  );
}

function AllocationCard() {
  const { data: w } = useWallet();
  const items = (w?.spot || []).map((a) => ({ name: a.asset, value: a.usd }));
  if (w?.futures.equity > 0) items.push({ name: "Futures", value: w.futures.equity });
  const data = donutData(items.sort((a, b) => b.value - a.value));
  return (
    <div className="panel p-6" data-testid="account-allocation">
      <div className="text-sm font-semibold mb-4">Assets Overview</div>
      <div className="flex items-center gap-6"><Donut data={data} /><DonutLegend data={data} valueFmt={(v) => fmtUsd(v)} /></div>
    </div>
  );
}

function Overview() {
  const { data: o } = useAccountOverview();
  const nav = useNavigate();
  if (!o) return null;
  const u = o.user;
  const checks = [["2FA Authentication", u.twofa_enabled], ["Email Verification", u.email_verified], ["Identity (KYC)", u.kyc_status === "verified"]];
  return (
    <div className="space-y-4">
      <div className="panel p-6 flex flex-wrap items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#b45309] flex items-center justify-center text-2xl font-bold text-[#0b0f19]">{u.name[0]}</div>
        <div>
          <div className="text-xl font-semibold flex items-center gap-2" data-testid="account-user-name">{u.name}
            {u.kyc_status === "verified" && <span className="text-[11px] bg-up text-up px-2 py-0.5 rounded-full flex items-center gap-1"><BadgeCheck className="w-3 h-3" />Verified</span>}
            <span className="text-[11px] bg-[#f59e0b1f] text-[#f59e0b] px-2 py-0.5 rounded-full" data-testid="account-vip-tier">VIP {o.vip.tier}</span>
          </div>
          <div className="text-sm text-gray-400">{u.email} · <span className="font-num">UID {u.uid}</span></div>
        </div>
        <div className="ml-auto min-w-[260px]">
          <div className="flex justify-between text-xs text-gray-400 mb-1"><span>30d volume {fmtCompact(o.vip.volume_30d)}</span><span>{o.vip.next_tier_volume ? `VIP ${o.vip.tier + 1} at ${fmtCompact(o.vip.next_tier_volume)}` : "Max tier"}</span></div>
          <Progress value={o.vip.progress} className="h-1.5 bg-[#1f2937]" />
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4"><BalanceCard /><AllocationCard /></div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="panel p-6">
          <div className="flex justify-between items-center mb-4"><div className="text-sm font-semibold">Account Security</div><span className="text-xs text-gray-400">Score <span className="font-num text-[#f59e0b]" data-testid="account-security-score">{o.security_score}</span>/100</span></div>
          {checks.map(([l, ok]) => (
            <div key={l} className="flex items-center justify-between py-2.5 border-b border-[#1a2232] last:border-0 text-sm">
              <span className="flex items-center gap-2">{ok ? <CheckCircle2 className="w-4 h-4 text-up" /> : <XCircle className="w-4 h-4 text-gray-500" />}{l}</span>
              <span className={ok ? "text-up text-xs" : "text-xs text-gray-500"}>{ok ? "Enabled" : "Not set"}</span>
            </div>
          ))}
        </div>
        <div className="panel p-6">
          <div className="text-sm font-semibold mb-4">Quick Actions</div>
          <div className="grid grid-cols-2 gap-2">
            {[[KeyRound, "API Management", "/account/api"], [ShieldCheck, "Security Center", "/account/security"], [FileCheck2, "Identity Verification", "/account/verification"], [Gauge, "Futures Trading", "/futures/BTCUSDT"]].map(([I, l, to]) => (
              <button key={l} onClick={() => nav(to)} className="panel-flat rounded-lg p-3 text-left text-sm hover:border-[#f59e0b55] flex items-center gap-2"><I className="w-4 h-4 text-[#f59e0b]" />{l}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TxTable() {
  const { data = [] } = useTransactions();
  if (!data.length) return <Empty text="No transactions yet" />;
  return (
    <Table testid="transactions-table" head={["Time", "Type", "Asset", "Amount", "Value", "Network / Route", "TxID", "Status"]}>
      {data.map((t) => (
        <tr key={t.id} className="row-hover border-b border-[#151d2e]">
          <td className="td text-xs font-num text-gray-400">{fmtTime(t.created_at)}</td>
          <td className="td"><StatusBadge status={t.type} /></td>
          <td className="td">{t.asset}</td>
          <td className="td font-num">{fmtAmount(t.amount)}</td>
          <td className="td font-num">{fmtUsd(t.usd_value)}</td>
          <td className="td text-xs text-gray-400">{t.type === "transfer" ? `${t.from_addr} → ${t.address}` : t.network || t.from_addr || "—"}</td>
          <td className="td text-xs font-num text-gray-500">{t.tx_hash.slice(0, 10)}…</td>
          <td className="td"><StatusBadge status={t.status} /></td>
        </tr>
      ))}
    </Table>
  );
}

function Assets() {
  const { data: w } = useWallet();
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4"><BalanceCard /><AllocationCard /></div>
      <div className="panel">
        <div className="px-4 py-3 text-sm font-semibold border-b border-[#1f2937]">Spot Account</div>
        <Table testid="account-assets-table" head={["Coin", "Total", "Available", "In Orders", "Price", "Value", "24h"]}>
          {(w?.spot || []).map((a) => (
            <tr key={a.asset} className="row-hover border-b border-[#151d2e]">
              <td className="td"><span className="flex items-center gap-2"><CoinIcon symbol={a.asset} className="w-6 h-6" /><span><div>{a.asset}</div><div className="text-[11px] text-gray-500">{a.name}</div></span></span></td>
              <td className="td font-num">{fmtAmount(a.total)}</td><td className="td font-num">{fmtAmount(a.free)}</td><td className="td font-num">{fmtAmount(a.locked)}</td>
              <td className="td font-num">{fmtUsd(a.price, a.price < 1 ? 6 : 2)}</td><td className="td font-num">{fmtUsd(a.usd)}</td><td className={cn("td font-num", upDown(a.change))}>{fmtPct(a.change)}</td>
            </tr>
          ))}
        </Table>
        <div className="px-4 py-3 text-sm border-t border-[#1f2937] flex gap-8 text-gray-400">Futures Account: <span className="font-num text-white">{fmtUsd(w?.futures.equity)}</span> <span>Available <span className="font-num text-white">{fmtAmount(w?.futures.free, 2)} USDT</span></span></div>
      </div>
      <div className="panel"><div className="px-4 py-3 text-sm font-semibold border-b border-[#1f2937]">Transaction History</div><TxTable /></div>
    </div>
  );
}

function Orders() {
  return <BottomTabs tabs={[["open", "Open Orders", () => <SpotOrdersTable status="open" />], ["history", "Order History", () => <SpotOrdersTable status="history" />], ["trades", "Spot Trades", () => <TradeHistoryTable market="spot" />], ["positions", "Futures Positions", PositionsTable], ["ftrades", "Futures Trades", () => <TradeHistoryTable market="futures" />]]} />;
}

const VIEWS = { overview: Overview, assets: Assets, orders: Orders, security: SecuritySection, api: ApiSection, verification: KycSection };

export default function Account() {
  const { section = "overview" } = useParams();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (user === null) return null;
  if (!user) return <Navigate to="/login" replace />;
  const View = VIEWS[section] || Overview;
  return (
    <div className="px-4 lg:px-8 py-6 max-w-[1400px] mx-auto grid lg:grid-cols-[230px_1fr] gap-6" data-testid="account-page">
      <aside className="space-y-1">
        <div className="text-2xl font-bold mb-1">My Account</div>
        <div className="text-xs text-gray-500 mb-5">Manage your account, assets and preferences.</div>
        {SECTIONS.map(([k, l, I]) => (
          <NavLink key={k} to={`/account/${k}`} data-testid={`account-nav-${k}`} className={() => cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white", section === k && "bg-[#f59e0b1a] text-[#f59e0b]")}><I className="w-4 h-4" />{l}</NavLink>
        ))}
        <button onClick={async () => { await logout(); nav("/"); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-[#ef4444]" data-testid="account-logout"><LogOut className="w-4 h-4" />Logout</button>
      </aside>
      <main className="min-w-0"><View /></main>
    </div>
  );
}
