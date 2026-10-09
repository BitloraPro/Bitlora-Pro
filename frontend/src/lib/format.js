export function fmtPrice(p) {
  if (p == null || isNaN(p)) return "—";
  const v = Number(p);
  const a = Math.abs(v);
  if (a >= 1000) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (a >= 1) return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (v === 0) return "0.00";
  return v.toPrecision(4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function fmtUsd(v, digits = 2) {
  if (v == null || isNaN(v)) return "—";
  return "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtCompact(v, prefix = "$") {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [n, s] of units) if (a >= n) return `${prefix}${(v / n).toFixed(2)}${s}`;
  return `${prefix}${Number(v).toFixed(2)}`;
}

export function fmtAmount(v, max = 6) {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toLocaleString("en-US", { maximumFractionDigits: max });
}

export function fmtPct(v, sign = true) {
  if (v == null || isNaN(v)) return "—";
  return `${sign && v > 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
}

export function fmtTime(iso, withDate = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  return withDate ? d.toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : d.toLocaleTimeString("en-GB");
}

export function priceStep(price) {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  return 8;
}

export const upDown = (v) => (v >= 0 ? "text-up" : "text-down");
