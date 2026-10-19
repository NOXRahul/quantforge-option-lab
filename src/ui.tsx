import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import type { Greek } from "./engine";

export const money = (v: number, d = 4) =>
  Number.isFinite(v)
    ? `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`
    : "—";
export const num = (v: number, d = 4) =>
  Number.isFinite(v) ? v.toFixed(d) : "—";
export const pct = (v: number, d = 1) =>
  Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "—";
export const greekInfo: Record<Greek, { unit: string; description: string }> = {
  delta: {
    unit: "$ / $ spot",
    description: "Premium change per $1 increase in the underlying.",
  },
  gamma: {
    unit: "Δ / $ spot",
    description: "Delta change per $1 increase in the underlying.",
  },
  vega: {
    unit: "$ / 1 pp vol",
    description:
      "Premium change for a one percentage-point rise in volatility.",
  },
  theta: {
    unit: "$ / day",
    description: "Premium change as one calendar day passes (ACT/365).",
  },
  rho: {
    unit: "$ / 1 pp rate",
    description:
      "Premium change for a one percentage-point rise in the risk-free rate.",
  },
};

export function Panel({
  title,
  kicker,
  action,
  children,
  className = "",
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          {kicker && <div className="eyebrow">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`chip ${tone}`}>{children}</span>;
}
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  help?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {help && (
          <span className="field-help" title={help}>
            <CircleHelp size={11} />
          </span>
        )}
      </span>
      <div className="input-shell">
        <input
          type="number"
          value={Number.isFinite(value) ? Number(value.toFixed(8)) : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? NaN : Number(e.target.value))
          }
          min={min}
          max={max}
          step={step}
          aria-label={label}
        />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}
