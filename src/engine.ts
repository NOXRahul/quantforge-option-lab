/** Risk-neutral European options. All rates are decimals and time is ACT/365. */
export type Kind = "call" | "put";
export type Method = "standard" | "antithetic" | "control";
export interface Market {
  spot: number;
  strike: number;
  maturity: number;
  rate: number;
  dividend: number;
  volatility: number;
  kind: Kind;
}
export interface Config {
  paths: number;
  steps: number;
  seed: number;
  batch: number;
  method: Method;
}
export interface Point {
  n: number;
  price: number;
  se: number;
  low: number;
  high: number;
}
export interface Result {
  method: Method;
  price: number;
  se: number;
  low: number;
  high: number;
  paths: number;
  units: number;
  ms: number;
  pilot: number;
  beta: number;
  convergence: Point[];
  terminal: number[];
  payoffs: number[];
}
export type Greek = "delta" | "gamma" | "vega" | "theta" | "rho";
export const methodNames: Record<Method, string> = {
  standard: "Standard MC",
  antithetic: "Antithetic variates",
  control: "Control variate",
};
export const defaults: Market = {
  spot: 100,
  strike: 100,
  maturity: 1,
  rate: 0.05,
  dividend: 0.01,
  volatility: 0.2,
  kind: "call",
};
export const defaultConfig: Config = {
  paths: 50_000,
  steps: 126,
  seed: 42,
  batch: 10_000,
  method: "antithetic",
};

export function validate(m: Market, c?: Config) {
  const bounds: [keyof Market, number, number][] = [
    ["spot", 0.01, 1e6],
    ["strike", 0.01, 1e6],
    ["maturity", 0, 30],
    ["rate", -0.5, 0.5],
    ["dividend", -0.5, 0.5],
    ["volatility", 0, 3],
  ];
  for (const [key, lo, hi] of bounds) {
    const x = m[key];
    if (typeof x !== "number" || !Number.isFinite(x) || x < lo || x > hi)
      throw new Error(`${key} must be between ${lo} and ${hi}.`);
  }
  if (!["call", "put"].includes(m.kind))
    throw new Error("Select a call or put.");
  if (c) {
    for (const [key, lo, hi] of [
      ["paths", 128, 2_000_000],
      ["steps", 1, 1000],
      ["seed", 0, 4294967295],
      ["batch", 128, 100_000],
    ] as const) {
      if (!Number.isInteger(c[key]) || c[key] < lo || c[key] > hi)
        throw new Error(`${key} must be an integer from ${lo} to ${hi}.`);
    }
    if (!(c.method in methodNames))
      throw new Error("Unknown simulation method.");
    if (c.method === "antithetic" && c.paths % 2)
      throw new Error("Antithetic sampling needs an even path count.");
  }
}

// Complementary error function via incomplete gamma continued fraction / series.
// Uses log-gamma(1/2)=log(sqrt(pi)); avoids the ~1e-7 error of common CDF polynomials.
export function cdf(z: number): number {
  if (z === 0) return 0.5;
  const x = (z * z) / 2;
  if (x > 745) return z > 0 ? 1 : 0;
  const prefactor = Math.exp(0.5 * Math.log(x) - x - 0.5723649429247001);
  let q: number;
  if (x < 1.5) {
    let term = 2,
      sum = term,
      ap = 0.5;
    for (let i = 1; i < 200; i++) {
      ap++;
      term *= x / ap;
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    q = 1 - sum * prefactor;
  } else {
    let b = x + 0.5,
      c = 1e300,
      d = 1 / b,
      h = d;
    for (let i = 1; i < 200; i++) {
      const an = -i * (i - 0.5);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c;
      if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-15) break;
    }
    q = prefactor * h;
  }
  return z > 0 ? 1 - 0.5 * q : 0.5 * q;
}
const pdf = (x: number) => Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);

export function bs(m: Market): number {
  const {
    spot: s,
    strike: k,
    maturity: t,
    rate: r,
    dividend: q,
    volatility: v,
  } = m;
  const a = s * Math.exp(-q * t),
    b = k * Math.exp(-r * t);
  if (t === 0 || v === 0) return Math.max(0, m.kind === "call" ? a - b : b - a);
  const d1 = (Math.log(s / k) + (r - q + (v * v) / 2) * t) / (v * Math.sqrt(t)),
    d2 = d1 - v * Math.sqrt(t);
  if (a <= b) {
    const call = Math.max(0, a * cdf(d1) - b * cdf(d2));
    return m.kind === "call" ? call : call + b - a;
  }
  const put = Math.max(0, b * cdf(-d2) - a * cdf(-d1));
  return m.kind === "put" ? put : put + a - b;
}

