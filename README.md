# QUANTFORGE | OPTION LAB

A custom quantitative research interface built with **React, TypeScript, Three.js and Vite**, ready for Vercel. Dark charcoal, burgundy light, interactive financial surfaces, and a real Monte Carlo engine running in a background Web Worker.

The application uses hypothetical user-defined inputs. It has no live market feed, authentication service, or remote database. No API keys are needed.

## Run locally

Use Node.js 22 or newer (validated with Node 24).

```sh
cd quantforge
npm ci
npm run dev
```

Open the local URL printed by Vite, normally **http://127.0.0.1:5173/**. The first 50,000-path experiment runs automatically. Subsequent parameter changes apply only when you choose **Run simulation** or press **Ctrl/⌘ + Enter**.

```sh
npm test
npm run build
npm run preview
```

`npm run build` type-checks the entire frontend and creates the static `dist/` directory, including the separate simulation worker. Use a web server, not a `file://` URL, to run the built app.

## Deploy to Vercel

The included `vercel.json` configures the Vite framework, `npm run build`, and the `dist` output directory. No Python server or environment variables are required.

1. Put the contents of `quantforge/` in your repository, or select **quantforge** as the Vercel project's Root Directory if this folder is nested in a larger repository.
2. Import the repository in Vercel and select the **Vite** framework preset.
3. Install with `npm ci`, build with `npm run build`, and publish **dist**.

Alternatively, from this directory:

```sh
npx vercel
# After reviewing the preview deployment:
npx vercel --prod
```

