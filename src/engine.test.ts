import { describe, it, expect } from "vitest";
import {
  bs,
  cdf,
  defaults,
  defaultConfig,
  greeks,
  impliedVol,
  rng,
  simulate,
  simulatedGreeks,
  trajectories,
  validate,
  type Market,
  type Method,
} from "./engine";

const classic: Market = { ...defaults, dividend: 0 };
describe("Analytical pricing and boundaries", () => {
  it("matches standard normal reference values accurately", () => {
    expect(cdf(0)).toBe(0.5);
    expect(cdf(1)).toBeCloseTo(0.8413447460685429, 13);
    expect(cdf(-1.96)).toBeCloseTo(0.0249978951482204, 13);
    expect(cdf(3)).toBeCloseTo(0.9986501019683699, 13);
    expect(cdf(-8)).toBeCloseTo(6.22096057427178e-16, 26);
    for (const z of [0.001, 0.3, 1.2, 2, 4, 6])
      expect(cdf(z) + cdf(-z)).toBeCloseTo(1, 14);
  });
  it("reproduces canonical call and put prices", () => {
    expect(bs(classic)).toBeCloseTo(10.450583572185565, 10);
    expect(bs({ ...classic, kind: "put" })).toBeCloseTo(5.573526022256971, 10);
    expect(bs(defaults)).toBeCloseTo(9.826297782739111, 10);
  });
  it("satisfies put-call parity with dividends and negative rates", () => {
    for (const spot of [1, 70, 100, 150, 5000])
      for (const rate of [-0.1, 0, 0.07])
        for (const dividend of [-0.01, 0, 0.04]) {
          const m = { ...defaults, spot, rate, dividend };
          expect(
            bs({ ...m, kind: "call" }) - bs({ ...m, kind: "put" }),
          ).toBeCloseTo(
            spot * Math.exp(-dividend * m.maturity) -
              m.strike * Math.exp(-rate * m.maturity),
            9,
          );
        }
  });
  it("handles deterministic forwards, expiry and extreme strikes explicitly", () => {
    expect(bs({ ...classic, volatility: 0 })).toBeCloseTo(
      100 - 100 * Math.exp(-0.05),
      12,
    );
    expect(bs({ ...classic, maturity: 0, spot: 120 })).toBe(20);
    expect(bs({ ...classic, maturity: 0, spot: 80, kind: "put" })).toBe(20);
    expect(bs({ ...classic, strike: 1e6 })).toBe(0);
    expect(bs({ ...classic, strike: 0.01, kind: "put" })).toBe(0);
    expect(bs({ ...classic, maturity: 1e-12 })).toBeGreaterThan(0);
  });
  it("rejects invalid market and simulation inputs", () => {
    for (const patch of [
      { spot: 0 },
      { spot: NaN },
      { strike: -1 },
      { maturity: -1 },
      { rate: Infinity },
      { dividend: 1 },
      { volatility: 4 },
    ])
      expect(() => validate({ ...defaults, ...patch })).toThrow();
    for (const patch of [
      { paths: 0 },
      { paths: 129 },
      { paths: 2_000_001 },
      { seed: 1.5 },
      { batch: 0 },
      { steps: 1001 },
    ])
      expect(() =>
        simulate(defaults, { ...defaultConfig, ...patch }),
      ).toThrow();
  });
});