export function greeks(m: Market): Record<Greek, number> {
  const {
    spot: s,
    strike: k,
    maturity: t,
    rate: r,
    dividend: q,
    volatility: v,
  } = m;
  const a = s * Math.exp(-q * t),
    b = k * Math.exp(-r * t);
  if (t === 0 || v === 0) {
    if (Math.abs(a - b) <= 1e-12 * Math.max(a, b))
      return { delta: NaN, gamma: NaN, vega: NaN, theta: NaN, rho: NaN };
    const active = m.kind === "call" ? a > b : b > a,
      sign = m.kind === "call" ? 1 : -1;
    return {
      delta: active ? sign * Math.exp(-q * t) : 0,
      gamma: 0,
      vega: 0,
      theta: t === 0 ? NaN : active ? (sign * (q * a - r * b)) / 365 : 0,
      rho: active ? (sign * t * b) / 100 : 0,
    };
  }
  const d1 = (Math.log(s / k) + (r - q + (v * v) / 2) * t) / (v * Math.sqrt(t)),
    d2 = d1 - v * Math.sqrt(t);
  const common = (-a * pdf(d1) * v) / (2 * Math.sqrt(t));
  return {
    delta: Math.exp(-q * t) * (m.kind === "call" ? cdf(d1) : cdf(d1) - 1),
    gamma: (Math.exp(-q * t) * pdf(d1)) / (s * v * Math.sqrt(t)),
    vega: (a * pdf(d1) * Math.sqrt(t)) / 100,
    theta:
      (m.kind === "call"
        ? common - r * b * cdf(d2) + q * a * cdf(d1)
        : common + r * b * cdf(-d2) - q * a * cdf(-d1)) / 365,
    rho: (m.kind === "call" ? t * b * cdf(d2) : -t * b * cdf(-d2)) / 100,
  };
}

/** sfc32 seeded using splitmix32. Non-cryptographic research RNG, version 1. */
export function rng(seed: number) {
  let state = seed >>> 0;
  const mix = () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
  let a = mix(),
    b = mix(),
    c = mix(),
    d = mix();
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return ((t >>> 0) + 0.5) / 4294967296;
  };
}
function normal(random: () => number) {
  let spare: number | undefined;
  return () => {
    if (spare !== undefined) {
      const z = spare;
      spare = undefined;
      return z;
    }
    const rad = Math.sqrt(-2 * Math.log(random())),
      angle = 2 * Math.PI * random();
    spare = rad * Math.sin(angle);
    return rad * Math.cos(angle);
  };
}
class Moments {
  n = 0;
  mean = 0;
  m2 = 0;
  add(x: number) {
    this.n++;
    const d = x - this.mean;
    this.mean += d / this.n;
    this.m2 += d * (x - this.mean);
  }
  get se() {
    return this.n > 1
      ? Math.sqrt(Math.max(0, this.m2) / (this.n - 1) / this.n)
      : 0;
  }
}
export const payoff = (s: number, k: number, kind: Kind) =>
  Math.max(0, kind === "call" ? s - k : k - s);

export function simulate(m: Market, c: Config): Result {
  validate(m, c);
  const start = performance.now(),
    z = normal(rng(c.seed)),
    df = Math.exp(-m.rate * m.maturity);
  const drift = (m.rate - m.dividend - 0.5 * m.volatility ** 2) * m.maturity,
    scale = m.volatility * Math.sqrt(m.maturity);
  const terminal = (x: number) => m.spot * Math.exp(drift + scale * x);
  let beta = 0,
    pilot = 0;
  if (c.method === "control" && scale > 0) {
    pilot = 4096;
    const pz = normal(rng((c.seed ^ 0xa3f8912b) >>> 0));
    let mx = 0,
      my = 0,
      cov = 0,
      variance = 0;
    for (let i = 1; i <= pilot; i++) {
      const s = terminal(pz()),
        x = df * s,
        y = df * payoff(s, m.strike, m.kind),
        dx = x - mx;
      mx += dx / i;
      my += (y - my) / i;
      cov += dx * (y - my);
      variance += dx * (x - mx);
    }
    beta = variance > 0 ? cov / variance : 0;
  }
  const factor = c.method === "antithetic" ? 2 : 1,
    units = c.paths / factor,
    mom = new Moments();
  const convergence: Point[] = [],
    samples: number[] = [],
    pays: number[] = [];
  const checkpoints = new Set(
    Array.from({ length: 40 }, (_, i) =>
      Math.round(64 * Math.pow(units / 64, i / 39)),
    ),
  );
  checkpoints.add(units);
  for (
    let batchStart = 0;
    batchStart < units;
    batchStart += Math.max(1, Math.floor(c.batch / factor))
  ) {
    const end = Math.min(
      units,
      batchStart + Math.max(1, Math.floor(c.batch / factor)),
    );
    for (let i = batchStart; i < end; i++) {
      const draw = z(),
        s = terminal(draw),
        p = payoff(s, m.strike, m.kind);
      let value = df * p;
      if (samples.length < 20_000) {
        samples.push(s);
        pays.push(p);
      }
      if (factor === 2) {
        const other = terminal(-draw),
          op = payoff(other, m.strike, m.kind);
        value = (value + df * op) / 2;
        if (samples.length < 20_000) {
          samples.push(other);
          pays.push(op);
        }
      }
      if (c.method === "control")
        value -= beta * (df * s - m.spot * Math.exp(-m.dividend * m.maturity));
      mom.add(value);
      if (checkpoints.has(i + 1))
        convergence.push({
          n: (i + 1) * factor,
          price: mom.mean,
          se: mom.se,
          low: mom.mean - 1.96 * mom.se,
          high: mom.mean + 1.96 * mom.se,
        });
    }
  }
  return {
    method: c.method,
    price: mom.mean,
    se: mom.se,
    low: mom.mean - 1.96 * mom.se,
    high: mom.mean + 1.96 * mom.se,
    paths: c.paths,
    units,
    ms: performance.now() - start,
    pilot,
    beta,
    convergence,
    terminal: samples,
    payoffs: pays,
  };
}

