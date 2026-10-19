import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  BarChart,
  Bar,
} from "recharts";
import {
  type Result,
  type Market,
  type Config,
  type Greek,
  bs,
  greeks,
  trajectories,
  payoff,
} from "./engine";

const red = "#ef6575",
  silver = "#b9bdca",
  muted = "#686874";
const axis = {
  tick: { fill: muted, fontSize: 10, fontFamily: "IBM Plex Mono" },
  axisLine: false,
  tickLine: false,
};
const tip = {
  contentStyle: {
    background: "#19171d",
    border: "1px solid #35313d",
    borderRadius: 8,
    fontSize: 11,
  },
  labelStyle: { color: "#a7a1af" },
  itemStyle: { color: "#eee9ef" },
};
export function Convergence({
  result,
  benchmark,
  small = false,
}: {
  result: Result;
  benchmark: number;
  small?: boolean;
}) {
  const data = result.convergence.map((p) => ({ ...p, band: [p.low, p.high] }));
  return (
    <div className={`chart ${small ? "short" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 12, bottom: 4, left: small ? -20 : -10 }}
        >
          <defs>
            <linearGradient
              id={small ? "ci-small" : "ci-large"}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={red} stopOpacity={0.2} />
              <stop offset="100%" stopColor={red} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#242129" vertical={false} />
          <XAxis
            dataKey="n"
            type="number"
            scale="log"
            domain={["dataMin", "dataMax"]}
            {...axis}
            tickFormatter={(v) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
            minTickGap={30}
          />
          <YAxis
            {...axis}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${v.toFixed(1)}`}
            width={60}
          />
          <Tooltip
            {...tip}
            formatter={(v: any, name: any) =>
              name === "95% CI"
                ? [(v as number[]).map((x) => x.toFixed(4)).join(" – "), name]
                : [Number(v).toFixed(4), name]
            }
            labelFormatter={(v) => `${Number(v).toLocaleString()} paths`}
          />
          <Area
            dataKey="band"
            name="95% CI"
            stroke="none"
            fill={`url(#${small ? "ci-small" : "ci-large"})`}
            isAnimationActive={false}
          />
          <ReferenceLine y={benchmark} stroke={silver} strokeDasharray="4 5" />
          <Line
            type="linear"
            dataKey="price"
            name="MC estimate"
            stroke={red}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Distribution({
  samples,
  strike,
  title = "Count",
  small = false,
}: {
  samples: number[];
  strike?: number;
  title?: string;
  small?: boolean;
}) {
  const sorted = [...samples].sort((a, b) => a - b),
    lo = sorted[0] ?? 0,
    hi = sorted.at(-1) ?? 1,
    width = (hi - lo || 1) / 40;
  const data = Array.from({ length: 40 }, (_, i) => ({
    x: lo + (i + 0.5) * width,
    count: 0,
  }));
  samples.forEach(
    (s) => data[Math.min(39, Math.floor((s - lo) / width))].count++,
  );
  return (
    <div className={`chart ${small ? "short" : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 12, bottom: 4, left: -15 }}
          barCategoryGap={1}
        >
          <defs>
            <linearGradient id="histogram-red" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e06c7c" />
              <stop offset="100%" stopColor="#652032" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#242129" vertical={false} />
          <XAxis
            dataKey="x"
            {...axis}
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
          />
          <YAxis
            {...axis}
            tickFormatter={(v) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
            }
          />
          <Tooltip
            {...tip}
            labelFormatter={(v) => `Bin around $${Number(v).toFixed(2)}`}
          />
          {strike !== undefined && (
            <ReferenceLine
              x={strike}
              stroke="#d6cad9"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{ value: "K", fill: "#d6cad9", fontSize: 10 }}
            />
          )}
          <Bar
            dataKey="count"
            name={title}
            fill="url(#histogram-red)"
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Trajectories({
  market,
  config,
  count,
  horizon,
}: {
  market: Market;
  config: Config;
  count: number;
  horizon: number;
}) {
  const paths = trajectories(market, config, count, horizon),
    data = Array.from({ length: config.steps + 1 }, (_, i) => ({
      t: (i / config.steps) * horizon,
      ...Object.fromEntries(paths.map((p, j) => [`p${j}`, p[i]])),
    }));
  return (
    <div className="chart tall">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 20, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="#242129" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickCount={6}
            {...axis}
            tickFormatter={(v) => `${Number(v).toFixed(1)}y`}
            minTickGap={45}
          />
          <YAxis
            {...axis}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
          />
          <Tooltip
            {...tip}
            labelFormatter={(v) => `${Number(v).toFixed(3)} years`}
            formatter={(v: any) => Number(v).toFixed(2)}
          />
          <ReferenceLine
            y={market.strike}
            stroke={silver}
            strokeDasharray="3 5"
          />
          {paths.map((_, i) => (
            <Line
              key={i}
              dataKey={`p${i}`}
              name={`Path ${i + 1}`}
              stroke={
                i % 5 === 0 ? "#f4bdc8" : i % 3 === 0 ? "#914b80" : "#c4475f"
              }
              strokeWidth={i === 0 ? 2 : 1}
              opacity={0.55}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sensitivity({
  market,
  metric = "price",
  variable = "spot",
}: {
  market: Market;
  metric?: Greek | "price";
  variable?: "spot" | "volatility" | "maturity";
}) {
  const lower =
      variable === "spot"
        ? market.spot * 0.6
        : variable === "volatility"
          ? 0.001
          : 0.001,
    upper =
      variable === "spot"
        ? market.spot * 1.4
        : variable === "volatility"
          ? Math.min(3, Math.max(0.6, market.volatility * 1.5))
          : Math.min(30, Math.max(2, market.maturity * 1.5));
  const data = Array.from({ length: 65 }, (_, i) => {
    const x = lower + (i / 64) * (upper - lower),
      call = { ...market, [variable]: x, kind: "call" as const },
      put = { ...call, kind: "put" as const };
    return {
      x,
      call: metric === "price" ? bs(call) : greeks(call)[metric],
      put: metric === "price" ? bs(put) : greeks(put)[metric],
    };
  });
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 15, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="#242129" vertical={false} />
          <XAxis
            dataKey="x"
            {...axis}
            minTickGap={30}
            tickFormatter={(v) =>
              variable === "spot"
                ? `$${Number(v).toFixed(0)}`
                : variable === "volatility"
                  ? `${(Number(v) * 100).toFixed(0)}%`
                  : `${Number(v).toFixed(1)}y`
            }
          />
          <YAxis
            {...axis}
            domain={["auto", "auto"]}
            tickFormatter={(v) => Number(v).toFixed(2)}
          />
          <Tooltip
            {...tip}
            formatter={(v: any) => Number(v).toFixed(5)}
            labelFormatter={(v) => `${variable}: ${Number(v).toFixed(4)}`}
          />
          <Line
            dataKey="call"
            name="Call"
            stroke={red}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="put"
            name="Put"
            stroke={silver}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PayoffChart({
  market,
  premium,
  financed,
}: {
  market: Market;
  premium: number;
  financed: boolean;
}) {
  const cost =
      premium * (financed ? Math.exp(market.rate * market.maturity) : 1),
    breakEven =
      market.kind === "call" ? market.strike + cost : market.strike - cost;
  const max = Math.max(
      market.spot * 1.65,
      market.strike * 1.45,
      breakEven * 1.2,
    ),
    data = Array.from({ length: 101 }, (_, i) => {
      const s = (i / 100) * max,
        p = payoff(s, market.strike, market.kind);
      return { s, payoff: p, profit: p - cost };
    });
  return (
    <div className="chart tall">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
        >
          <CartesianGrid stroke="#242129" vertical={false} />
          <XAxis
            dataKey="s"
            {...axis}
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
            minTickGap={40}
          />
          <YAxis {...axis} tickFormatter={(v) => `$${Number(v).toFixed(0)}`} />
          <Tooltip
            {...tip}
            labelFormatter={(v) => `Expiry spot $${Number(v).toFixed(2)}`}
            formatter={(v: any) => `$${Number(v).toFixed(2)}`}
          />
          <ReferenceLine y={0} stroke="#67616f" />
          <Line
            dataKey="payoff"
            name="Gross payoff"
            stroke={silver}
            strokeDasharray="5 5"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="profit"
            name="Profit after premium"
            stroke={red}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SmileChart({
  data,
}: {
  data: { strike: number; iv: number }[];
}) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#242129" vertical={false} />
          <XAxis dataKey="strike" {...axis} tickFormatter={(v) => `$${v}`} />
          <YAxis
            {...axis}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
          />
          <Tooltip
            {...tip}
            formatter={(v: any) => `${Number(v).toFixed(3)}%`}
            labelFormatter={(v) => `Strike $${v}`}
          />
          <Line
            dataKey="iv"
            name="Implied volatility"
            stroke={red}
            strokeWidth={2}
            dot={{ r: 4, fill: "#191218", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
