# Mathematical and statistical methodology

## Model and units

For a European option with continuous dividend yield `q`:

```text
ST = S0 exp((r - q - sigma²/2) T + sigma sqrt(T) Z), Z ~ N(0,1)
C = exp(-rT) E[max(ST - K, 0)]
P = exp(-rT) E[max(K - ST, 0)]
```

`r`, `q` and `sigma` are annual decimals. `T` is ACT/365 years. Output prices are USD per share, not per 100-share contract. Rates/dividends are continuously compounded. The exact GBM terminal distribution is sampled directly; trajectory time steps do not affect a European terminal estimate.

## Analytical benchmark

```text
d1 = (log(S/K) + (r-q+sigma²/2)T) / (sigma sqrt(T))
d2 = d1 - sigma sqrt(T)
C = S exp(-qT) N(d1) - K exp(-rT) N(d2)
P = K exp(-rT) N(-d2) - S exp(-qT) N(-d1)
```

The implementation computes the out-of-the-money option directly and uses parity for the other side to reduce cancellation. At `T=0`, the value is intrinsic payoff. At `sigma=0`, it is the discounted deterministic payoff. The TypeScript normal CDF uses a convergent incomplete-gamma series/continued fraction rather than a low-accuracy convenience polynomial.

## Monte Carlo estimators

### Standard

Stream discounted payoffs through stable online mean/variance updates. For `n` independent observations, `SE = sampleSD / sqrt(n)`.

### Antithetic

For each independent normal `Z`, simulate `Z` and `-Z`. One statistical observation is the **mean of the two discounted payoffs**. A 50,000-path run has 25,000 independent observations. Standard error uses pair means. Treating the two paths as independent would misstate uncertainty. The selected antithetic estimator requires an even path count. In comparison runs launched with an odd standard/control path count, antithetic uses one fewer path; exports record actual counts.

### Control variate

Let `Y` be discounted option payoff and `X` be discounted terminal stock. Its known expectation is `S exp(-qT)`. Simulate:

```text
Y_adjusted = Y - beta (X - S exp(-qT))
beta = sampleCov(X,Y) / sampleVar(X)
```

Fit beta using a separate, deterministically seeded **4,096-path pilot**, then hold it fixed on the independent main sample. This avoids the finite-sample bias that can arise from estimating and applying beta on the same sample. SE is computed from the adjusted main observations. The pilot count and runtime are reported, and its paths are not counted as main estimate paths. Deterministic cases skip the pilot.

Variance reduction is `1 - SE_method² / SE_standard²`. This is an estimate at the displayed path budget, not a promise for every contract or a cost-adjusted efficiency score. Standard/control methods share main draws, making their errors correlated. Times are estimator wall times, including control pilot cost; comparison UI/render/worker startup costs are excluded.

### Confidence intervals and convergence

The browser uses approximate normal intervals `estimate ± 1.96 SE`. Convergence bands are pointwise, not simultaneous bands over the entire run. The horizontal convergence axis is logarithmic in the number of paths.

For deep out-of-the-money options, zero observed positive payoffs can produce a zero sample SE even though rare payoffs exist. Extreme volatility/maturity may require substantially more paths than the supported budget for stable inference. An observed error need not shrink monotonically as paths are added. CIs measure sampling noise under the model, not mispricing, future returns or market-value uncertainty.

### Optional reference Sobol estimator

The Python implementation uses 16 independent scrambled Sobol nets, each with a power-of-two number of points. It rounds the requested budget down to `16 × 2^floor(log2(requested/16))`. Actual counts are reported. SE uses the 16 independent replicate means and a Student-t critical value with 15 degrees of freedom. Individual Sobol points are not treated as independent observations. Convergence adds scrambles at a fixed net size. This path requires SciPy and is not exposed in the frontend.

## Greeks

| Greek | Reported convention |
| --- | --- |
| Delta | `dV/dS`, premium change per $1 spot increase. |
| Gamma | `d²V/dS²`, delta change per $1 spot increase. |
| Vega | `dV/dsigma / 100`, premium change per **one percentage point** of annual volatility. |
| Theta | `-dV/dT / 365`, premium change per **calendar day passing**. |
| Rho | `dV/dr / 100`, premium change per **one percentage point** of annual interest rate. |

Analytical call and put values are separately displayed. Simulation estimates use central differences with common random numbers (up to 100,000 paths), computing the variance of per-path differences. Spot bump is 1%; volatility bump is up to 0.001 absolute; rate bump is 0.0001; maturity bump is up to one day. Bumps shrink near zero boundaries. Boundary cases that cannot support central differences do not get an invented estimate. Sampling SE does not include finite-difference bias, especially gamma's sensitivity to the payoff kink.

At expiry, theta is undefined. At zero maturity/volatility and the payoff kink, the code reports undefined Greeks rather than silently assigning a derivative. Away from the kink, deterministic limiting derivatives are used where defined.

## Implied volatility

A bracketed bisection solver works over 0–300% annual volatility, rejects nonfinite/out-of-bound quotes, and refuses expiry contracts. No-arbitrage bounds use discounted spot and strike:

- Call: `[max(S exp(-qT) - K exp(-rT), 0), S exp(-qT))`.
- Put: `[max(K exp(-rT) - S exp(-qT), 0), K exp(-rT))`.

Quotes at the deterministic lower bound return zero within numerical price tolerance. Very short-dated or deep ITM/OTM quotes can be poorly conditioned: multiple volatility values may be indistinguishable at the numerical premium tolerance. A quote above the supported 300% price produces a clear error, not a clipped result.

## Profit and break-even

The strategy view is long one option per share. Default simple expiry profit is payoff minus premium paid. If financing is enabled, cost at expiry becomes `premium × exp(rT)`. Break-even is strike plus cost for a call, strike minus cost for a put. A negative put break-even is labeled unattainable for a nonnegative stock price. Commissions, taxes and hedging are excluded.

## Sources

- [Columbia University: The Black–Scholes Model, Martin Haugh](https://www.columbia.edu/~mh2078/FoundationsFE/BlackScholes.pdf).
- Glasserman, *Monte Carlo Methods in Financial Engineering*, Springer, 2004.
- [SciPy: Sobol](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.qmc.Sobol.html).
