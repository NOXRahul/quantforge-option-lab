from dataclasses import replace
import math
import numpy as np
import pytest
from pricing.models import Market, Simulation
from pricing.black_scholes import price, implied_volatility
from pricing.greeks import analytical, simulated
from pricing.monte_carlo import run, HAS_QMC
from analytics.simulation import trajectories


def test_known_prices():
    assert price(Market()) == pytest.approx(10.450583572185565, abs=1e-10)
    assert price(Market(kind="put")) == pytest.approx(5.573526022256971, abs=1e-10)


@pytest.mark.parametrize("rate", [-.05, 0, .1])
@pytest.mark.parametrize("spot", [30, 100, 250])
def test_parity(rate, spot):
    m = Market(spot=spot, rate=rate, dividend=.02)
    assert price(m)-price(replace(m, kind="put")) == pytest.approx(spot*math.exp(-.02)-100*math.exp(-rate), abs=1e-10)


@pytest.mark.parametrize("method", ["Standard", "Antithetic", "Control variate"])
@pytest.mark.parametrize("kind", ["call", "put"])
def test_mc(method, kind):
    m = Market(kind=kind, dividend=.01)
    r = run(m, Simulation(method=method, paths=200_000))
    assert abs(r.price-price(m)) < 5*r.se
    assert r.ci_low == pytest.approx(r.price-1.96*r.se)
    assert r.ci_high == pytest.approx(r.price+1.96*r.se)


def test_pair_standard_error():
    m = Market()
    r = run(m, Simulation(paths=10_000, method="Antithetic"))
    pairs = r.payoff.reshape(-1, 2).mean(axis=1)*math.exp(-m.rate*m.maturity)
    assert r.independent_units == 5000
    assert r.se == pytest.approx(pairs.std(ddof=1)/math.sqrt(len(pairs)))


def test_reproducibility_and_batching():
    m, c = Market(), Simulation()
    a, b = run(m, c), run(m, replace(c, batch_size=256))
    assert a.price == pytest.approx(b.price, abs=1e-12)
    np.testing.assert_array_equal(a.terminal, run(m, c).terminal)
    assert a.price != run(m, replace(c, seed=43)).price


def test_variance_reduction():
    m, c = Market(), Simulation()
    standard = run(m, replace(c, method="Standard"))
    for method in ("Antithetic", "Control variate"):
        assert run(m, replace(c, method=method)).se < standard.se
    assert run(m, replace(c, method="Control variate")).pilot_paths == 4096


@pytest.mark.parametrize("m", [Market(volatility=0), Market(maturity=0), Market(strike=1e6), Market(strike=.01), Market(maturity=1e-10)])
def test_boundaries(m):
    assert math.isfinite(price(m))
    assert price(m) >= 0
    if m.volatility == 0 or m.maturity == 0:
        r = run(m, Simulation())
        assert r.price == pytest.approx(price(m), abs=1e-10)
        assert r.se < 1e-12


def test_greeks():
    m, g = Market(), analytical(Market())
    assert g["Delta"] == pytest.approx(.6368306511756191)
    assert g["Gamma"] == pytest.approx(.018762017345846895)
    assert g["Vega"] == pytest.approx(.3752403469169379)
    assert g["Theta"] == pytest.approx(-6.414027546438197/365)
    assert g["Rho"] == pytest.approx(.5323248154537634)
    for name, result in simulated(m, paths=100_000).items():
        assert abs(result["estimate"]-g[name]) < 5*result["se"]+1e-4
    assert math.isnan(analytical(Market(maturity=0))["Delta"])


@pytest.mark.parametrize("vol", [.05, .2, .7, 1.5])
@pytest.mark.parametrize("kind", ["call", "put"])
def test_iv_recovery(vol, kind):
    m = Market(volatility=vol, kind=kind)
    assert implied_volatility(price(m), m) == pytest.approx(vol, abs=1e-7)


def test_invalid_inputs():
    for kwargs in [{"spot": 0}, {"strike": -1}, {"volatility": -1}, {"maturity": -1}, {"rate": float("nan")}]:
        with pytest.raises(ValueError):
            Market(**kwargs)
    with pytest.raises(ValueError):
        Simulation(paths=129)
    with pytest.raises(ValueError):
        implied_volatility(1000, Market())
    with pytest.raises(ValueError):
        implied_volatility(1, Market(maturity=0))


@pytest.mark.skipif(not HAS_QMC, reason="Optional SciPy not installed")
def test_sobol_replicates():
    r = run(Market(), Simulation(method="Sobol QMC", paths=65_536))
    assert r.independent_units == 16
    assert r.paths == 65_536
    assert abs(r.price-price(Market())) < 6*r.se
    assert r.ci_high-r.price > 1.96*r.se


def test_trajectories():
    m, c = Market(volatility=0), Simulation()
    times, paths = trajectories(m, c, count=8)
    assert paths.shape == (8, 127)
    np.testing.assert_allclose(paths[:, -1], m.spot*math.exp(m.rate*m.maturity))
    assert times[-1] == m.maturity
