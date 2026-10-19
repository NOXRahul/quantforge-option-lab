import {
  bs,
  greeks,
  methodNames,
  type Market,
  type Config,
  type Result,
} from "./engine";
export interface Experiment {
  market: Market;
  config: Config;
  results: Result[];
  created: string;
}
export function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function metadata(e: Experiment) {
  return {
    schema: "quantforge-experiment-v1",
    engine: "sfc32-boxmuller-v1",
    created: e.created,
    market: e.market,
    config: e.config,
    benchmark: bs(e.market),
    greeks: greeks(e.market),
    results: e.results.map(({ terminal, payoffs, ...r }) => r),
    disclaimer:
      "Theoretical European options under constant-parameter risk-neutral GBM. No live market data. Intervals measure Monte Carlo sampling uncertainty only.",
  };
}
export function resultCSV(e: Experiment) {
  const benchmark = bs(e.market),
    fields = [
      "method",
      "price",
      "standard_error",
      "ci_95_low",
      "ci_95_high",
      "absolute_error",
      "relative_error",
      "paths",
      "independent_units",
      "pilot_paths",
      "runtime_ms",
      "seed",
      "spot",
      "strike",
      "maturity_years",
      "rate",
      "dividend",
      "volatility",
      "option_type",
    ];
  return [
    fields.join(","),
    ...e.results.map((r) =>
      [
        methodNames[r.method],
        r.price,
        r.se,
        r.low,
        r.high,
        Math.abs(r.price - benchmark),
        benchmark > 1e-10 ? Math.abs(r.price - benchmark) / benchmark : "",
        r.paths,
        r.units,
        r.pilot,
        r.ms,
        e.config.seed,
        e.market.spot,
        e.market.strike,
        e.market.maturity,
        e.market.rate,
        e.market.dividend,
        e.market.volatility,
        e.market.kind,
      ].join(","),
    ),
  ].join("\n");
}
export function report(e: Experiment) {
  const m = e.market,
    benchmark = bs(m);
  return `# QUANTFORGE | OPTION LAB\n\nReproducible simulation report · ${e.created}\n\n## Contract and assumptions\n\nEuropean ${m.kind}; spot $${m.spot}; strike $${m.strike}; maturity ${m.maturity} years (ACT/365); annual volatility ${m.volatility * 100}%; continuously compounded risk-free rate ${m.rate * 100}%; continuous dividend yield ${m.dividend * 100}%. Prices are dollars per share, without a contract multiplier. No live data.\n\n## Experiment\n\nSeed ${e.config.seed}; requested paths ${e.config.paths}; batch ${e.config.batch}; visualization time steps ${e.config.steps}. Browser engine sfc32-boxmuller-v1. Terminal prices are sampled exactly under GBM; steps affect illustrative trajectories only. Main estimates retain at most 20,000 terminal/payoff samples for histograms.\n\nBlack–Scholes–Merton benchmark: $${benchmark.toFixed(8)}.\n\n| Method | Price | SE | 95% CI | Paths | Units | Pilot | Runtime ms |\n|---|---:|---:|---|---:|---:|---:|---:|\n${e.results.map((r) => `| ${methodNames[r.method]} | ${r.price.toFixed(8)} | ${r.se.toFixed(8)} | [${r.low.toFixed(8)}, ${r.high.toFixed(8)}] | ${r.paths} | ${r.units} | ${r.pilot} | ${r.ms.toFixed(2)} |`).join("\n")}\n\n## Greeks and units\n\n${Object.entries(
    greeks(m),
  )
    .map(
      ([k, v]) =>
        `- ${k}: ${Number.isFinite(v) ? v.toFixed(8) : "undefined at this boundary"}`,
    )
    .join(
      "\n",
    )}\n\nDelta is premium change per $1 spot; gamma is delta change per $1 spot; vega and rho are premium changes per one percentage-point volatility/rate change; theta is premium change per calendar day.\n\n## Statistical methodology\n\nStandard: discounted payoff mean; sample standard deviation divided by square root of paths. Antithetic: paired Z and -Z; each pair is ONE independent observation. Control variate: discounted stock with expectation S exp(-qT); beta fitted on an independent 4,096-path pilot when stochastic. Main MC methods use common draws for comparison, so their errors are correlated. Variance reduction compares estimator SE squared; control pilot cost is additional. Intervals are approximate normal intervals mean ± 1.96 SE, and convergence intervals are pointwise, not simultaneous.\n\n## Limitations\n\nConstant volatility, rates and dividends; lognormal continuous paths; European exercise; no transaction costs or discrete dividends. Confidence intervals quantify simulation noise under the assumed model, not a market-price guarantee. Sparse rare-event payoffs and extreme parameters can invalidate normal approximations; a zero observed SE is not proof of accuracy. A single run's absolute error need not decrease monotonically. Finite-difference Greeks have bump bias as well as sampling error. The browser RNG is a reproducible research generator, not a cryptographic generator.\n\n## Reproduce\n\nImport the accompanying experiment JSON into Research, then run the simulation. Numerical outputs are reproducible with this engine version; runtime depends on the device.\n\n## References\n\n- Martin Haugh, Columbia University: https://www.columbia.edu/~mh2078/FoundationsFE/BlackScholes.pdf\n- Glasserman, Monte Carlo Methods in Financial Engineering (2004), chapters on simulation and variance reduction.\n`;
}
