import { Panel, Chip, NumberField, money, num, pct, greekInfo } from "./ui";
import {
  SimulationPage,
  RiskPage,
  VolatilityPage,
  ResearchPage,
} from "./Pages";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  FlaskConical,
  Gauge,
  Hexagon,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Maximize2,
  Play,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Waves,
  X,
} from "lucide-react";
import Surface from "./Surface";
import { Convergence, Distribution } from "./Charts";
import {
  bs,
  defaults,
  defaultConfig,
  greeks,
  validate,
  methodNames,
  type Market,
  type Config,
  type Result,
  type Greek,
} from "./engine";
import { download, resultCSV, type Experiment } from "./exports";

type Page = "overview" | "simulation" | "risk" | "volatility" | "research";
const pages: { id: Page; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "simulation", label: "Simulation", icon: Waves },
  { id: "risk", label: "Greeks & risk", icon: Gauge },
  { id: "volatility", label: "Volatility", icon: Layers3 },
  { id: "research", label: "Research", icon: BookOpen },
];
function Workbench({
  draft,
  setDraft,
  config,
  setConfig,
  onRun,
  busy,
  onAdvanced,
  dirty,
}: {
  draft: Market;
  setDraft: (m: Market) => void;
  config: Config;
  setConfig: (c: Config) => void;
  onRun: () => void;
  busy: boolean;
  onAdvanced: () => void;
  dirty: boolean;
}) {
  const set = (key: keyof Market, v: number) =>
    setDraft({ ...draft, [key]: v });
  return (
    <section className="panel workbench">
      <div className="panel-heading">
        <div className="heading-inline">
          <SlidersHorizontal size={16} />
          <h2>Workbench</h2>
        </div>
        <span className="subtle-label">PARAMETERS</span>
      </div>
      <div className="segmented" aria-label="Option type">
        {(["call", "put"] as const).map((kind) => (
          <button
            key={kind}
            className={draft.kind === kind ? "active" : ""}
            onClick={() => setDraft({ ...draft, kind })}
          >
            {kind === "call" ? "Call option" : "Put option"}
          </button>
        ))}
      </div>
      <div className="preset-row">
        <span>PRESETS</span>
        {["ATM", "ITM", "OTM"].map((preset, i) => (
          <button
            key={preset}
            onClick={() =>
              setDraft({
                ...draft,
                strike: Math.max(
                  0.01,
                  Math.min(
                    1e6,
                    draft.spot *
                      (i === 0
                        ? 1
                        : (i === 1) === (draft.kind === "call")
                          ? 0.9
                          : 1.1),
                  ),
                ),
              })
            }
          >
            {preset}
          </button>
        ))}
      </div>
      <div className="field-grid">
        <NumberField
          label="Spot price"
          value={draft.spot}
          onChange={(v) => set("spot", v)}
          min={0.01}
          max={1e6}
          step={1}
          suffix="USD"
        />
        <NumberField
          label="Strike price"
          value={draft.strike}
          onChange={(v) => set("strike", v)}
          min={0.01}
          max={1e6}
          step={1}
          suffix="USD"
        />
      </div>
      <div className="slider-field">
        <div>
          <label htmlFor="volatility">
            Volatility <span>σ</span>
          </label>
          <strong>
            {Number.isFinite(draft.volatility) ? pct(draft.volatility) : "—"}
          </strong>
        </div>
        <input
          id="volatility"
          type="range"
          min="0"
          max="1.5"
          step=".005"
          value={Math.min(1.5, draft.volatility || 0)}
          onChange={(e) => set("volatility", +e.target.value)}
          style={
            {
              "--fill": `${Math.min(100, (draft.volatility / 1.5) * 100)}%`,
            } as React.CSSProperties
          }
        />
        <div className="range-labels">
          <span>0%</span>
          <span>150%</span>
        </div>
      </div>
      <div className="field-grid">
        <NumberField
          label="Time to expiry"
          value={draft.maturity * 365}
          onChange={(v) => set("maturity", v / 365)}
          min={0}
          max={10950}
          step={1}
          suffix="DAYS"
        />
        <NumberField
          label="Risk-free rate"
          value={draft.rate * 100}
          onChange={(v) => set("rate", v / 100)}
          min={-50}
          max={50}
          step={0.1}
          suffix="%"
        />
      </div>
      <label className="field method-field">
        <span>Simulation method</span>
        <div className="select-shell">
          <select
            value={config.method}
            onChange={(e) =>
              setConfig({
                ...config,
                method: e.target.value as Config["method"],
              })
            }
          >
            {Object.entries(methodNames).map(([v, name]) => (
              <option key={v} value={v}>
                {name}
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
      </label>
      <div className="simulation-inline">
        <span>
          <span className="mini-dots">⠿</span> {config.paths.toLocaleString()}{" "}
          paths
        </span>
        <button className="text-button" onClick={onAdvanced}>
          Configure <Settings2 size={12} />
        </button>
      </div>
      <button className="primary run-button" disabled={busy} onClick={onRun}>
        {busy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Play size={13} fill="currentColor" />
        )}
        {busy
          ? "Simulating…"
          : dirty
            ? "Run updated simulation"
            : "Run simulation"}
        <span className="button-shortcut">↵</span>
      </button>
      <div className="workbench-foot">
        <ShieldCheck size={11} />
        {dirty
          ? "Unapplied changes · results use last run"
          : "Risk-neutral model · reproducible seed"}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
  accent,
  children,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  accent?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`metric-card ${accent ? "accent" : ""}`}>
      <div className="metric-label">
        {label}
        {children}
      </div>
      <div className="metric-value" key={value}>
        {value}
      </div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>("overview"),
    [draft, setDraft] = useState<Market>({ ...defaults }),
    [config, setConfig] = useState<Config>({ ...defaultConfig });
  const [experiment, setExperiment] = useState<Experiment | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [advanced, setAdvanced] = useState(false),
    [help, setHelp] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [riskEst, setRiskEst] = useState<Record<
      Greek,
      { value: number; se: number }
    > | null>(null),
    [history, setHistory] = useState<
      { time: string; price: number; method: string; seed: number }[]
    >([]);
  const [saved, setSaved] = useState<
    { name: string; market: Market; config: Config }[]
  >(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem("qf-presets") || "[]");
      if (!Array.isArray(stored)) return [];
      return stored
        .filter((preset) => {
          try {
            validate(preset.market, preset.config);
            return typeof preset.name === "string" && preset.name.length <= 40;
          } catch {
            return false;
          }
        })
        .slice(0, 10);
    } catch {
      return [];
    }
  });
  const [presetName, setPresetName] = useState("My experiment");
  const worker = useRef<Worker | null>(null),
    initialRun = useRef(false),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  };
  const run = useCallback((m: Market, c: Config) => {
    try {
      validate(m, c);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setError("");
    setBusy(true);
    worker.current?.terminate();
    try {
      const w = new Worker(new URL("./simulation.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = (e) => {
        setBusy(false);
        if (!e.data.ok) {
          setError(e.data.error);
          w.terminate();
          return;
        }
        const result = e.data.results as Result[],
          created = new Date().toISOString();
        setExperiment({
          market: { ...m },
          config: { ...c },
          results: result,
          created,
        });
        setRiskEst(e.data.risk);
        setHistory((h) =>
          [
            {
              time: created,
              price: result.find((r) => r.method === c.method)!.price,
              method: methodNames[c.method],
              seed: c.seed,
            },
            ...h,
          ].slice(0, 8),
        );
        w.terminate();
      };
      w.onerror = () => {
        setBusy(false);
        setError(
          "The simulation worker could not finish. Reduce the path count and try again.",
        );
        w.terminate();
      };
      w.postMessage({ m, c });
    } catch {
      setBusy(false);
      setError(
        "Your browser could not start a background worker. Use a current browser and allow scripts for this site.",
      );
    }
  }, []);
  useEffect(() => {
    if (!initialRun.current) {
      initialRun.current = true;
      run(defaults, defaultConfig);
    }
    return () => {
      worker.current?.terminate();
      initialRun.current = false;
    };
  }, [run]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!busy) run(draft, config);
      }
      if (e.key === "Escape") {
        setAdvanced(false);
        setHelp(false);
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [draft, config, busy, run]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const m = experiment?.market ?? defaults,
    c = experiment?.config ?? defaultConfig,
    r = experiment?.results.find((x) => x.method === c.method),
    benchmark = bs(m),
    g = greeks(m);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(m) ||
    JSON.stringify(config) !== JSON.stringify(c);
  const headers: Record<
    Page,
    { eyebrow: string; title: string; description: string }
  > = {
    overview: {
      eyebrow: "THE QUANTITATIVE PLAYGROUND",
      title: "Price the possibilities.",
      description: "Explore uncertainty. Understand risk. Find your edge.",
    },
    simulation: {
      eyebrow: "SIMULATION STUDIO",
      title: "A thousand futures. One price.",
      description:
        "Follow the paths, inspect the distribution, and watch estimates converge.",
    },
    risk: {
      eyebrow: "SENSITIVITY & STRATEGY",
      title: "Know what moves your position.",
      description: "From local sensitivities to the shape of your payoff.",
    },
    volatility: {
      eyebrow: "VOLATILITY LAB",
      title: "Read between the prices.",
      description:
        "Solve for implied volatility and explore the assumptions beneath it.",
    },
    research: {
      eyebrow: "REPRODUCIBLE RESEARCH",
      title: "From experiment to evidence.",
      description:
        "Compare estimators. Save assumptions. Take your findings with you.",
    },
  };
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);
  const h = headers[page];
  const exportCSV = () => {
    if (experiment) {
      download("quantforge-results.csv", resultCSV(experiment), "text/csv");
      notify("Results exported with configuration metadata.");
    }
  };
  return (
    <div className="app-shell">
      <aside className="rail">
        <button
          className="brand-mark"
          aria-label="QUANTFORGE home"
          onClick={() => setPage("overview")}
        >
          <img src="/favicon.svg" alt="" />
        </button>
        <div className="rail-separator" />
        <nav aria-label="Workspace">
          {pages.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`rail-button ${page === id ? "active" : ""}`}
              onClick={() => setPage(id)}
              title={label}
              aria-label={label}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-bottom">
          <button
            className="rail-button"
            title="Methodology & help"
            aria-label="Methodology & help"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={20} />
          </button>
          <div className="avatar" title="Local research workspace">
            QF
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="wordmark">
            QUANT<span>FORGE</span>
            <i /> <span className="product-label">OPTION LAB</span>
            <span className="version">V1.0</span>
          </div>
          <div className="topbar-right">
            <span className="environment">
              <span className="status-dot" />
              THEORETICAL ENVIRONMENT
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              title="Methodology"
              aria-label="Open methodology"
              onClick={() => setHelp(true)}
            >
              <BookOpen size={16} />
            </button>
            <button
              className="icon-button"
              title="Configure experiment"
              aria-label="Configure experiment"
              onClick={() => setAdvanced(true)}
            >
              <Settings2 size={16} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow headline-eyebrow">
                <span className="red-line" />
                {h.eyebrow}
              </div>
              <h1>{h.title}</h1>
              <p>{h.description}</p>
            </div>
            <button
              className="secondary export-button"
              onClick={exportCSV}
              disabled={!experiment}
            >
              <ArrowDownToLine size={14} />
              Export results
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="page-nav">
            <nav aria-label="Analytics pages">
              {pages.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={page === id ? "active" : ""}
                  onClick={() => setPage(id)}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </nav>
            <span className="run-status" role="status">
              {busy ? (
                <>
                  <LoaderCircle size={11} className="spin" />
                  Computing
                </>
              ) : experiment ? (
                <>
                  <span className="status-dot" />
                  Simulation complete
                </>
              ) : (
                <>Awaiting simulation</>
              )}
            </span>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {dirty && page !== "overview" && (
            <div className="change-banner">
              <span>
                Workbench changes are waiting to be applied. These results use
                the last completed run.
              </span>
              <button
                className="text-button"
                onClick={() => run(draft, config)}
                disabled={busy}
              >
                Apply & run <ArrowRight size={13} />
              </button>
            </div>
          )}
          {page === "overview" && (
            <>
              <div className="metric-grid">
                <Metric
                  label="MONTE CARLO PRICE"
                  value={r ? money(r.price) : "Calculating…"}
                  accent
                  detail={
                    <>
                      <span className="method-dot antithetic" />
                      {methodNames[c.method]}
                    </>
                  }
                >
                  <span className="metric-icon">
                    <Activity size={15} />
                  </span>
                </Metric>
                <Metric
                  label="BLACK–SCHOLES"
                  value={money(benchmark)}
                  detail="Analytical benchmark"
                >
                  <span className="metric-icon">
                    <FlaskConical size={15} />
                  </span>
                </Metric>
                <Metric
                  label="ESTIMATION ERROR"
                  value={r ? money(Math.abs(r.price - benchmark)) : "—"}
                  detail={
                    <>
                      <span className="positive">
                        {r && benchmark > 1e-10
                          ? pct(Math.abs(r.price - benchmark) / benchmark, 3)
                          : "—"}{" "}
                        relative
                      </span>
                      <span className="detail-divider" />
                      vs. analytical
                    </>
                  }
                >
                  <TrendingUp size={15} />
                </Metric>
                <Metric
                  label="95% CONFIDENCE INTERVAL"
                  value={r ? `${num(r.low, 3)} – ${num(r.high, 3)}` : "—"}
                  detail={
                    <>
                      USD per share
                      <span className="detail-divider" />
                      SE {r ? money(r.se) : "—"}
                    </>
                  }
                >
                  <ShieldCheck size={15} />
                </Metric>
              </div>
              <div className="overview-grid">
                <Panel
                  title="The shape of opportunity"
                  kicker="OPTION VALUE SURFACE"
                  className="surface-panel"
                  action={
                    <div className="heading-actions">
                      <Chip>{m.kind.toUpperCase()} · EUROPEAN</Chip>
                      <button
                        className="icon-button"
                        title="Expand surface"
                        aria-label="Expand surface"
                        onClick={() => setExpanded(true)}
                      >
                        <Maximize2 size={14} />
                      </button>
                    </div>
                  }
                >
                  <div className="surface-subtitle">
                    Spot price × volatility <span>Black–Scholes–Merton</span>
                  </div>
                  <Surface market={m} />
                  <div className="surface-stats">
                    <div>
                      <span>SPOT</span>
                      <strong>{money(m.spot, 2)}</strong>
                    </div>
                    <div>
                      <span>STRIKE</span>
                      <strong>{money(m.strike, 2)}</strong>
                    </div>
                    <div>
                      <span>VOLATILITY</span>
                      <strong>{pct(m.volatility)}</strong>
                    </div>
                    <div>
                      <span>MATURITY</span>
                      <strong>
                        {num(m.maturity * 365, 0)} <small>days</small>
                      </strong>
                    </div>
                  </div>
                </Panel>
                <Workbench
                  draft={draft}
                  setDraft={setDraft}
                  config={config}
                  setConfig={setConfig}
                  busy={busy}
                  onRun={() => run(draft, config)}
                  onAdvanced={() => setAdvanced(true)}
                  dirty={dirty}
                />
              </div>
              <div className="lower-grid">
                <Panel
                  title="Converging on the answer"
                  kicker="MONTE CARLO CONVERGENCE"
                  action={
                    <Chip>{r ? r.paths.toLocaleString() : "—"} PATHS</Chip>
                  }
                >
                  {r ? (
                    <Convergence result={r} benchmark={benchmark} small />
                  ) : (
                    <div className="loading-chart">
                      <LoaderCircle className="spin" />
                      Running your first experiment…
                    </div>
                  )}
                  <div className="chart-caption">
                    <span>
                      <i className="legend-line red" />
                      MC estimate
                    </span>
                    <span>
                      <i className="legend-line dashed" />
                      Black–Scholes
                    </span>
                    <span>
                      <i className="legend-box" />
                      95% pointwise CI
                    </span>
                  </div>
                </Panel>
                <Panel
                  title="Where the paths land"
                  kicker="TERMINAL PRICE DISTRIBUTION"
                  action={
                    <button
                      className="icon-button"
                      title="Explore distributions"
                      aria-label="Explore distributions"
                      onClick={() => setPage("simulation")}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  }
                >
                  {r && (
                    <Distribution
                      samples={r.terminal}
                      strike={m.strike}
                      small
                    />
                  )}
                  <div className="chart-caption">
                    <span>Risk-neutral distribution</span>
                    <span className="caption-right">
                      {r ? Math.min(20_000, r.paths).toLocaleString() : "—"}{" "}
                      sampled terminals
                    </span>
                  </div>
                </Panel>
              </div>
              <Panel
                title="A clearer view of risk"
                kicker="ANALYTICAL GREEKS"
                action={
                  <button
                    className="text-button"
                    onClick={() => setPage("risk")}
                  >
                    Explore risk <ArrowRight size={13} />
                  </button>
                }
              >
                <div className="greek-strip">
                  {(Object.keys(greekInfo) as Greek[]).map((name, i) => (
                    <div key={name} title={greekInfo[name].description}>
                      <span className="greek-symbol">
                        {["Δ", "Γ", "ν", "Θ", "ρ"][i]}
                      </span>
                      <div>
                        <label>{name}</label>
                        <strong>{num(g[name])}</strong>
                        <small>{greekInfo[name].unit}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}
          {page === "simulation" && r && experiment && (
            <SimulationPage experiment={experiment} result={r} />
          )}
          {page === "risk" && (
            <RiskPage market={m} config={c} estimate={riskEst} />
          )}
          {page === "volatility" && <VolatilityPage market={m} />}
          {page === "research" && experiment && (
            <ResearchPage
              experiment={experiment}
              history={history}
              notify={notify}
              onRestore={(market, settings) => {
                setDraft(market);
                setConfig(settings);
                notify(
                  "Configuration restored. Run the simulation to reproduce it.",
                );
                setPage("overview");
              }}
            />
          )}
          {(page === "simulation" || page === "research") && !experiment && (
            <div className="empty">
              <LoaderCircle className="spin" />
              <h2>Your experiment is being prepared.</h2>
              <p>
                The results will appear here after the simulation completes.
              </p>
            </div>
          )}
          <footer>
            <span>
              <Hexagon size={12} /> QUANTFORGE <i /> Engineered for curiosity.
            </span>
            <span>
              Theoretical pricing · No live market data · Research & education{" "}
              <span className="footer-version">v1.0</span>
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
      {advanced && (
        <Modal title="Experiment settings" onClose={() => setAdvanced(false)}>
          <p className="modal-intro">
            Tune your model. All changes take effect on the next simulation.
          </p>
          <div className="field-grid">
            <NumberField
              label="Simulation paths"
              value={config.paths}
              onChange={(v) => setConfig({ ...config, paths: v })}
              min={128}
              max={2e6}
              step={1000}
            />
            <NumberField
              label="Random seed"
              value={config.seed}
              onChange={(v) => setConfig({ ...config, seed: v })}
              min={0}
              max={4294967295}
            />
            <NumberField
              label="Trajectory steps"
              value={config.steps}
              onChange={(v) => setConfig({ ...config, steps: v })}
              min={1}
              max={1000}
              help="Affects displayed paths only. European terminal pricing uses exact GBM sampling."
            />
            <NumberField
              label="Simulation batch"
              value={config.batch}
              onChange={(v) => setConfig({ ...config, batch: v })}
              min={128}
              max={100000}
              step={128}
            />
            <NumberField
              label="Dividend yield"
              value={draft.dividend * 100}
              onChange={(v) => setDraft({ ...draft, dividend: v / 100 })}
              min={-50}
              max={50}
              step={0.1}
              suffix="%"
            />
            <NumberField
              label="Annual volatility"
              value={draft.volatility * 100}
              onChange={(v) => setDraft({ ...draft, volatility: v / 100 })}
              min={0}
              max={300}
              step={0.1}
              suffix="%"
            />
          </div>
          <div className="note">
            <CircleHelp size={14} />
            <p>
              Every run compares all three estimators. Control variates use an
              additional independent 4,096-path pilot. Histograms retain up to
              20,000 observations; the estimator uses every requested path.
            </p>
          </div>
          <div className="modal-section">
            <h3>Session presets</h3>
            <div className="save-preset">
              <input
                aria-label="Preset name"
                value={presetName}
                maxLength={40}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <button
                className="secondary"
                onClick={() => {
                  try {
                    validate(draft, config);
                    if (!presetName.trim())
                      throw new Error("Give your preset a name.");
                    const next = [
                      {
                        name: presetName.trim(),
                        market: { ...draft },
                        config: { ...config },
                      },
                      ...saved.filter((x) => x.name !== presetName.trim()),
                    ].slice(0, 10);
                    sessionStorage.setItem("qf-presets", JSON.stringify(next));
                    setSaved(next);
                    notify("Preset saved for this browser session.");
                  } catch (e) {
                    setError((e as Error).message);
                    setAdvanced(false);
                  }
                }}
              >
                <Save size={14} />
                Save
              </button>
            </div>
            {saved.length > 0 ? (
              <div className="preset-list">
                {saved.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      try {
                        validate(s.market, s.config);
                        setDraft(s.market);
                        setConfig(s.config);
                        notify(`Restored ${s.name}.`);
                      } catch {
                        notify("This preset is invalid.");
                      }
                    }}
                  >
                    {s.name}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted small">
                Save a configuration to revisit it during this session.
              </p>
            )}
          </div>
          <div className="modal-buttons">
            <button
              className="secondary"
              onClick={() => {
                setDraft({ ...defaults });
                setConfig({ ...defaultConfig });
                notify("Defaults restored. Re-run to apply.");
              }}
            >
              <RotateCcw size={14} />
              Reset defaults
            </button>
            <button
              className="primary"
              onClick={() => {
                setAdvanced(false);
                run(draft, config);
              }}
              disabled={busy}
            >
              <Play size={13} />
              Apply & run
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="A model, made transparent."
          onClose={() => setHelp(false)}
          wide
        >
          <div className="methodology">
            <span className="eyebrow">THE MATH BEHIND THE INTERFACE</span>
            <div className="formula">
              S<sub>T</sub> = S₀ exp[(r − q − ½σ²)T + σ√T · Z]
            </div>
            <p>
              Terminal stock prices follow risk-neutral geometric Brownian
              motion. The option price is the mean payoff discounted by
              exp(−rT). All contracts are European, with continuous dividend
              yield, constant volatility and interest rates.
            </p>
            <div className="methodology-grid">
              <div>
                <h3>Uncertainty, correctly measured</h3>
                <p>
                  Standard error comes from independent observations: individual
                  paths for standard MC, pairs for antithetic MC, and adjusted
                  payoffs for control variates. The 95% interval is an
                  approximate sampling interval under the model.
                </p>
              </div>
              <div>
                <h3>Every surface is analytical</h3>
                <p>
                  3D surfaces evaluate Black–Scholes–Merton on a grid. They do
                  not interpolate simulated estimates. Use the 2D toggle if your
                  browser does not support WebGL.
                </p>
              </div>
              <div>
                <h3>No hidden market feed</h3>
                <p>
                  All inputs are yours. The volatility smile starts with clearly
                  labeled illustrative data. This application neither retrieves
                  live prices nor offers trading recommendations.
                </p>
              </div>
              <div>
                <h3>Boundary conditions matter</h3>
                <p>
                  Zero maturity uses intrinsic payoff. Zero volatility uses a
                  deterministic forward. Undefined Greeks at payoff kinks are
                  shown as dashes. Rare events can make a sampled confidence
                  interval unreliable.
                </p>
              </div>
            </div>
            <a
              href="https://www.columbia.edu/~mh2078/FoundationsFE/BlackScholes.pdf"
              target="_blank"
              rel="noreferrer"
              className="text-link"
            >
              Read the mathematical foundation · Columbia University{" "}
              <ArrowUpRight size={13} />
            </a>
            <div className="note">
              <Command size={15} />
              <p>
                Press Ctrl / ⌘ + Enter to run a simulation. Esc closes dialogs.
                All processing happens on your device.
              </p>
            </div>
          </div>
        </Modal>
      )}
      {expanded && (
        <Modal
          title="Option value · expanded view"
          onClose={() => setExpanded(false)}
          wide
        >
          <Surface market={m} />
          <p className="muted small">
            Analytical Black–Scholes–Merton prices. Last simulated contract:{" "}
            {m.kind}, strike {money(m.strike, 2)}, expiry {num(m.maturity, 3)}{" "}
            years.
          </p>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) {
          const r = dialog.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default App;
