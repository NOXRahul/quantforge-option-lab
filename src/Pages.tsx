import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  CircleHelp,
  FlaskConical,
  Gauge,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Surface from "./Surface";
import {
  Convergence,
  Distribution,
  Trajectories,
  Sensitivity,
  PayoffChart,
  SmileChart,
} from "./Charts";
import {
  bs,
  greeks,
  impliedVol,
  validate,
  methodNames,
  type Market,
  type Config,
  type Result,
  type Greek,
} from "./engine";
import {
  download,
  metadata,
  resultCSV,
  report,
  type Experiment,
} from "./exports";
import { Panel, Chip, NumberField, money, num, pct, greekInfo } from "./ui";

function MethodTable({ experiment }: { experiment: Experiment }) {
  const benchmark = bs(experiment.market),
    standard = experiment.results.find((r) => r.method === "standard")!;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Estimator</th>
            <th>Price</th>
            <th>Abs. error</th>
            <th>Std. error</th>
            <th>Variance ↓</th>
            <th>Paths</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <span className="method-dot silver" />
              Black–Scholes <span className="table-tag">EXACT MODEL</span>
            </td>
            <td>{money(benchmark)}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>Analytical</td>
          </tr>
          {experiment.results.map((r) => (
            <tr key={r.method}>
              <td>
                <span className={`method-dot ${r.method}`} />
                {methodNames[r.method]}
                {r.method === experiment.config.method && (
                  <span className="table-tag selected-tag">SELECTED</span>
                )}
              </td>
              <td>{money(r.price)}</td>
              <td>{money(Math.abs(r.price - benchmark))}</td>
              <td>{money(r.se)}</td>
              <td className="positive">
                {standard.se > 0
                  ? pct(1 - (r.se * r.se) / (standard.se * standard.se), 1)
                  : "—"}
              </td>
              <td>{r.paths.toLocaleString()}</td>
              <td>{num(r.ms, 1)} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SimulationPage({
  experiment,
  result: r,
}: {
  experiment: Experiment;
  result: Result;
}) {
  const { market: m, config: c } = experiment,
    [count, setCount] = useState(24),
    [horizon, setHorizon] = useState(m.maturity),
    [discounted, setDiscounted] = useState(false);
  const benchmark = bs(m),
    sample = discounted
      ? r.payoffs.map((p) => p * Math.exp(-m.rate * m.maturity))
      : r.payoffs;
  return (
    <>
      <div className="stat-ribbon">
        <div>
          <label>PATHS SIMULATED</label>
          <strong>{r.paths.toLocaleString()}</strong>
        </div>
        <div>
          <label>INDEPENDENT OBSERVATIONS</label>
          <strong>{r.units.toLocaleString()}</strong>
        </div>
        <div>
          <label>ESTIMATOR RUNTIME</label>
          <strong>
            {num(r.ms, 1)} <small>ms</small>
          </strong>
        </div>
        <div>
          <label>RANDOM SEED</label>
          <strong>{c.seed}</strong>
        </div>
      </div>
      <Panel
        title="Every path tells a different story"
        kicker="RISK-NEUTRAL TRAJECTORIES"
        action={<Chip>{c.steps} STEPS</Chip>}
      >
        <div className="inline-controls">
          <label>
            Sample paths{" "}
            <select value={count} onChange={(e) => setCount(+e.target.value)}>
              {[8, 24, 48, 96].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Display horizon{" "}
            <select
              value={horizon}
              onChange={(e) => setHorizon(+e.target.value)}
            >
              {Array.from(new Set([m.maturity, 0.25, 0.5, 1, 2]))
                .sort((a, b) => a - b)
                .map((t) => (
                  <option key={t} value={t}>
                    {num(t, 2)} years
                  </option>
                ))}
            </select>
          </label>
          <span className="muted small">
            Separate seeded sample · exact GBM transitions
          </span>
        </div>
        <Trajectories market={m} config={c} count={count} horizon={horizon} />
      </Panel>
      <div className="two-col">
        <Panel title="The terminal distribution" kicker="UNDERLYING PRICE">
          <Distribution samples={r.terminal} strike={m.strike} />
          <p className="panel-note">
            Histogram of {r.terminal.length.toLocaleString()} retained samples;
            dashed line marks the strike.
          </p>
        </Panel>
        <Panel
          title={
            discounted
              ? "Payoffs, in today’s dollars"
              : "The shape of the payoff"
          }
          kicker="OPTION PAYOFF"
          action={
            <button
              className="small-toggle"
              onClick={() => setDiscounted(!discounted)}
            >
              {discounted ? "Discounted" : "At expiry"}
              <RefreshCw size={11} />
            </button>
          }
        >
          <Distribution samples={sample} />
          <p className="panel-note">
            {discounted ? "Discounted" : "Terminal"} gross payoff per share.
            This is not profit after premium.
          </p>
        </Panel>
      </div>
      <Panel
        title="Noise gives way to signal"
        kicker="CONVERGENCE & UNCERTAINTY"
      >
        <Convergence result={r} benchmark={benchmark} />
        <div className="chart-caption">
          <span>
            <i className="legend-line red" />
            Estimate
          </span>
          <span>
            <i className="legend-line dashed" />
            Analytical benchmark
          </span>
          <span>
            <i className="legend-box" />
            95% pointwise interval
          </span>
        </div>
      </Panel>
      <div className="note">
        <CircleHelp size={15} />
        <p>
          Confidence intervals describe sampling uncertainty under the model,
          not a guarantee about market prices. Early estimates and rare-event
          payoffs can have unreliable normal intervals. Error in one run need
          not fall monotonically.{" "}
          {r.se === 0 && m.volatility > 0 && m.maturity > 0
            ? "No sampled variation was observed; a zero-width interval does not rule out rare payoffs."
            : ""}
        </p>
      </div>
      <Panel
        title="Estimator comparison"
        kicker="SAME CONTRACT · SAME PATH BUDGET"
      >
        <MethodTable experiment={experiment} />
        <p className="panel-note">
          Variance reduction compares squared standard errors. Control variates
          add{" "}
          {experiment.results
            .find((x) => x.method === "control")!
            .pilot.toLocaleString()}{" "}
          pilot paths. Standard and control estimators share main random draws.
        </p>
      </Panel>
    </>
  );
}

export function RiskPage({
  market: m,
  config: c,
  estimate,
}: {
  market: Market;
  config: Config;
  estimate: Record<Greek, { value: number; se: number }> | null;
}) {
  const [metric, setMetric] = useState<Greek>("delta"),
    [variable, setVariable] = useState<"spot" | "volatility" | "maturity">(
      "spot",
    ),
    [tab, setTab] = useState<"greeks" | "strategy">("greeks"),
    [spotShift, setSpotShift] = useState(10),
    [volShift, setVolShift] = useState(5),
    [rateShift, setRateShift] = useState(1),
    [premium, setPremium] = useState(bs(m)),
    [financed, setFinanced] = useState(false);
  const g = greeks(m),
    call = bs({ ...m, kind: "call" }),
    put = bs({ ...m, kind: "put" }),
    parity =
      call -
      put -
      (m.spot * Math.exp(-m.dividend * m.maturity) -
        m.strike * Math.exp(-m.rate * m.maturity));
  useEffect(() => setPremium(bs(m)), [m]);
  const cost = premium * (financed ? Math.exp(m.rate * m.maturity) : 1),
    breakEven = m.kind === "call" ? m.strike + cost : m.strike - cost;
  const scenarios = [
    { label: "Base", s: 0, v: 0, r: 0 },
    { label: "Spot move", s: spotShift, v: 0, r: 0 },
    { label: "Volatility move", s: 0, v: volShift, r: 0 },
    { label: "Rate move", s: 0, v: 0, r: rateShift },
    { label: "Combined", s: spotShift, v: volShift, r: rateShift },
  ].map((x) => {
    const next = {
      ...m,
      spot: m.spot * (1 + x.s / 100),
      volatility: m.volatility + x.v / 100,
      rate: m.rate + x.r / 100,
    };
    let value = NaN;
    try {
      validate(next);
      value = bs(next);
    } catch {}
    return { ...x, ...next, value };
  });
  return (
    <>
      <div className="section-switch">
        <button
          className={tab === "greeks" ? "active" : ""}
          onClick={() => setTab("greeks")}
        >
          <Gauge size={14} />
          Greeks & scenarios
        </button>
        <button
          className={tab === "strategy" ? "active" : ""}
          onClick={() => setTab("strategy")}
        >
          <TrendingUp size={14} />
          Strategy & payoff
        </button>
      </div>
      {tab === "greeks" ? (
        <>
          <div className="greek-card-grid">
            {(Object.keys(greekInfo) as Greek[]).map((name, i) => (
              <button
                key={name}
                onClick={() => setMetric(name)}
                className={`greek-card ${metric === name ? "active" : ""}`}
                title={greekInfo[name].description}
              >
                <div>
                  <span>{name}</span>
                  <i>{["Δ", "Γ", "ν", "Θ", "ρ"][i]}</i>
                </div>
                <strong>{num(g[name])}</strong>
                <small>{greekInfo[name].unit}</small>
              </button>
            ))}
          </div>
          <div className="two-col">
            <Panel
              title={`${metric.charAt(0).toUpperCase() + metric.slice(1)} across the market`}
              kicker="ANALYTICAL SENSITIVITY"
              action={
                <select
                  aria-label="Sensitivity variable"
                  className="compact-select"
                  value={variable}
                  onChange={(e) =>
                    setVariable(e.target.value as typeof variable)
                  }
                >
                  <option value="spot">Spot price</option>
                  <option value="volatility">Volatility</option>
                  <option value="maturity">Time to expiry</option>
                </select>
              }
            >
              <Sensitivity market={m} metric={metric} variable={variable} />
              <div className="chart-caption">
                <span>
                  <i className="legend-line red" />
                  Call
                </span>
                <span>
                  <i className="legend-line dashed" />
                  Put
                </span>
                <span>{greekInfo[metric].unit}</span>
              </div>
            </Panel>
            <Panel title="The sensitivity landscape" kicker="SPOT × VOLATILITY">
              <Surface market={m} metric={metric} compact />
            </Panel>
          </div>
          <Panel
            title="Theory meets simulation"
            kicker="COMMON RANDOM NUMBER FINITE DIFFERENCES"
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Sensitivity</th>
                    <th>Analytical call</th>
                    <th>Analytical put</th>
                    <th>MC ({m.kind})</th>
                    <th>MC standard error</th>
                    <th>Units</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(greekInfo) as Greek[]).map((name) => (
                    <tr key={name}>
                      <td
                        className="capitalize"
                        title={greekInfo[name].description}
                      >
                        {name}
                      </td>
                      <td>{num(greeks({ ...m, kind: "call" })[name], 6)}</td>
                      <td>{num(greeks({ ...m, kind: "put" })[name], 6)}</td>
                      <td>{estimate ? num(estimate[name].value, 6) : "—"}</td>
                      <td>{estimate ? num(estimate[name].se, 6) : "—"}</td>
                      <td>{greekInfo[name].unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="panel-note">
              {Math.min(c.paths, 100000).toLocaleString()} common-draw paths.
              Central bumps: spot 1%, volatility up to 0.1 pp, rate 0.01 pp,
              time up to one day. Sampling SE excludes bump bias; gamma is
              sensitive to the payoff kink. Undefined boundary estimates are
              shown as dashes.
            </p>
          </Panel>
          <Panel title="What happens if…" kicker="SCENARIO ANALYSIS">
            <div className="scenario-controls">
              <NumberField
                label="Spot change"
                value={spotShift}
                onChange={setSpotShift}
                min={-90}
                max={100}
                suffix="%"
              />
              <NumberField
                label="Volatility change"
                value={volShift}
                onChange={setVolShift}
                min={-100}
                max={100}
                suffix="PP"
              />
              <NumberField
                label="Rate change"
                value={rateShift}
                onChange={setRateShift}
                min={-50}
                max={50}
                suffix="PP"
              />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Spot</th>
                    <th>Volatility</th>
                    <th>Rate</th>
                    <th>Option value</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((x) => (
                    <tr key={x.label}>
                      <td>{x.label}</td>
                      <td>{money(x.spot, 2)}</td>
                      <td>{pct(x.volatility)}</td>
                      <td>{pct(x.rate)}</td>
                      <td>
                        {Number.isFinite(x.value)
                          ? money(x.value)
                          : "Outside model bounds"}
                      </td>
                      <td
                        className={
                          x.value - bs(m) >= 0 ? "positive" : "negative"
                        }
                      >
                        {money(x.value - bs(m))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : (
        <>
          <div className="two-col strategy-layout">
            <Panel
              title="Build your payoff perspective"
              kicker={`LONG EUROPEAN ${m.kind.toUpperCase()}`}
            >
              {Number.isFinite(premium) ? (
                <PayoffChart market={m} premium={premium} financed={financed} />
              ) : (
                <p className="panel-note" role="alert">
                  Enter a valid premium to calculate the profit diagram.
                </p>
              )}
              <div className="chart-caption">
                <span>
                  <i className="legend-line red" />
                  Profit after premium
                </span>
                <span>
                  <i className="legend-line dashed" />
                  Gross payoff
                </span>
              </div>
            </Panel>
            <Panel title="Position assumptions" kicker="PER SHARE">
              <NumberField
                label="Premium paid"
                value={premium}
                onChange={(v) => setPremium(Math.max(0, v))}
                min={0}
                max={1e6}
                step={0.01}
                suffix="USD"
              />
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={financed}
                  onChange={(e) => setFinanced(e.target.checked)}
                />
                Include financing of the premium
              </label>
              <p className="muted small">
                {financed
                  ? "Profit subtracts premium × exp(rT) at expiry."
                  : "Simple profit subtracts the premium paid today; financing and fees are excluded."}
              </p>
              <div className="position-stat">
                <label>BREAK-EVEN AT EXPIRY</label>
                <strong>
                  {breakEven < 0 ? "Not attainable" : money(breakEven, 2)}
                </strong>
              </div>
              <div className="position-stat">
                <label>MAXIMUM LOSS</label>
                <strong>
                  {money(cost, 2)} <small>/ share</small>
                </strong>
              </div>
              <div className="position-stat">
                <label>MAXIMUM GAIN</label>
                <strong>
                  {m.kind === "call" ? "Unbounded" : money(m.strike - cost, 2)}
                </strong>
              </div>
            </Panel>
          </div>
        </>
      )}
      <div className="parity-banner">
        <div className="parity-icon">
          <CheckCheck size={22} />
        </div>
        <div>
          <h3>Put–call parity, verified.</h3>
          <p>
            C − P = S₀e<sup>−qT</sup> − Ke<sup>−rT</sup>{" "}
            <span>Residual: {parity.toExponential(2)}</span>
          </p>
        </div>
        <Chip tone="green">CONSISTENT</Chip>
      </div>
    </>
  );
}

export function VolatilityPage({ market: m }: { market: Market }) {
  const [quote, setQuote] = useState(bs(m)),
    [solved, setSolved] = useState<number | null>(null),
    [problem, setProblem] = useState(""),
    [axes, setAxes] = useState<"spot-vol" | "strike-time">("strike-time");
  const initialRows = () =>
    Array.from({ length: 7 }, (_, i) => ({
      strike: Number((m.strike * (0.7 + i * 0.1)).toFixed(2)),
      iv: Number(
        (
          Math.max(10, m.volatility * 100) +
          4 * ((i - 3) / 2) ** 2 -
          (i - 3) * 0.8
        ).toFixed(2),
      ),
    }));
  const [rows, setRows] = useState(initialRows),
    [illustrative, setIllustrative] = useState(true);
  useEffect(() => {
    setQuote(bs(m));
    setSolved(null);
    setRows(initialRows());
    setIllustrative(true);
    setProblem("");
  }, [m]);
  return (
    <>
      <div className="two-col volatility-layout">
        <Panel
          title="What is the price implying?"
          kicker="IMPLIED VOLATILITY SOLVER"
        >
          <p className="panel-intro">
            Enter an option premium to recover its annualized volatility under
            the current model.
          </p>
          <NumberField
            label="Observed or hypothetical premium"
            value={quote}
            onChange={(v) => {
              setQuote(v);
              setSolved(null);
            }}
            min={0}
            max={1e6}
            step={0.01}
            suffix="USD"
          />
          <div className="solver-assumptions">
            <span>{m.kind.toUpperCase()}</span>
            <span>K {money(m.strike, 2)}</span>
            <span>T {num(m.maturity, 2)}y</span>
          </div>
          <button
            className="primary"
            onClick={() => {
              try {
                setSolved(impliedVol(quote, m));
                setProblem("");
              } catch (e) {
                setProblem((e as Error).message);
                setSolved(null);
              }
            }}
          >
            <Sparkles size={15} />
            Solve implied volatility
            <ArrowRight size={14} />
          </button>
          {problem && (
            <p className="inline-error" role="alert">
              {problem}
            </p>
          )}
          <div className="iv-result">
            <label>IMPLIED VOLATILITY</label>
            <strong>{solved === null ? "—" : pct(solved, 3)}</strong>
            <span>
              {solved === null
                ? "Waiting for your premium"
                : "Bracketed bisection · 0–300% search interval"}
            </span>
            {solved !== null && (
              <small>
                Repriced premium: {money(bs({ ...m, volatility: solved }), 6)}
              </small>
            )}
          </div>
        </Panel>
        <Panel
          title="Volatility changes everything"
          kicker="OPTION VALUE SENSITIVITY"
        >
          <Sensitivity market={m} variable="volatility" />
          <div className="chart-caption">
            <span>
              <i className="legend-line red" />
              Call price
            </span>
            <span>
              <i className="legend-line dashed" />
              Put price
            </span>
            <span>Annualized volatility →</span>
          </div>
          <p className="panel-note">
            The same spot, strike, rate and maturity as your last completed
            simulation.
          </p>
        </Panel>
      </div>
      <Panel
        title="A different dimension of value"
        kicker="ANALYTICAL SURFACE"
        action={
          <select
            className="compact-select"
            aria-label="Surface axes"
            value={axes}
            onChange={(e) => setAxes(e.target.value as typeof axes)}
          >
            <option value="strike-time">Strike × expiry</option>
            <option value="spot-vol">Spot × volatility</option>
          </select>
        }
      >
        <Surface market={m} axes={axes} />
      </Panel>
      <div className="two-col">
        <Panel
          title="The volatility smile"
          kicker="CROSS-STRIKE EXPLORATION"
          action={
            <Chip tone="red">
              {illustrative ? "ILLUSTRATIVE DATA" : "USER-SUPPLIED DATA"}
            </Chip>
          }
        >
          <SmileChart
            data={rows
              .filter(
                (x) =>
                  Number.isFinite(x.strike) &&
                  x.strike > 0 &&
                  Number.isFinite(x.iv) &&
                  x.iv >= 0 &&
                  x.iv <= 300,
              )
              .sort((a, b) => a.strike - b.strike)}
          />
          <p className="panel-note">
            {illustrative
              ? "A synthetic smile for illustration, not observed market quotes."
              : "These are your supplied volatility points, not live market data."}{" "}
            This curve is not calibrated or checked for cross-strike arbitrage.
            Invalid rows outside positive strikes and 0–300% volatility are
            omitted.
          </p>
        </Panel>
        <Panel
          title="Make the curve your own"
          kicker="EDITABLE VOLATILITY POINTS"
        >
          <div className="smile-editor">
            <div>
              <span>Strike ($)</span>
              <span>Implied volatility (%)</span>
            </div>
            {rows.map((row, i) => (
              <div key={i}>
                <input
                  aria-label={`Strike point ${i + 1}`}
                  type="number"
                  min=".01"
                  step="1"
                  value={Number.isFinite(row.strike) ? row.strike : ""}
                  onChange={(e) => {
                    setRows(
                      rows.map((r, j) =>
                        j === i
                          ? {
                              ...r,
                              strike:
                                e.target.value === "" ? NaN : +e.target.value,
                            }
                          : r,
                      ),
                    );
                    setIllustrative(false);
                  }}
                />
                <input
                  aria-label={`Volatility point ${i + 1}`}
                  type="number"
                  min="0"
                  max="300"
                  step=".1"
                  value={Number.isFinite(row.iv) ? row.iv : ""}
                  onChange={(e) => {
                    setRows(
                      rows.map((r, j) =>
                        j === i
                          ? {
                              ...r,
                              iv: e.target.value === "" ? NaN : +e.target.value,
                            }
                          : r,
                      ),
                    );
                    setIllustrative(false);
                  }}
                />
              </div>
            ))}
          </div>
          <button
            className="text-button"
            onClick={() => {
              setRows(initialRows());
              setIllustrative(true);
            }}
          >
            <RotateCcw size={12} />
            Reset illustrative smile
          </button>
        </Panel>
      </div>
    </>
  );
}

export function ResearchPage({
  experiment,
  history,
  notify,
  onRestore,
}: {
  experiment: Experiment;
  history: { time: string; price: number; method: string; seed: number }[];
  notify: (s: string) => void;
  onRestore: (m: Market, c: Config) => void;
}) {
  const file = useRef<HTMLInputElement>(null),
    m = experiment.market,
    r = experiment.results.find((x) => x.method === experiment.config.method)!;
  return (
    <>
      <div className="research-banner">
        <div className="research-icon">
          <FlaskConical size={29} />
        </div>
        <div>
          <span className="eyebrow">EXPERIMENT SNAPSHOT</span>
          <h2>Good research leaves a trail.</h2>
          <p>
            {new Date(experiment.created).toLocaleString()} · Seed{" "}
            {experiment.config.seed} · {r.paths.toLocaleString()} paths
          </p>
        </div>
        <Chip tone="green">
          <Check size={12} />
          COMPLETED
        </Chip>
      </div>
      <div className="export-grid">
        <button
          className="export-card"
          onClick={() => {
            download(
              "quantforge-results.csv",
              resultCSV(experiment),
              "text/csv",
            );
            notify("Comparison CSV downloaded.");
          }}
        >
          <div>
            <ArrowDownToLine size={20} />
            <ArrowUpRight size={16} />
          </div>
          <h3>Results dataset</h3>
          <p>All estimators, errors, intervals and market assumptions.</p>
          <span>
            CSV FILE <ArrowRight size={13} />
          </span>
        </button>
        <button
          className="export-card"
          onClick={() => {
            download(
              "quantforge-research-report.md",
              report(experiment),
              "text/markdown",
            );
            notify("Research report downloaded.");
          }}
        >
          <div>
            <BookOpen size={20} />
            <ArrowUpRight size={16} />
          </div>
          <h3>Research report</h3>
          <p>A portable record of your results, methodology and limitations.</p>
          <span>
            MARKDOWN REPORT <ArrowRight size={13} />
          </span>
        </button>
        <button
          className="export-card"
          onClick={() => {
            download(
              "quantforge-experiment.json",
              JSON.stringify(metadata(experiment), null, 2),
              "application/json",
            );
            notify("Reproducible experiment downloaded.");
          }}
        >
          <div>
            <Save size={20} />
            <ArrowUpRight size={16} />
          </div>
          <h3>Reproduce this run</h3>
          <p>Versioned configuration, random seed and convergence data.</p>
          <span>
            EXPERIMENT JSON <ArrowRight size={13} />
          </span>
        </button>
      </div>
      <Panel
        title="The estimators, side by side"
        kicker="ACCURACY & EFFICIENCY"
      >
        <MethodTable experiment={experiment} />
        <p className="panel-note">
          Variance reduction is 1 − SE² / standard-MC SE². Control pilot cost is
          extra; wall times depend on your device. Methods are compared at the
          same main path budget.
        </p>
      </Panel>
      <div className="two-col">
        <Panel title="Your experiment notebook" kicker="THIS SESSION">
          <div className="history-list">
            {history.map((x, i) => (
              <div key={`${x.time}-${i}`}>
                <span className="history-index">
                  {String(history.length - i).padStart(2, "0")}
                </span>
                <div>
                  <strong>{x.method}</strong>
                  <small>
                    {new Date(x.time).toLocaleTimeString()} · seed {x.seed}
                  </small>
                </div>
                <span className="mono">{money(x.price)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="A transparent set of assumptions"
          kicker="MODEL SPECIFICATION"
        >
          <dl className="assumptions">
            <div>
              <dt>Contract</dt>
              <dd>European {m.kind}</dd>
            </div>
            <div>
              <dt>Dynamics</dt>
              <dd>Risk-neutral GBM</dd>
            </div>
            <div>
              <dt>Spot / strike</dt>
              <dd>
                {money(m.spot, 2)} / {money(m.strike, 2)}
              </dd>
            </div>
            <div>
              <dt>Volatility / maturity</dt>
              <dd>
                {pct(m.volatility)} / {num(m.maturity, 3)} years
              </dd>
            </div>
            <div>
              <dt>Interest / dividend yield</dt>
              <dd>
                {pct(m.rate)} / {pct(m.dividend)}
              </dd>
            </div>
            <div>
              <dt>Price unit</dt>
              <dd>USD per share</dd>
            </div>
            <div>
              <dt>Random generator</dt>
              <dd>sfc32 · Box–Muller v1</dd>
            </div>
          </dl>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Restore experiment JSON"
            onChange={async (e) => {
              const selected = e.target.files?.[0];
              if (!selected) return;
              try {
                if (selected.size > 2e6)
                  throw new Error("Experiment JSON must be smaller than 2 MB.");
                const data = JSON.parse(await selected.text());
                if (
                  data.schema !== "quantforge-experiment-v1" ||
                  data.engine !== "sfc32-boxmuller-v1"
                )
                  throw new Error(
                    "Unsupported experiment format or engine version.",
                  );
                validate(data.market, data.config);
                onRestore(data.market, data.config);
              } catch (err) {
                notify((err as Error).message);
              }
              e.target.value = "";
            }}
          />
          <button
            className="secondary full-width"
            onClick={() => file.current?.click()}
          >
            <Plus size={14} />
            Restore experiment JSON
          </button>
        </Panel>
      </div>
      <div className="note">
        <ShieldCheck size={17} />
        <p>
          Constant-parameter Black–Scholes does not capture jumps, stochastic
          volatility, discrete dividends, transaction costs or early exercise.
          Monte Carlo intervals measure numerical sampling error. They do not
          measure model risk or predict realized prices. No market connection is
          configured.
        </p>
      </div>
    </>
  );
}