export function trajectories(
  m: Market,
  c: Config,
  count = 32,
  horizon = m.maturity,
) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 128 ||
    horizon < 0 ||
    horizon > 30 ||
    !Number.isFinite(horizon)
  )
    throw new Error("Invalid display trajectory settings.");
  const z = normal(rng((c.seed ^ 0x7133aff1) >>> 0)),
    dt = horizon / c.steps;
  const paths = Array.from({ length: count }, () => [m.spot]);
  for (let t = 1; t <= c.steps; t++)
    for (let p = 0; p < count; p++)
      paths[p].push(
        paths[p][t - 1] *
          Math.exp(
            (m.rate - m.dividend - 0.5 * m.volatility ** 2) * dt +
              m.volatility * Math.sqrt(dt) * z(),
          ),
      );
  return paths;
}

export function impliedVol(target: number, m: Market): number {
  validate(m);
  if (m.maturity === 0)
    throw new Error("Implied volatility is undefined at expiry.");
  const a = m.spot * Math.exp(-m.dividend * m.maturity),
    b = m.strike * Math.exp(-m.rate * m.maturity);
  const low = bs({ ...m, volatility: 0 }),
    upper = m.kind === "call" ? a : b;
  if (!Number.isFinite(target) || target < low || target >= upper)
    throw new Error(
      `Premium must be at least $${low.toFixed(4)} and below $${upper.toFixed(4)}.`,
    );
  if (target - low < 1e-9) return 0;
  let lo = 0,
    hi = 3;
  if (bs({ ...m, volatility: hi }) < target - 1e-9)
    throw new Error(
      "The implied volatility exceeds the supported 300% maximum.",
    );
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2,
      value = bs({ ...m, volatility: mid });
    if (Math.abs(value - target) < 1e-9) return mid;
    if (value < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function simulatedGreeks(m: Market, c: Config) {
  if (
    m.maturity < 1e-4 ||
    m.maturity > 29.99 ||
    m.volatility < 1e-4 ||
    m.volatility > 2.999 ||
    Math.abs(m.rate) > 0.499 ||
    m.spot > 990_000
  )
    throw new Error(
      "Finite differences require parameters away from expiry, zero volatility and engine limits.",
    );
  const hs = 0.01 * m.spot,
    hv = Math.min(0.001, m.volatility / 2),
    ht = Math.min(1 / 365, m.maturity / 2),
    hr = 0.0001;
  const p = (field: keyof Market, bump: number) => ({
    ...m,
    [field]: (m[field] as number) + bump,
  });
  const variants = [
    m,
    p("spot", hs),
    p("spot", -hs),
    p("volatility", hv),
    p("volatility", -hv),
    p("maturity", ht),
    p("maturity", -ht),
    p("rate", hr),
    p("rate", -hr),
  ];
  const moments = Array.from({ length: 5 }, () => new Moments()),
    z = normal(rng(c.seed));
  for (let i = 0; i < Math.min(c.paths, 100_000); i++) {
    const draw = z(),
      v = variants.map(
        (x) =>
          Math.exp(-x.rate * x.maturity) *
          payoff(
            x.spot *
              Math.exp(
                (x.rate - x.dividend - 0.5 * x.volatility ** 2) * x.maturity +
                  x.volatility * Math.sqrt(x.maturity) * draw,
              ),
            x.strike,
            x.kind,
          ),
      );
    const values = [
      (v[1] - v[2]) / (2 * hs),
      (v[1] - 2 * v[0] + v[2]) / (hs * hs),
      (v[3] - v[4]) / (2 * hv * 100),
      -(v[5] - v[6]) / (2 * ht * 365),
      (v[7] - v[8]) / (2 * hr * 100),
    ];
    values.forEach((value, j) => moments[j].add(value));
  }
  return Object.fromEntries(
    ["delta", "gamma", "vega", "theta", "rho"].map((name, i) => [
      name,
      { value: moments[i].mean, se: moments[i].se },
    ]),
  ) as Record<Greek, { value: number; se: number }>;
}