These commands use your own Vercel login and project. This delivery includes deployment configuration; it does **not** claim that a hosted Vercel deployment already exists. See [Vercel's Vite documentation](https://vercel.com/docs/frameworks/frontend/vite).

## The five workspaces

| Workspace | Working functionality |
| --- | --- |
| Overview | Seeded Monte Carlo estimate, analytical benchmark, absolute/relative error, confidence interval, 3D spot–volatility surface, workbench and Greek summary. |
| Simulation | Exact-GBM display trajectories, path-count and horizon controls, terminal/payoff histograms, discounted-payoff switch, log-scale convergence and method comparison. |
| Greeks & risk | Analytical call/put Greeks, simulation finite differences and SEs, sensitivity curves, 3D/2D Greek surfaces, spot/volatility/rate scenarios, put–call parity, long-option payoff/profit and break-even analysis. |
| Volatility | Bracketed implied-volatility solver, validation of quote bounds, price sensitivity, strike–expiry surface and editable, explicitly illustrative volatility smile. |
| Research | Estimator table, session run history, CSV export, Markdown research report, versioned JSON export/import and model assumptions. |

Additional controls are under **Configure** or the settings icon: dividend yield, full 0–300% volatility range, up to two million paths, seed, batch size, display steps, reset, and up to ten named session presets.

### Interacting with surfaces

- Drag to rotate; scroll to zoom; use the reset button to restore the view.
- Hover over the surface to inspect exact analytical values at the selected coordinates.
- The grid button switches to a keyboard-accessible 2D heatmap. Unsupported/lost WebGL contexts use the heatmap automatically.
- All surfaces show financial data calculated from the last completed run's assumptions. They are analytical model surfaces, not market surfaces or decorative geometry.

### Reproducibility

Download **Experiment JSON** in Research. Restore it with **Restore experiment JSON**, then run the calculation. Market assumptions, seed, method, path count, batch size and time steps are preserved. The JSON also records numerical results and convergence observations.

The browser engine identifies its RNG as `sfc32-boxmuller-v1`. Repeated runs with the same configuration reproduce numerical results; runtime depends on device and browser. Batch size does not change the draw sequence. Current and prior estimates are never silently relabeled with draft inputs. The UI clearly flags unapplied parameter changes.

## Architecture

```text
src/
  App.tsx                 Application shell, experiment lifecycle, workbench, dialogs
  Pages.tsx               Simulation, risk, volatility and research workspaces
  ui.tsx                  Shared panels, inputs, formatting and Greek conventions
  Surface.tsx             Three.js surface, camera, hover inspection, 2D fallback
  Charts.tsx              Recharts convergence, distributions, paths and sensitivities
  engine.ts               Validated TypeScript financial/statistical engine
  simulation.worker.ts    Worker orchestration; all three estimators and MC Greeks
  exports.ts              CSV, research report and versioned metadata
  engine.test.ts          Numerical and statistical regression tests
  styles.css              Responsive design system and reduced-motion support
pricing/                  Optional NumPy/Python reference implementation
analytics/                Optional Python paths and sensitivity utilities
tests/                    Python reference tests
docs/                     Audit, mathematical methodology and verification record
```

The frontend is static and does not need server-side rendering. Vite produces a separately cached Three.js chunk, chart chunk and worker. Fonts are bundled locally; no CDN font requests are required. Simulations stream observations and retain at most 20,000 raw terminal/payoff samples per estimator. Display trajectories are generated separately and capped at 128 × 1,001 values. The full path-by-time matrix is never constructed for pricing.

Normal intervals are calculated from the correct independent statistical units. Antithetic pairs are not counted twice. Control coefficients come from an independent pilot. See [the methodology](docs/METHODOLOGY.md) for formulas, conventions and limitations.

## Optional Python research engine

This is a reference/research module, not a website dependency. It includes a correctly replicated optional scrambled Sobol estimator using SciPy, which is **not exposed in the browser UI**. Browser and Python RNGs differ, so their Monte Carlo samples are not identical.

```sh
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# macOS / Linux instead: source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pytest -q
```

Example:

```python
from pricing.models import Market, Simulation
from pricing.monte_carlo import run

result = run(
    Market(spot=100, strike=100, dividend=0.01, kind="call"),
    Simulation(paths=100_000, seed=42, method="Control variate"),
)
print(result.price, result.se, result.ci_low, result.ci_high)
```

The standard, antithetic, control, Black–Scholes, Greek and IV modules work without SciPy. Omitting SciPy disables Sobol explicitly and leaves all other methods available. The reference engine uses NumPy's seeded PCG64 generator. The frontend is entirely TypeScript.

## Testing and limitations

`npm test` covers known Black–Scholes values, normal-CDF accuracy, dividends/negative rates and put–call parity, Greek units and finite differences, deterministic/expiry boundaries, invalid inputs, seed/batch reproducibility, convergence, paired SEs, variance reduction, implied-volatility recovery and display paths. Python tests independently cover the reference implementation and optional Sobol replication.

See [QA.md](docs/QA.md) for actual executed checks and [AUDIT.md](docs/AUDIT.md) for source availability and the architecture decision.

- European exercise, constant rates/volatility/dividend yield, continuous paths and no transaction costs.
- Monte Carlo CIs measure sampling noise under these assumptions, not market-price uncertainty or model risk.
- Normal approximations can be unreliable for rare-event payoffs and extreme inputs. Zero observed variance does not prove the true uncertainty is zero.
- Finite-difference Greek SEs exclude discretization/bump bias. Undefined boundary Greeks are shown as dashes.
- The illustrative smile is not a calibrated or arbitrage-checked market surface.
- Browser storage holds session presets only. Export JSON for durable experiments. Reloading clears the recent-run notebook.
- No claim of execution-quality pricing, brokerage integration, or financial advice is made.

## References

- [Martin Haugh, The Black–Scholes Model, Columbia University](https://www.columbia.edu/~mh2078/FoundationsFE/BlackScholes.pdf).
- Paul Glasserman, *Monte Carlo Methods in Financial Engineering*, Springer, 2004.
- [SciPy Sobol documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.qmc.Sobol.html), for power-of-two nets and independent scrambles in the Python reference.
- [Vercel: deploying Vite](https://vercel.com/docs/frameworks/frontend/vite).