describe("Greeks and conventions", () => {
  it("matches canonical Greeks per percentage point and calendar day", () => {
    const g = greeks(classic);
    expect(g.delta).toBeCloseTo(0.6368306511756191, 10);
    expect(g.gamma).toBeCloseTo(0.018762017345846895, 10);
    expect(g.vega).toBeCloseTo(0.3752403469169379, 10);
    expect(g.theta).toBeCloseTo(-6.414027546438197 / 365, 10);
    expect(g.rho).toBeCloseTo(0.5323248154537634, 10);
  });
  it("agrees with finite differences for both option kinds", () => {
    for (const kind of ["call", "put"] as const) {
      const m = { ...defaults, kind },
        g = greeks(m),
        hs = 0.01,
        hv = 0.00001,
        ht = 0.00001,
        hr = 0.00001;
      expect(g.delta).toBeCloseTo(
        (bs({ ...m, spot: m.spot + hs }) - bs({ ...m, spot: m.spot - hs })) /
          (2 * hs),
        6,
      );
      expect(g.gamma).toBeCloseTo(
        (bs({ ...m, spot: m.spot + hs }) -
          2 * bs(m) +
          bs({ ...m, spot: m.spot - hs })) /
          (hs * hs),
        6,
      );
      expect(g.vega).toBeCloseTo(
        (bs({ ...m, volatility: m.volatility + hv }) -
          bs({ ...m, volatility: m.volatility - hv })) /
          (2 * hv * 100),
        6,
      );
      expect(g.theta).toBeCloseTo(
        -(
          bs({ ...m, maturity: m.maturity + ht }) -
          bs({ ...m, maturity: m.maturity - ht })
        ) /
          (2 * ht * 365),
        6,
      );
      expect(g.rho).toBeCloseTo(
        (bs({ ...m, rate: m.rate + hr }) - bs({ ...m, rate: m.rate - hr })) /
          (2 * hr * 100),
        6,
      );
    }
  });
  it("does not invent derivatives at kinks or expiry", () => {
    expect(Number.isNaN(greeks({ ...classic, maturity: 0 }).delta)).toBe(true);
    expect(
      Number.isNaN(greeks({ ...classic, maturity: 0, spot: 120 }).theta),
    ).toBe(true);
    expect(greeks({ ...classic, volatility: 0 }).gamma).toBe(0);
  });
  it("validates common-random-number MC Greeks and their uncertainty", () => {
    const g = greeks(defaults),
      est = simulatedGreeks(defaults, { ...defaultConfig, paths: 100_000 });
    for (const key of ["delta", "gamma", "vega", "theta", "rho"] as const)
      expect(Math.abs(est[key].value - g[key])).toBeLessThan(
        5 * est[key].se + 1e-4,
      );
    expect(() =>
      simulatedGreeks({ ...defaults, maturity: 0 }, defaultConfig),
    ).toThrow();
  });
});

