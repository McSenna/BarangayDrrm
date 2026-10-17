import { DAMAGE_CLASSIFICATIONS } from "../utils/householdAssessment.js";

/**
 * Household damage classification for the field visit: one radio per level, shown as labelled cards.
 * `points` maps each classification to its points as published by the server (scoring method); the
 * officer chooses the classification only — the server maps it to points.
 */
export default function DamageClassificationPicker({ value, onChange, points = {}, disabled = false, required = false }) {
  return (
    <fieldset className="damage-picker" disabled={disabled}>
      <legend>Household damage{required ? " (required)" : ""}</legend>
      <div className="damage-picker-grid">
        {DAMAGE_CLASSIFICATIONS.map((d) => (
          <label key={d.value} className="damage-option">
            <input type="radio" name="damage_classification" value={d.value} checked={value === d.value}
              onChange={() => onChange(d.value)} required={required} />
            <span className="damage-option-label">{d.label}</span>
            {points[d.value] != null && <span className="damage-option-points">{points[d.value]} pts</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
