import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHead, useAdmin } from "@/components/layout/AdminLayout";
import { Empty, StatusBadge } from "@/components/common/Bits";
import { Table } from "@/components/trade/Tables";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = [["all", "All Users", {}], ["kyc", "KYC Queue", { kyc_status: "pending" }], ["suspended", "Suspended", { status: "suspended" }], ["banned", "Banned", { status: "banned" }]];

export function usePatch() {
  const qc = useQueryClient();
  return async (fn, msg) => {
    try { await fn(); toast.success(msg); qc.invalidateQueries({ queryKey: ["admin"] }); } catch (e) { toast.error(apiError(e)); }
  };
}

function FilterSelect({ value, onChange, options, testid, placeholder }) {
  return (
    <Select value={value || "any"} onValueChange={(v) => onChange(v === "any" ? "" : v)}>
      <SelectTrigger data-testid={testid} className="input-dark h-9 w-40 text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="bg-[#111827] border-[#1f2937] text-white"><SelectItem value="any">{placeholder}</SelectItem>{options.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function KycDialog({ user, onClose }) {
  const patch = usePatch();
  const review = (kyc_status) => patch(() => api.patch(`/admin/users/${user.id}`, { kyc_status }), `KYC ${kyc_status}`).then(onClose);
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#111827] border-[#1f2937] text-white" data-testid="kyc-review-dialog">
        <DialogHeader><DialogTitle>KYC Review — {user?.email}</DialogTitle></DialogHeader>
        {user?.kyc ? (
          <div className="space-y-2 text-sm">
            {[["Full name", user.kyc.full_name], ["Country", user.kyc.country], ["Date of birth", user.kyc.dob], ["Document", user.kyc.doc_type?.replace("_", " ")], ["Number", user.kyc.doc_number], ["Submitted", fmtTime(user.kyc.submitted_at)]].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-[#1a2232] py-1.5"><span className="text-gray-400">{l}</span><span className="font-num capitalize">{v}</span></div>
            ))}
            <div className="grid grid-cols-2 gap-2 pt-3">
              <button data-testid="kyc-approve" onClick={() => review("verified")} className="h-10 rounded-lg bg-[#10b981] text-white font-semibold">Approve</button>
              <button data-testid="kyc-reject" onClick={() => review("rejected")} className="h-10 rounded-lg bg-[#ef4444] text-white font-semibold">Reject</button>
            </div>
          </div>
        ) : <Empty text="No KYC submission" />}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsers() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState(params.get("q") || "");
  const [kyc, setKyc] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [review, setReview] = useState(null);
  const patch = usePatch();
  const filters = { ...TABS.find((t) => t[0] === tab)[2], ...(kyc && { kyc_status: kyc }), ...(status && { status }), ...(q && { q }), page };
  const { data } = useAdmin("users", "/admin/users", filters, 15000);
  const set = (id, body, msg) => patch(() => api.patch(`/admin/users/${id}`, body), msg);
  return (
    <div data-testid="admin-users">
      <PageHead title="User Management" sub="Manage user accounts, roles, KYC status and account security." />
      <div className="panel">
        <div className="flex gap-1 px-4 pt-3 border-b border-[#1f2937]">
          {TABS.map(([k, l]) => {
            const c = { all: data?.counts.all, kyc: data?.counts.kyc_pending, suspended: data?.counts.suspended, banned: data?.counts.banned }[k];
            return <button key={k} data-testid={`users-tab-${k}`} onClick={() => { setTab(k); setPage(1); }} className={cn("px-3 py-2 text-sm border-b-2 -mb-px", tab === k ? "border-[#f59e0b] text-white" : "border-transparent text-gray-400")}>{l} {c != null && <span className="text-xs text-gray-500 font-num">({c})</span>}</button>;
          })}
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          <label className="flex items-center input-dark h-9 px-3 w-72"><Search className="w-4 h-4 text-gray-500" /><input data-testid="users-search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search users by email, name or UID" className="bg-transparent outline-none ml-2 text-sm w-full" /></label>
          <FilterSelect testid="users-filter-status" value={status} onChange={setStatus} options={["active", "suspended", "banned"]} placeholder="All Status" />
          <FilterSelect testid="users-filter-kyc" value={kyc} onChange={setKyc} options={["unverified", "pending", "verified", "rejected"]} placeholder="All KYC Levels" />
        </div>
        {data?.items.length ? (
          <Table testid="users-table" head={["UID", "Name / Email", "KYC Status", "Account Active", "Role", "Joined", "Last Login", "Actions"]}>
            {data.items.map((u) => (
              <tr key={u.id} className="row-hover border-b border-[#151d2e]" data-testid={`user-row-${u.uid}`}>
                <td className="td font-num text-gray-400">#{u.uid}</td>
                <td className="td"><div className="flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-[#1f2937] flex items-center justify-center text-xs font-semibold">{u.name[0]}</span><div><div>{u.name}</div><div className="text-xs text-gray-500">{u.email}</div></div></div></td>
                <td className="td"><button onClick={() => setReview(u)} data-testid={`kyc-open-${u.uid}`}><StatusBadge status={u.kyc_status} /></button></td>
                <td className="td"><div className="flex items-center gap-2"><Switch data-testid={`user-active-toggle-${u.uid}`} checked={u.status === "active"} onCheckedChange={(v) => set(u.id, { status: v ? "active" : "suspended" }, v ? "Account activated" : "Account suspended")} /><StatusBadge status={u.status} /></div></td>
                <td className="td">
                  <Select value={u.role} onValueChange={(role) => set(u.id, { role }, `Role set to ${role}`)}>
                    <SelectTrigger data-testid={`user-role-${u.uid}`} className="input-dark h-8 w-24 text-xs capitalize"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#111827] border-[#1f2937] text-white">{["user", "vip", "admin"].map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="td text-xs font-num text-gray-400">{fmtTime(u.created_at)}</td>
                <td className="td text-xs font-num text-gray-400">{fmtTime(u.last_login)}</td>
                <td className="td">
                  <DropdownMenu>
                    <DropdownMenuTrigger data-testid={`user-actions-${u.uid}`} className="p-1 rounded hover:bg-[#1f2937]"><MoreHorizontal className="w-4 h-4" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#111827] border-[#1f2937] text-gray-200">
                      <DropdownMenuItem onClick={() => setReview(u)}>Review KYC</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => set(u.id, { kyc_status: "verified" }, "KYC verified")}>Mark KYC verified</DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[#1f2937]" />
                      <DropdownMenuItem onClick={() => set(u.id, { status: "suspended" }, "Suspended")}>Suspend</DropdownMenuItem>
                      <DropdownMenuItem data-testid={`user-ban-${u.uid}`} className="text-[#ef4444]" onClick={() => set(u.id, { status: "banned" }, "User banned")}>Ban user</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => set(u.id, { status: "active" }, "Reactivated")}>Reactivate</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </Table>
        ) : <Empty text="No users match" />}
        <div className="flex justify-between items-center p-4 text-xs text-gray-400">
          <span className="font-num">{data?.total ?? 0} users · page {data?.page ?? 1} / {data?.pages ?? 1}</span>
          <div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-ghost rounded px-3 py-1 disabled:opacity-40" data-testid="users-prev">Prev</button><button disabled={page >= (data?.pages ?? 1)} onClick={() => setPage(page + 1)} className="btn-ghost rounded px-3 py-1 disabled:opacity-40" data-testid="users-next">Next</button></div>
        </div>
      </div>
      <KycDialog key={review?.id} user={review} onClose={() => setReview(null)} />
    </div>
  );
}
