from dataclasses import replace
import numpy as np
import pandas as pd
from pricing.black_scholes import price
from pricing.greeks import analytical


def surface(m, x_name="spot", y_name="volatility", metric="Price", resolution=36):
    axes = {
        "spot": np.linspace(max(1e-6, m.spot*0.5), min(1e9, m.spot*1.5), resolution),
        "strike": np.linspace(max(1e-6, m.strike*0.5), min(1e9, m.strike*1.5), resolution),
        "volatility": np.linspace(0.01, min(3, max(0.6, m.volatility*1.6)), resolution),
        "maturity": np.linspace(1/365, min(30, max(2, m.maturity*1.5)), resolution),
    }
    x, y = axes[x_name], axes[y_name]
    z = np.empty((len(y), len(x)))
    for j, yv in enumerate(y):
        for i, xv in enumerate(x):
            p = replace(m, **{x_name: float(xv), y_name: float(yv)})
            z[j, i] = price(p) if metric == "Price" else analytical(p)[metric]
    return x, y, z


def scenarios(m, spot_shift, vol_shift, rate_shift):
    base = price(m)
    rows = []
    for label, ds, dv, dr in [("Base", 0, 0, 0), ("Spot shift", spot_shift, 0, 0),
                              ("Volatility shift", 0, vol_shift, 0), ("Rate shift", 0, 0, rate_shift),
                              ("Combined", spot_shift, vol_shift, rate_shift)]:
        p = replace(m, spot=m.spot*(1+ds), volatility=m.volatility+dv, rate=m.rate+dr)
        value = price(p)
        rows.append({"Scenario": label, "Spot ($)": p.spot, "Volatility (%)": p.volatility*100,
                     "Rate (%)": p.rate*100, "Price ($)": value, "Change ($)": value-base})
    return pd.DataFrame(rows)
