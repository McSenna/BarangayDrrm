import { Crosshair, MapPin } from "lucide-react";
import StatusBadge from "../ui/StatusBadge.jsx";
import { purokLabel } from "../../utils/purokLabel.js";
import { REVIEW_LABEL } from "./GisPopups.jsx";

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

/**
 * The five household figures, from households/purok_classification.php
 * (flood_summary). Each figure is also a filter: pressing it narrows the map
 * and the household list; pressing it again clears the filter.
 */
export function GisSummary({ summary, zone, onZone, loading }) {
  const s = summary || {};
  const cells = [
    { key: "", label: "Registered households", value: s.registered, sub: "In the household registry" },
    { key: "mapped", label: "Mapped", value: s.mapped, sub: s.registered ? `${pct(s.mapped, s.registered)}% have a map location` : "Have a map location" },
    { key: "unmapped", label: "Unmapped", value: s.unmapped, sub: s.unmapped ? "Need a location assigned" : "Every household is mapped", tone: s.unmapped ? "warn" : "" },
    { key: "flood_prone", label: "In flood-prone zones", value: s.flood_prone, sub: "Located in Puroks 1–4", tone: "flood" },
    { key: "not_designated", label: "Not currently designated", value: s.not_designated, sub: "Located in Puroks 5A–7", tone: "neutral" },
  ];
  return (
    <section className="gis-ledger" aria-label="Household summary">
      {cells.map((c) => {
        const active = c.key ? zone === c.key : zone === "";
        return (
          <button key={c.label} type="button" className={`gis-ledger-cell${c.tone ? ` is-${c.tone}` : ""}${active ? " is-active" : ""}`}
            aria-pressed={active} onClick={() => onZone(active && c.key ? "" : c.key)}>
            <span className="gis-ledger-label">
              {c.tone === "flood" && <i className="gis-swatch gis-swatch--flood" aria-hidden="true" />}
              {c.tone === "neutral" && <i className="gis-swatch gis-swatch--neutral" aria-hidden="true" />}
              {c.label}
            </span>
            <span className="gis-ledger-value">{loading && c.value == null ? "…" : c.value ?? "—"}</span>
            <span className="gis-ledger-sub">{c.sub}</span>
          </button>
        );
      })}
    </section>
  );
}

/** Household breakdown per Purok (stored Purok), with the flood designation and geographic counts. */
export function PurokBreakdown({ rows, other, selectedPurok, onPick }) {
  const total = rows.reduce((t, r) => ({
    registered: t.registered + r.registered, mapped: t.mapped + r.mapped, unmapped: t.unmapped + r.unmapped, inside: t.inside + r.inside_polygon,
  }), { registered: 0, mapped: 0, unmapped: 0, inside: 0 });
  return (
    <section className="card table-card gis-breakdown" aria-labelledby="gis-breakdown-title">
      <div className="gis-card-head">
        <h2 id="gis-breakdown-title" className="section-title">Households by Purok</h2>
        <p>Registered and mapped counts use each household's stored Purok. “Inside boundary” counts households whose map location falls inside that Purok's polygon.</p>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Households by Purok">
        <table>
          <thead>
            <tr><th scope="col">Purok</th><th scope="col">Flood zone</th><th scope="col" className="num">Registered</th><th scope="col" className="num">Mapped</th><th scope="col" className="num">Unmapped</th><th scope="col" className="num">Inside boundary</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.purok} className={selectedPurok === r.purok ? "is-selected" : undefined}>
                <th scope="row">
                  <button type="button" className="gis-row-link" onClick={() => onPick(r.purok)} aria-pressed={selectedPurok === r.purok}>
                    <i className={`gis-swatch gis-swatch--${r.designation === "flood_prone" ? "flood" : "neutral"}`} aria-hidden="true" />
                    {r.purok}
                  </button>
                </th>
                <td>{r.designation === "flood_prone"
                  ? <StatusBadge tone="high">Flood-prone</StatusBadge>
                  : <StatusBadge tone="neutral">Not designated</StatusBadge>}</td>
                <td className="num">{r.registered}</td>
                <td className="num">{r.mapped}</td>
                <td className="num">{r.unmapped || <span className="gis-zero">0</span>}</td>
                <td className="num">{r.inside_polygon}</td>
              </tr>
            ))}
            {other && other.registered > 0 && (
              <tr>
                <th scope="row"><span className="gis-row-plain">Other stored values</span></th>
                <td><StatusBadge tone="warning">Unknown</StatusBadge></td>
                <td className="num">{other.registered}</td>
                <td className="num">{other.mapped}</td>
                <td className="num">{other.unmapped}</td>
                <td className="num">—</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">All Puroks</th><td />
              <td className="num">{total.registered + (other?.registered || 0)}</td>
              <td className="num">{total.mapped + (other?.mapped || 0)}</td>
              <td className="num">{total.unmapped + (other?.unmapped || 0)}</td>
              <td className="num">{total.inside}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** Households whose location and stored Purok disagree or cannot be placed — for an official to check. */
export function LocationReview({ rows, canEdit, onLocate, onAssign }) {
  return (
    <section className="card gis-review" aria-labelledby="gis-review-title">
      <div className="gis-card-head">
        <h2 id="gis-review-title" className="section-title">Location review <span className="gis-count">{rows.length}</span></h2>
        <p>Nothing is changed automatically. Confirm on site, then correct the Purok on the Households page or move the map location.</p>
      </div>
      {rows.length === 0 ? (
        <p className="gis-empty">Every mapped household sits inside the Purok it is registered to.</p>
      ) : (
        <ul className="gis-review-list" role="list">
          {rows.map((h) => (
            <li key={h.household_id}>
              <div className="gis-review-main">
                <p className="gis-review-name">{h.head_of_family} <span className="gis-muted">#{h.household_id} · {purokLabel(h.purok)}</span></p>
                <p className="gis-review-what"><strong>{REVIEW_LABEL[h.location_status] || "Check needed"}</strong>{h.location_note ? ` — ${h.location_note}` : ""}</p>
              </div>
              <div className="gis-review-actions">
                {h.latitude != null && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onLocate(h)}><Crosshair aria-hidden="true" size={14} strokeWidth={2.25} />Locate</button>
                )}
                {canEdit && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAssign(h)}><MapPin aria-hidden="true" size={14} strokeWidth={2.25} />Move</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
