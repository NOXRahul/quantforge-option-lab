"""Memory-bounded terminal simulation with correct independent sampling units."""
from dataclasses import dataclass, field
from math import exp, sqrt, log2
from time import perf_counter
import numpy as np
from .models import Market, Simulation

try:
    from scipy.stats import qmc, norm, t as student_t
    HAS_QMC = True
except ImportError:
    HAS_QMC = False


@dataclass
class Moments:
    n: int = 0
    mean: float = 0.0
    m2: float = 0.0

    def update(self, x):
        size = len(x)
        if not size:
            return
        mean = float(np.mean(x))
        delta = mean - self.mean
        combined = self.n + size
        self.m2 += float(np.sum((x-mean)**2)) + delta**2*self.n*size/combined
        self.mean += delta*size/combined
        self.n = combined

    @property
    def se(self):
        return sqrt(max(0.0, self.m2/(self.n-1))/self.n) if self.n > 1 else float("nan")


@dataclass
class Result:
    method: str
    price: float
    se: float
    ci_low: float
    ci_high: float
    paths: int
    independent_units: int
    runtime: float
    pilot_paths: int = 0
    beta: float = 0.0
    convergence: list = field(default_factory=list)
    terminal: np.ndarray = field(default_factory=lambda: np.array([]))
    payoff: np.ndarray = field(default_factory=lambda: np.array([]))
    notes: str = ""


def terminal_prices(m: Market, z):
    return m.spot*np.exp((m.rate-m.dividend-0.5*m.volatility**2)*m.maturity + m.volatility*sqrt(m.maturity)*z)


def payoffs(m: Market, terminal):
    return np.maximum(terminal-m.strike, 0) if m.kind == "call" else np.maximum(m.strike-terminal, 0)


def run(m: Market, config: Simulation) -> Result:
    start = perf_counter()
    if config.method == "Sobol QMC":
        return _sobol(m, config, start)
    main_seed, pilot_seed = np.random.SeedSequence(config.seed).spawn(2)
    rng = np.random.default_rng(main_seed)
    discount = exp(-m.rate*m.maturity)
    beta, pilot_count = 0.0, 0
    if config.method == "Control variate" and m.volatility > 0 and m.maturity > 0:
        pilot_count = 4096
        pilot = terminal_prices(m, np.random.default_rng(pilot_seed).standard_normal(pilot_count))
        x, y = discount*pilot, discount*payoffs(m, pilot)
        centered = x-x.mean()
        denominator = float(centered @ centered)
        beta = float(centered @ (y-y.mean()) / denominator) if denominator > 0 else 0.0
    factor = 2 if config.method == "Antithetic" else 1
    total_units = config.paths//factor
    checkpoints = np.unique(np.geomspace(min(64, total_units), total_units, 30).astype(int))
    moments, history, samples, raw_payoff = Moments(), [], [], []
    retained = 0
    for target in checkpoints:
        while moments.n < target:
            size = min(config.batch_size//factor, int(target)-moments.n)
            z = rng.standard_normal(size)
            if factor == 2:
                terminal = terminal_prices(m, np.column_stack((z, -z)))
                payoff = payoffs(m, terminal)
                values = discount*payoff.mean(axis=1)
            else:
                terminal = terminal_prices(m, z)
                payoff = payoffs(m, terminal)
                values = discount*payoff
                if config.method == "Control variate":
                    values = values-beta*(discount*terminal-m.spot*exp(-m.dividend*m.maturity))
            moments.update(values)
            keep = min(20_000-retained, terminal.size)
            if keep > 0:
                samples.append(terminal.reshape(-1)[:keep].copy())
                raw_payoff.append(payoff.reshape(-1)[:keep].copy())
                retained += keep
        history.append({"paths": moments.n*factor, "price": moments.mean, "se": moments.se,
                        "low": moments.mean-1.96*moments.se, "high": moments.mean+1.96*moments.se})
    notes = "Approximate pointwise 95% normal interval; uncertainty is sampling error under the model, not market-price uncertainty."
    if factor == 2:
        notes += " Each antithetic pair is one independent observation."
    if config.method == "Control variate":
        notes += " Discounted stock is the control; beta comes from a separate 4,096-path pilot (when stochastic)."
    if moments.se == 0 and m.volatility > 0 and m.maturity > 0:
        notes += " No sampled variation: a zero interval width is not evidence that rare payoffs cannot occur. Increase paths or use the analytical benchmark."
    return Result(config.method, moments.mean, moments.se, moments.mean-1.96*moments.se,
                  moments.mean+1.96*moments.se, config.paths, moments.n, perf_counter()-start,
                  pilot_count, beta, history, np.concatenate(samples), np.concatenate(raw_payoff), notes)


def _sobol(m, config, start):
    if not HAS_QMC:
        raise ValueError("Sobol QMC needs the optional SciPy package. Select another method or install scipy.")
    replicates = 16
    power = int(log2(config.paths//replicates))
    per_rep = 2**power
    seeds = np.random.SeedSequence(config.seed).generate_state(replicates)
    moments, history, samples, payouts = Moments(), [], [], []
    discount = exp(-m.rate*m.maturity)
    for i, seed in enumerate(seeds):
        # One complete power-of-two net per independent scramble (<= 65,536 points).
        u = qmc.Sobol(d=1, scramble=True, seed=int(seed)).random_base2(power).ravel()
        z = norm.ppf(np.clip(u, np.finfo(float).eps, 1-np.finfo(float).eps))
        terminal = terminal_prices(m, z)
        payoff = payoffs(m, terminal)
        moments.update(np.array([float(np.mean(discount*payoff))]))
        if i >= 1:
            critical = float(student_t.ppf(0.975, i))
            history.append({"paths": (i+1)*per_rep, "price": moments.mean, "se": moments.se,
                            "low": moments.mean-critical*moments.se, "high": moments.mean+critical*moments.se})
        # Equal samples from every replicate for descriptive histograms.
        samples.append(terminal[:1250])
        payouts.append(payoff[:1250])
    critical = float(student_t.ppf(0.975, replicates-1))
    notes = (f"16 independent scrambled Sobol nets × {per_rep:,} points. Requested {config.paths:,}; actual {per_rep*replicates:,}. "
             "Approximate 95% Student-t interval from replicate means, not individual Sobol points. "
             "Convergence adds scrambles at fixed net size. QMC uses bounded full-net buffers instead of the MC batch setting.")
    return Result(config.method, moments.mean, moments.se, moments.mean-critical*moments.se,
                  moments.mean+critical*moments.se, per_rep*replicates, replicates,
                  perf_counter()-start, convergence=history, terminal=np.concatenate(samples),
                  payoff=np.concatenate(payouts), notes=notes)
