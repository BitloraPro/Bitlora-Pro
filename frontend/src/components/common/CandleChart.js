import { useEffect, useRef } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import { useKlines } from "@/hooks/useMarket";
import { cn } from "@/lib/utils";

export const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export function IntervalTabs({ value, onChange, className, testid = "chart-interval" }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {INTERVALS.map((i) => (
        <button key={i} data-testid={`${testid}-${i}`} onClick={() => onChange(i)} className={cn("tab-pill font-num", value === i && "tab-pill-active text-[#f59e0b]")}>
          {i}
        </button>
      ))}
    </div>
  );
}

export default function CandleChart({ symbol, interval, height = 420, compact = false }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const lastKey = useRef("");
  const { data } = useKlines(symbol, interval);

  useEffect(() => {
    const chart = createChart(ref.current, {
      height,
      localization: { locale: "en-US" },
      layout: { background: { color: "transparent" }, textColor: "#6b7280", fontFamily: "JetBrains Mono", fontSize: compact ? 9 : 11 },
      grid: { vertLines: { color: "rgba(31,41,55,0.45)" }, horzLines: { color: "rgba(31,41,55,0.45)" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#1f2937", scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: "#1f2937", timeVisible: true, secondsVisible: false, visible: !compact },
      handleScroll: !compact,
      handleScale: !compact,
    });
    const candles = chart.addCandlestickSeries({ upColor: "#10b981", downColor: "#ef4444", borderVisible: false, wickUpColor: "#10b981", wickDownColor: "#ef4444" });
    const volume = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    seriesRef.current = { candles, volume };
    const ro = new ResizeObserver(() => chart.applyOptions({ width: ref.current.clientWidth }));
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, [height, compact]);

  useEffect(() => {
    if (!data?.length) return;
    const { candles, volume } = seriesRef.current;
    const key = `${symbol}-${interval}`;
    const prec = data[data.length - 1].close >= 1000 ? 2 : data[data.length - 1].close >= 1 ? 4 : 8;
    candles.applyOptions({ priceFormat: { type: "price", precision: prec, minMove: 1 / 10 ** prec } });
    candles.setData(data.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    volume.setData(data.map((d) => ({ time: d.time, value: d.volume, color: d.close >= d.open ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)" })));
    if (lastKey.current !== key) {
      chartRef.current.timeScale().fitContent();
      lastKey.current = key;
    }
  }, [data, symbol, interval]);

  return <div ref={ref} className="w-full" style={{ height }} data-testid="candle-chart" />;
}
