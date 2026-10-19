# Source audit and implementation decisions

## Available material

The supplied project mirror contained `AGENTS.md` and an empty `sources/` directory. The pasted brief described a Python/Streamlit Monte Carlo project, but no original application source was available to inspect. The supplied Streamlit URL could not be retrieved through the web reader. No claims are made about bugs or architecture in that unavailable code.

All work lives in the new `quantforge/` directory. No synced source material was edited, moved or deleted.

## User direction

The user subsequently clarified that the long brief was an example, invited independent design choices, and preferred a much stronger custom UI suitable for Vercel. This implementation follows that clarification:

- React + TypeScript + Vite for a custom, static-deployable application.
- Three.js for a real financial mesh with camera controls and hover values.
- Recharts for consistent interactive financial charts.
- A dedicated browser Web Worker for pricing and simulation Greek calculations.
- A retained Python/NumPy reference engine for independent research and optional Sobol simulation.

There is no Streamlit dependency in the website. Vercel can serve the static app without a Python service, secrets, or a paid data provider.

## Design

Charcoal background, burgundy ambient light, coral/red surfaces, quiet silver typography, bundled Space Grotesk/DM Sans/IBM Plex Mono, compact vertical navigation and five focused workspaces. The first view shows four pricing diagnostics, the analytical surface, a working parameter panel, convergence, terminal distribution, and Greek summary.

The interface avoids synthetic live-market badges, fake pricing feeds, nonfunctional buttons, arbitrary performance scores, or decorative 3D objects. Computation status describes the real worker lifecycle.

## Scope decisions

- Three Monte Carlo methods run on every experiment for a directly comparable result table.
- Sobol is optional in Python only; there is no fake or placeholder quasi-MC option in the browser.
- Surfaces use analytical pricing, so exploring them does not launch thousands of independent Monte Carlo estimates.
- The core stores no dense path matrix. Visualization paths use a separate seeded sample.
- Presets are session-scoped and experiment JSON enables durable reproduction.
- A simple long-call/long-put strategy view is implemented correctly, including optional premium financing. Unimplemented multi-leg portfolio tools are not advertised.
- Hosting configuration and instructions are included; production deployment requires the user's Vercel project/account.
