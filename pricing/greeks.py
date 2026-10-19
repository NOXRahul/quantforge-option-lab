"""Greeks in dollars per share; vega/rho per percentage point, theta per day."""
from dataclasses import replace
from math import exp, sqrt, isclose
import numpy as np
from .black_scholes import cdf, pdf, d_values
from .models import Market

UNITS = {"Delta": "$ / $ spot", "Gamma": "delta / $ spot", "Vega": "$ / 1 pp volatility",
         "Theta": "$ / calendar day", "Rho": "$ / 1 pp rate"}
EXPLANATIONS = {
    "Delta": "Approximate premium change for a $1 increase in the underlying.",
    "Gamma": "Approximate change in delta for a $1 increase in the underlying.",
    "Vega": "Approximate premium change when volatility rises by one percentage point (20% to 21%).",
    "Theta": "Approximate premium change as one calendar day passes, holding other inputs fixed.",
    "Rho": "Approximate premium change when the annual interest rate rises by one percentage point.",
}


def analytical(m: Market) -> dict:
    s, k, t, r, q, v = m.spot, m.strike, m.maturity, m.rate, m.dividend, m.volatility
    a, b = s * exp(-q*t), k * exp(-r*t)
    if t == 0 or v == 0:
        if isclose(a, b, rel_tol=1e-12, abs_tol=1e-12):
            return {name: float("nan") for name in UNITS}
        active = a > b if m.kind == "call" else b > a
        sign = 1 if m.kind == "call" else -1
        return {"Delta": sign * exp(-q*t) if active else 0.0, "Gamma": 0.0, "Vega": 0.0,
                "Theta": float("nan") if t == 0 else (sign*(q*a-r*b)/365 if active else 0.0),
                "Rho": sign * t*b/100 if active else 0.0}
    d1, d2 = d_values(m)
    common = -a * pdf(d1) * v / (2 * sqrt(t))
    if m.kind == "call":
        delta = exp(-q*t) * cdf(d1)
        theta = common - r*b*cdf(d2) + q*a*cdf(d1)
        rho = t*b*cdf(d2)
    else:
        delta = exp(-q*t) * (cdf(d1)-1)
        theta = common + r*b*cdf(-d2) - q*a*cdf(-d1)
        rho = -t*b*cdf(-d2)
    return {"Delta": delta, "Gamma": exp(-q*t)*pdf(d1)/(s*v*sqrt(t)),
            "Vega": a*pdf(d1)*sqrt(t)/100, "Theta": theta/365, "Rho": rho/100}


def simulated(m: Market, paths=50_000, seed=42):
    """Central finite differences with common random numbers and sampling SEs.

    Bump bias (especially gamma near payoff kinks) is not included in the SE.
    Boundary parameters are deliberately not assigned misleading derivatives.
    """
    if m.maturity <= 1e-4 or m.volatility <= 1e-4 or abs(m.rate) >= 0.4999 or m.volatility >= 2.9999 or m.maturity >= 29.9999 or m.spot >= 9.99e8:
        raise ValueError("Simulation Greeks require interior parameters: T and volatility > 0.0001, away from engine limits.")
    if not isinstance(paths, int) or not 128 <= paths <= 100_000:
        raise ValueError("Greek estimation uses 128–100,000 paths.")
    z = np.random.default_rng(seed).standard_normal(paths)

    def values(p):
        st = p.spot*np.exp((p.rate-p.dividend-0.5*p.volatility**2)*p.maturity + p.volatility*np.sqrt(p.maturity)*z)
        payoff = np.maximum(st-p.strike, 0) if p.kind == "call" else np.maximum(p.strike-st, 0)
        return np.exp(-p.rate*p.maturity)*payoff

    hs, hv, ht, hr = m.spot*0.01, min(0.001, m.volatility/2, (3-m.volatility)/2), min(1/365, m.maturity/2, (30-m.maturity)/2), 0.0001
    up, down, base = values(replace(m, spot=m.spot+hs)), values(replace(m, spot=m.spot-hs)), values(m)
    samples = {"Delta": (up-down)/(2*hs), "Gamma": (up-2*base+down)/hs**2,
               "Vega": (values(replace(m, volatility=m.volatility+hv))-values(replace(m, volatility=m.volatility-hv)))/(2*hv*100),
               "Theta": -(values(replace(m, maturity=m.maturity+ht))-values(replace(m, maturity=m.maturity-ht)))/(2*ht*365),
               "Rho": (values(replace(m, rate=m.rate+hr))-values(replace(m, rate=m.rate-hr)))/(2*hr*100)}
    return {name: {"estimate": float(x.mean()), "se": float(x.std(ddof=1)/sqrt(paths))} for name, x in samples.items()}
