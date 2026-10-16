import { Check } from "lucide-react";

/**
 * Picks a metric's tone from its value, so no row hard-codes a colour.
 *
 * `alertWhen` says what a non-zero value means for this metric:
 *   "critical" — any count is an emergency (e.g. critical incidents)
 *   "pending"  — any count needs action (e.g. reports to verify)
 *   omitted    — informational; always neutral
 * A watched metric that reaches 0 is "ok": the work is done.
 */
export function deriveTone(value, alertWhen) {
  if (!alertWhen) return "neutral";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "neutral";
  return n > 0 ? alertWhen : "ok";
}

/**
 * A metric value with its tone:
 *   critical  red pill, white text
 *   pending   orange pill, navy text
 *   ok        green-tint pill with a check
 *   neutral   plain navy bold number
 */
// Full class names (not built from strings) so Tailwind keeps them in the build.
const TONE_CLASS = {
  critical: "stat-val-critical",
  pending: "stat-val-pending",
  ok: "stat-val-ok",
  neutral: "stat-val-neutral",
};

export default function StatValue({ value, tone = "neutral", className = "" }) {
  const cls = `stat-val ${TONE_CLASS[tone] || TONE_CLASS.neutral}${className ? ` ${className}` : ""}`;
  return (
    <span className={cls}>
      {tone === "ok" && <Check aria-hidden="true" size={13} strokeWidth={3} />}
      {value}
    </span>
  );
}
