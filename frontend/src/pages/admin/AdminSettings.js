import { useEffect, useState } from "react";
import { PageHead, useAdmin } from "@/components/layout/AdminLayout";
import { Empty, StatusBadge } from "@/components/common/Bits";
import { Table } from "@/components/trade/Tables";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { usePatch } from "./AdminUsers";

export function AdminSecurity() {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const { data } = useAdmin("seclogs", "/admin/security-logs", { ...(type && { type }), ...(status && { status }) }, 8000);
  const sel = (v, set, opts, ph, tid) => (
    <Select value={v || "any"} onValueChange={(x) => set(x === "any" ? "" : x)}>
      <SelectTrigger data-testid={tid} className="input-dark h-9 w-48 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent className="bg-[#111827] border-[#1f2937] text-white"><SelectItem value="any">{ph}</SelectItem>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <div data-testid="admin-security">
      <PageHead title="Security & Compliance" sub="Immutable audit trail of logins, admin actions, KYC events, withdrawals and configuration changes.">
        {sel(type, setType, data?.types || [], "All Events", "seclog-type-filter")}
        {sel(status, setStatus, ["success", "failed", "pending", "warning"], "All Status", "seclog-status-filter")}
      </PageHead>
      <div className="panel">
        {data?.items.length ? (
          <Table testid="security-logs-table" head={["Time", "Event", "User", "IP Address", "Device", "Details", "Status"]}>
            {data.items.map((l) => (
              <tr key={l.id} className="row-hover border-b border-[#151d2e]">
                <td className="td text-xs font-num text-gray-400">{fmtTime(l.created_at)}</td><td className="td text-sm">{l.type}</td><td className="td text-xs">{l.email || "system"}</td>
                <td className="td text-xs font-num">{l.ip}</td><td className="td text-xs text-gray-500 max-w-[200px] truncate">{l.device}</td>
                <td className="td text-xs text-gray-400 max-w-[280px] truncate">{l.details}</td><td className="td"><StatusBadge status={l.status} /></td>
              </tr>
            ))}
          </Table>
        ) : <Empty text="No security events" />}
      </div>
    </div>
  );
}

const TOGGLES = [["maintenance_mode", "Maintenance Mode", "Blocks all trading, deposits and withdrawals for non-admin users."], ["registration_enabled", "User Registration", "Allow new accounts to sign up."], ["kyc_required_for_withdrawal", "KYC Required for Withdrawals", "Only verified users may withdraw."]];
const NUMBERS = [["spot_maker_fee", "Spot Maker Fee", "decimal (0.001 = 0.1%)"], ["spot_taker_fee", "Spot Taker Fee", "decimal"], ["futures_fee", "Futures Fee", "decimal"], ["max_leverage", "Max Leverage", "1 – 125x"], ["daily_withdraw_limit_usd", "Daily Withdrawal Limit (USD)", "per user"], ["hot_wallet_ratio", "Hot Wallet Ratio", "0 – 1"], ["welcome_bonus_usdt", "Welcome Bonus (USDT)", "paper-trading credit"], ["max_login_attempts", "Max Login Attempts", "before 15 min lockout"]];

export function AdminSettings() {
  const { data } = useAdmin("config", "/admin/config", undefined, 60000);
  const [f, setF] = useState(null);
  const patch = usePatch();
  useEffect(() => { if (data && !f) setF(data); }, [data, f]);
  if (!f) return null;
  const save = () => patch(() => api.put("/admin/config", f), "Configuration saved");
  return (
    <div data-testid="admin-settings">
      <PageHead title="System Configuration" sub="Platform-wide controls. Changes apply instantly and are written to the audit log.">
        <button data-testid="config-save" onClick={save} className="btn-orange rounded-lg h-10 px-6 text-sm">Save Changes</button>
      </PageHead>
      <div className="grid xl:grid-cols-2 gap-4">
        <div className="panel p-6 space-y-5">
          <div className="font-semibold">General</div>
          <label className="block"><div className="text-xs text-gray-400 mb-1">Platform Name</div><input data-testid="config-platform_name" value={f.platform_name} onChange={(e) => setF({ ...f, platform_name: e.target.value })} className="input-dark h-10 px-3 w-full" /></label>
          {TOGGLES.map(([k, l, d]) => (
            <div key={k} className="flex items-center justify-between gap-4 border-t border-[#1a2232] pt-4">
              <div><div className="text-sm">{l}</div><div className="text-xs text-gray-500">{d}</div></div>
              <Switch data-testid={`config-${k}`} checked={!!f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v })} />
            </div>
          ))}
        </div>
        <div className="panel p-6">
          <div className="font-semibold mb-4">Fees, Limits & Risk</div>
          <div className="grid sm:grid-cols-2 gap-4">
            {NUMBERS.map(([k, l, d]) => (
              <label key={k} className="block"><div className="text-xs text-gray-400 mb-1">{l} <span className="text-gray-600">· {d}</span></div>
                <input data-testid={`config-${k}`} type="number" step="any" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="input-dark h-10 px-3 w-full font-num" /></label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
