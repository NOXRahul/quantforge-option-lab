"""Black–Scholes–Merton with continuous dividend yield; no SciPy required."""
from dataclasses import replace
from math import erfc, exp, log, pi, sqrt, isfinite
from .models import Market


def cdf(x):
    return 0.5 * erfc(-x / sqrt(2))


def pdf(x):
    return exp(-0.5 * x * x) / sqrt(2 * pi)


def d_values(m: Market):
    denominator = m.volatility * sqrt(m.maturity)
    d1 = (log(m.spot / m.strike) + (m.rate - m.dividend + 0.5 * m.volatility**2) * m.maturity) / denominator
    return d1, d1 - denominator


def price(m: Market) -> float:
    a = m.spot * exp(-m.dividend * m.maturity)
    b = m.strike * exp(-m.rate * m.maturity)
    if m.maturity == 0 or m.volatility == 0:
        return max(a - b, 0.0) if m.kind == "call" else max(b - a, 0.0)
    d1, d2 = d_values(m)
    # Compute the out-of-the-money side directly, use parity on the other side.
    # This avoids subtracting two nearly identical large terms in deep ITM cases.
    if a <= b:
        call = max(0.0, a * cdf(d1) - b * cdf(d2))
        return call if m.kind == "call" else call + b - a
    put = max(0.0, b * cdf(-d2) - a * cdf(-d1))
    return put if m.kind == "put" else put + a - b


def arbitrage_bounds(m: Market):
    a, b = m.spot * exp(-m.dividend * m.maturity), m.strike * exp(-m.rate * m.maturity)
    return (max(a - b, 0.0), a) if m.kind == "call" else (max(b - a, 0.0), b)


def implied_volatility(target: float, m: Market, tolerance=1e-9) -> float:
    """Bracketed bisection, bounded at 300% annual volatility. Reject bad quotes."""
    if m.maturity <= 0:
        raise ValueError("Implied volatility is undefined at expiry.")
    if not isfinite(target) or target < 0:
        raise ValueError("The quoted premium must be finite and nonnegative.")
    lower, upper = arbitrage_bounds(m)
    if target < lower or target >= upper:
        raise ValueError(f"Premium must be in [{lower:.8g}, {upper:.8g}) under these assumptions.")
    if target - lower <= tolerance:
        return 0.0
    lo, hi = 0.0, 3.0
    if price(replace(m, volatility=hi)) < target - tolerance:
        raise ValueError("No implied volatility found within the supported 0–300% range.")
    for _ in range(100):
        mid = (lo + hi) / 2
        value = price(replace(m, volatility=mid))
        if abs(value - target) <= tolerance:
            return mid
        if value < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2
