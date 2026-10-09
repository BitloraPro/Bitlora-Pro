import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const live = (ms) => ({ refetchInterval: ms, staleTime: ms / 2, placeholderData: (prev) => prev });

export const useTickers = () => useQuery({ queryKey: ["tickers"], queryFn: () => get("/market/tickers"), ...live(3000) });
export const useSparklines = () => useQuery({ queryKey: ["sparklines"], queryFn: () => get("/market/sparklines"), staleTime: 300000 });
export const useMarketStats = () => useQuery({ queryKey: ["mstats"], queryFn: () => get("/market/stats"), ...live(30000) });
export const useKlines = (symbol, interval) =>
  useQuery({ queryKey: ["klines", symbol, interval], queryFn: () => get("/market/klines", { symbol, interval, limit: 300 }), refetchInterval: 5000, staleTime: 2000 });
export const useDepth = (symbol, limit = 20) => useQuery({ queryKey: ["depth", symbol, limit], queryFn: () => get("/market/depth", { symbol, limit }), ...live(2000) });
export const useMarketTrades = (symbol) => useQuery({ queryKey: ["mtrades", symbol], queryFn: () => get("/market/trades", { symbol, limit: 40 }), ...live(2500) });
export const useFuturesInfo = (symbol) => useQuery({ queryKey: ["finfo", symbol], queryFn: () => get(`/market/futures/${symbol}`), ...live(3000) });

export function useTicker(symbol) {
  const { data } = useTickers();
  return data?.find((t) => t.symbol === symbol);
}

function usePrivate(key, url, params, ms = 4000) {
  const { user } = useAuth();
  return useQuery({ queryKey: [key, params], queryFn: () => get(url, params), enabled: !!user, ...live(ms) });
}

export const useWallet = () => usePrivate("wallet", "/wallet", undefined, 5000);
export const useTransactions = (type) => usePrivate("txs", "/wallet/transactions", type ? { type } : undefined, 8000);
export const useSpotOrders = (status = "open") => usePrivate("sorders", "/spot/orders", { status });
export const useMyTrades = (market = "spot") => usePrivate("mytrades", "/spot/trades", { market }, 6000);
export const usePositions = () => usePrivate("positions", "/futures/positions", undefined, 3000);
export const useFuturesOrders = (status = "open") => usePrivate("forders", "/futures/orders", { status });
export const usePositionHistory = () => usePrivate("phist", "/futures/history", undefined, 8000);
export const useAccountOverview = () => usePrivate("overview", "/account/overview", undefined, 15000);
export const useApiKeys = () => usePrivate("apikeys", "/account/api-keys", undefined, 30000);

export const PRIVATE_KEYS = ["wallet", "txs", "sorders", "mytrades", "positions", "forders", "phist", "overview"];