describe("Monte Carlo estimation and statistical units", () => {
  it("is reproducible, seed-sensitive and invariant to batch sizes", () => {
    const a = simulate(defaults, defaultConfig),
      b = simulate(defaults, defaultConfig),
      c = simulate(defaults, { ...defaultConfig, batch: 128 }),
      d = simulate(defaults, { ...defaultConfig, seed: 43 });
    expect(a.price).toBe(b.price);
    expect(a.convergence).toEqual(b.convergence);
    expect(a.terminal).toEqual(b.terminal);
    expect(a.price).toBe(c.price);
    expect(a.se).toBe(c.se);
    expect(a.price).not.toBe(d.price);
  });
  it("converges to analytical values for call and put with each method", () => {
    for (const kind of ["call", "put"] as const)
      for (const method of ["standard", "antithetic", "control"] as Method[]) {
        const m = { ...defaults, kind },
          r = simulate(m, { ...defaultConfig, method, paths: 200_000 });
        expect(Math.abs(r.price - bs(m))).toBeLessThan(5 * r.se);
        expect(r.low).toBeCloseTo(r.price - 1.96 * r.se, 12);
        expect(r.high).toBeCloseTo(r.price + 1.96 * r.se, 12);
        expect(r.convergence.at(-1)!.price).toBe(r.price);
      }
  });
  it("computes standard SE from independent discounted payoffs", () => {
    const r = simulate(defaults, {
        ...defaultConfig,
        method: "standard",
        paths: 10000,
      }),
      values = r.payoffs.map(
        (p) => p * Math.exp(-defaults.rate * defaults.maturity),
      ),
      mean = values.reduce((a, b) => a + b) / values.length;
    const se = Math.sqrt(
      values.reduce((s, x) => s + (x - mean) ** 2, 0) /
        (values.length - 1) /
        values.length,
    );
    expect(r.price).toBeCloseTo(mean, 10);
    expect(r.se).toBeCloseTo(se, 12);
    expect(r.units).toBe(10000);
  });
  it("computes antithetic SE from pair means, not individual paths", () => {
    const r = simulate(defaults, {
        ...defaultConfig,
        method: "antithetic",
        paths: 10000,
      }),
      df = Math.exp(-defaults.rate * defaults.maturity);
    const pairs = Array.from(
        { length: r.payoffs.length / 2 },
        (_, i) => (df * (r.payoffs[2 * i] + r.payoffs[2 * i + 1])) / 2,
      ),
      mean = pairs.reduce((a, b) => a + b) / pairs.length;
    const se = Math.sqrt(
      pairs.reduce((s, x) => s + (x - mean) ** 2, 0) /
        (pairs.length - 1) /
        pairs.length,
    );
    expect(r.units).toBe(5000);
    expect(r.se).toBeCloseTo(se, 12);
    expect(r.price).toBeCloseTo(mean, 10);
  });
  it("reduces variance at a matched main path budget and records pilot cost", () => {
    const std = simulate(defaults, { ...defaultConfig, method: "standard" }),
      anti = simulate(defaults, defaultConfig),
      control = simulate(defaults, { ...defaultConfig, method: "control" });
    expect(anti.se).toBeLessThan(std.se);
    expect(control.se).toBeLessThan(std.se);
    expect(control.pilot).toBe(4096);
    expect(control.beta).toBeGreaterThan(0);
    expect(control.units).toBe(defaultConfig.paths);
  });
  it("handles zero volatility and maturity without division by zero", () => {
    for (const m of [
      { ...defaults, volatility: 0 },
      { ...defaults, maturity: 0 },
      { ...defaults, maturity: 0, spot: 120 },
    ])
      for (const method of ["standard", "antithetic", "control"] as Method[]) {
        const r = simulate(m, { ...defaultConfig, method });
        expect(r.price).toBeCloseTo(bs(m), 10);
        expect(r.se).toBe(0);
      }
  });
  it("retains a bounded display sample and the full requested estimate count", () => {
    const r = simulate(defaults, { ...defaultConfig, paths: 200_000 });
    expect(r.terminal.length).toBe(20_000);
    expect(r.paths).toBe(200_000);
  });
  it("gives approximate 1/sqrt(N) SE scaling", () => {
    const a = simulate(defaults, {
        ...defaultConfig,
        method: "standard",
        paths: 50_000,
      }),
      b = simulate(defaults, {
        ...defaultConfig,
        method: "standard",
        paths: 200_000,
      });
    expect(a.se / b.se).toBeGreaterThan(1.9);
    expect(a.se / b.se).toBeLessThan(2.1);
  });
  it("does not couple visualization steps to terminal pricing", () => {
    expect(simulate(defaults, { ...defaultConfig, steps: 1 }).price).toBe(
      simulate(defaults, { ...defaultConfig, steps: 1000 }).price,
    );
  });
});

describe("Implied volatility and display paths", () => {
  it("recovers known annual volatility for calls and puts", () => {
    for (const kind of ["call", "put"] as const)
      for (const v of [0.05, 0.2, 0.7, 1.5]) {
        const m = { ...defaults, kind, volatility: v };
        expect(impliedVol(bs(m), m)).toBeCloseTo(v, 7);
      }
    expect(impliedVol(bs({ ...defaults, volatility: 0 }), defaults)).toBe(0);
  });
  it("rejects impossible premiums and unidentifiable expiry volatility", () => {
    expect(() => impliedVol(-1, defaults)).toThrow();
    expect(() => impliedVol(1000, defaults)).toThrow();
    expect(() => impliedVol(1, { ...defaults, maturity: 0 })).toThrow();
    expect(() => impliedVol(NaN, defaults)).toThrow();
  });
  it("generates deterministic seeded trajectories with the correct initial condition", () => {
    const paths = trajectories(defaults, defaultConfig, 8);
    expect(paths).toEqual(trajectories(defaults, defaultConfig, 8));
    expect(paths).toHaveLength(8);
    expect(paths[0]).toHaveLength(127);
    expect(paths.every((p) => p[0] === 100)).toBe(true);
    const zero = trajectories({ ...defaults, volatility: 0 }, defaultConfig, 2);
    expect(zero[0].at(-1)).toBeCloseTo(100 * Math.exp(0.04), 9);
  });
  it("seeds the RNG deterministically without endpoint uniforms", () => {
    const a = rng(42),
      b = rng(42);
    for (let i = 0; i < 10000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
  });
});
