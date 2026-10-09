import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({ baseURL: `${BACKEND_URL}/api`, withCredentials: true });

let refreshing = null;

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const cfg = error.config;
    const url = cfg?.url || "";
    if (error.response?.status !== 401 || cfg._retried || url.startsWith("/auth/")) throw error;
    cfg._retried = true;
    refreshing = refreshing || api.post("/auth/refresh").finally(() => { refreshing = null; });
    await refreshing;
    return api(cfg);
  },
);

export function apiError(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d?.msg || JSON.stringify(d)).join(" ");
  return detail?.msg || String(detail);
}

export const get = (url, params) => api.get(url, { params }).then((r) => r.data);
