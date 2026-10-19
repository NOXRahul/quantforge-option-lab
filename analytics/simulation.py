import numpy as np
from pricing.models import Market, Simulation


def trajectories(m: Market, config: Simulation, count=32, horizon=None):
    """Independent display sample; exact GBM transitions, at most 128 × 1001."""
    if not isinstance(count, int) or not 1 <= count <= 128:
        raise ValueError("Display between 1 and 128 paths.")
    horizon = m.maturity if horizon is None else float(horizon)
    if not np.isfinite(horizon) or not 0 <= horizon <= 30:
        raise ValueError("Trajectory horizon must lie between 0 and 30 years.")
    times = np.linspace(0, horizon, config.steps+1)
    dt = horizon/config.steps
    rng = np.random.default_rng(np.random.SeedSequence([config.seed, 8675309]))
    increments = (m.rate-m.dividend-0.5*m.volatility**2)*dt + m.volatility*np.sqrt(dt)*rng.standard_normal((count, config.steps))
    values = m.spot*np.exp(np.column_stack((np.zeros(count), np.cumsum(increments, axis=1))))
    return times, values
