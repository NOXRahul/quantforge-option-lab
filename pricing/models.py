from dataclasses import asdict, dataclass
import math


@dataclass(frozen=True)
class Market:
    spot: float = 100.0
    strike: float = 100.0
    maturity: float = 1.0
    rate: float = 0.05
    volatility: float = 0.20
    dividend: float = 0.0
    kind: str = "call"

    def __post_init__(self):
        bounds = {"spot": (1e-6, 1e9), "strike": (1e-6, 1e9),
                  "maturity": (0, 30), "rate": (-0.5, 0.5),
                  "volatility": (0, 3), "dividend": (-0.5, 0.5)}
        for name, (low, high) in bounds.items():
            value = getattr(self, name)
            if not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
                raise ValueError(f"{name} must be finite and between {low:g} and {high:g}.")
        if self.kind not in ("call", "put"):
            raise ValueError("Option type must be call or put.")

    def to_dict(self):
        return asdict(self)


@dataclass(frozen=True)
class Simulation:
    paths: int = 50_000
    steps: int = 126
    seed: int = 42
    batch_size: int = 10_000
    method: str = "Antithetic"

    def __post_init__(self):
        for name, low, high in (("paths", 128, 2_000_000), ("steps", 1, 1000),
                                ("seed", 0, 2**32 - 1), ("batch_size", 128, 100_000)):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
                raise ValueError(f"{name} must be an integer between {low:,} and {high:,}.")
        if self.method not in ("Standard", "Antithetic", "Control variate", "Sobol QMC"):
            raise ValueError("Unknown simulation method.")
        if self.method == "Antithetic" and self.paths % 2:
            raise ValueError("Antithetic sampling requires an even number of paths.")

    def to_dict(self):
        return asdict(self)
