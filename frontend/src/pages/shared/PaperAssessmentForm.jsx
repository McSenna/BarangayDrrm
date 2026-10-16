import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { REPORT_NEEDS } from "../../config/reportNeeds.js";

const PUROKS = ["1", "2", "3", "4", "5A", "5B", "6", "7"];
const DAMAGE = ["None", "Minor", "Major", "Totally Damaged"];
const box = (label) => <span className="pf-box" key={label}><span className="pf-check" aria-hidden="true" />{label}</span>;
const Line = ({ label, wide }) => (
  <div className={`pf-line${wide ? " pf-wide" : ""}`}><span className="pf-label">{label}</span><span className="pf-blank" /></div>
);

/**
 * Phase 25 — printable Household Disaster Assessment Form (manual fallback).
 *
 * The web system is NOT available offline. When there is no electricity,
 * signal or internet, barangay staff and purok leaders fill in this form on
 * paper during household visits; when access returns, an authorized user
 * encodes it through Record Disaster Report with Collection method = "Paper
 * Form" and the form number. The system keeps the original assessment date
 * and the encoding time separately and refuses a form number that was
 * already encoded. Only the information needed for the DSS and relief is
 * collected (no IDs, no income, no medical details).
 */
export default function PaperAssessmentForm() {
  const { user } = useAuth();
  const base = user?.role === "admin" ? "/admin" : "/personnel";
  return (
    <>
      <div className="page-header no-print">
        <div>
          <h1>Paper Assessment Form</h1>
          <p>Print copies before a disaster season. Use them when the system cannot be reached; encode them later.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => window.print()}>Print form</button>
          <Link to={`${base}/reports/new`} className="btn btn-ghost">Encode a filled form</Link>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 16, fontSize: 13.5 }}>
        <h3 style={{ fontSize: 15, marginTop: 0 }}>Outage procedure (system unavailable)</h3>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li><strong>Before:</strong> print and number the forms by Purok (e.g. P3-0001, P3-0002 …). Keep a printed household list per Purok.</li>
          <li><strong>During the visit:</strong> fill one form per household. Write the date of the visit, what you saw, the needs, and your name. Ask the household; residents do not need a phone.</li>
          <li><strong>Urgent cases:</strong> life-saving help never waits for the form or a score. Follow the barangay emergency procedure, mark the form <em>URGENT</em>, and tell the Administrator (who records an Emergency Override with the reason when the system is back).</li>
          <li><strong>Hand-over:</strong> forms go to the barangay hall in a folder per Purok; a second person checks them (verification box).</li>
          <li><strong>Encoding (when the system is back):</strong> Record Disaster Report → Collection method <em>Paper Form</em> → type the form number exactly → use the visit date as the assessment date. Write “Encoded by / date” on the paper.</li>
          <li><strong>Duplicates:</strong> the system refuses a form number already encoded, and warns if the same household already has a report of the same type on the same date. Check the existing report before confirming.</li>
          <li><strong>Keep the paper forms</strong> filed by Purok until the event is closed (audit trail).</li>
        </ol>
      </div>

      <div className="paper-form">
        <div className="pf-head">
          <div>
            <div className="pf-title">BARANGAY BINITAYAN — HOUSEHOLD DISASTER ASSESSMENT FORM</div>
            <div className="pf-sub">Daraga, Albay · Post-disaster monitoring and relief allocation · one form per household</div>
          </div>
          <div className="pf-formno">Form No. <span className="pf-blank" /></div>
        </div>

        <div className="pf-section">1. Event and visit</div>
        <div className="pf-grid">
          <Line label="Disaster event" wide />
          <Line label="Date of visit (YYYY-MM-DD)" />
          <Line label="Time" />
          <div className="pf-line pf-wide"><span className="pf-label">Collection</span>{["Field Visit", "Interview", "Barangay Records"].map(box)}</div>
        </div>

        <div className="pf-section">2. Household</div>
        <div className="pf-grid">
          <Line label="Household head" wide />
          <Line label="Household ID (if known)" />
          <div className="pf-line"><span className="pf-label">Purok</span>{PUROKS.map(box)}</div>
          <Line label="Address / landmark" wide />
          <Line label="Number of members" />
          <Line label="Contact no. (if any)" />
          <div className="pf-line pf-wide"><span className="pf-label">Vulnerable members (count)</span>
            {["Children", "Seniors", "PWD", "Pregnant", "Needs medical care"].map((v) => <span className="pf-count" key={v}>{v} ____</span>)}</div>
          <div className="pf-line pf-wide"><span className="pf-label">Displacement</span>{["Not displaced", "With relatives", "Evacuation center", "Other shelter"].map(box)}</div>
        </div>

        <div className="pf-section">3. Damage observed</div>
        <table className="pf-table">
          <thead><tr><th />{DAMAGE.map((d) => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>
            {["House", "Infrastructure", "Property", "Agricultural"].map((r) => (
              <tr key={r}><td>{r}</td>{DAMAGE.map((d) => <td key={d}><span className="pf-check" /></td>)}</tr>
            ))}
          </tbody>
        </table>
        <div className="pf-grid">
          <div className="pf-line pf-wide"><span className="pf-label">Overall severity</span>{["Low", "Medium", "High", "Critical"].map(box)}<span className="pf-box"><span className="pf-check" />URGENT</span></div>
        </div>

        <div className="pf-section">4. Immediate needs (unmet now)</div>
        <div className="pf-grid"><div className="pf-line pf-wide">{REPORT_NEEDS.map(box)}</div></div>

        <div className="pf-section">5. Location (only if a GPS reading is available)</div>
        <div className="pf-grid"><Line label="Latitude" /><Line label="Longitude" /></div>

        <div className="pf-section">6. What was observed</div>
        <div className="pf-notes" />

        <div className="pf-section">7. Responsibility</div>
        <div className="pf-grid">
          <Line label="Assessed by (name, position)" wide />
          <Line label="Signature" />
          <Line label="Verified by (name)" />
          <Line label="Encoded by / date encoded" wide />
          <Line label="System reference (RPT-…)" />
        </div>
        <p className="pf-foot">Collect only what is needed for relief. Do not write ID numbers, income or medical details. Keep this form filed by Purok after encoding.</p>
      </div>
    </>
  );
}
