import {
  simulate,
  simulatedGreeks,
  type Market,
  type Config,
  type Method,
} from "./engine";
self.onmessage = (event: MessageEvent<{ m: Market; c: Config }>) => {
  try {
    const { m, c } = event.data;
    const results = (["standard", "antithetic", "control"] as Method[]).map(
      (method) =>
        simulate(m, {
          ...c,
          method,
          paths: method === "antithetic" ? c.paths - (c.paths % 2) : c.paths,
        }),
    );
    let risk = null;
    try {
      risk = simulatedGreeks(m, c);
    } catch {
      /* Analytical boundary values remain available. */
    }
    self.postMessage({ ok: true, results, risk });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Simulation failed.",
    });
  }
};
