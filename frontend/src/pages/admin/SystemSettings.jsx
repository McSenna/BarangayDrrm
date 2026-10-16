import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useSettings } from "../../context/SettingsContext.jsx";
import { updateSystemSettings } from "../../services/api.jsx";

const FIELDS = [
  { key: "barangay_name", label: "Barangay Name" },
  { key: "system_name", label: "System Name" },
  { key: "barangay_address", label: "Barangay Address" },
  { key: "office_hours", label: "Office Hours" },
  { key: "contact_email", label: "Contact Email" },
  { key: "contact_phone", label: "Contact Number" },
  { key: "emergency_hotline", label: "Emergency Hotline" },
  // Public landing page "What to do now" advisories — one step per line.
  { key: "public_advisory_steps", label: "Public advisory — Critical alert", multiline: true,
    help: "Shown on the public home page while a Critical hazard alert is active. One step per line." },
  { key: "public_advisory_steps_warning", label: "Public advisory — Warning / Alert", multiline: true,
    help: "Shown while the highest active alert is Warning or Alert. One step per line." },
  { key: "public_preparedness_tips", label: "Preparedness tips — no active alerts", multiline: true,
    help: "Shown when the barangay status is Normal. One tip per line." },
];

export default function SystemSettings() {
  const { settings, loading, refresh } = useSettings();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!loading) setForm(settings);
  }, [loading, settings]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const payload = {};
      FIELDS.forEach((f) => (payload[f.key] = form[f.key] ?? ""));
      const res = await updateSystemSettings(payload);
      setMsg({ type: "success", text: res.data.message || "Settings updated." });
      refresh();
    } catch (err) {
      setMsg({ type: "error", text: err.response?.data?.message || "We couldn't save the settings. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-text">Loading settings…</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>System Settings</h1>
          <p>The Barangay Name appears in the navigation bar and page footers, the System Name in the public page footers, the address, office hours, contact number, email and emergency hotline on the public Contact page, and the contact number as the emergency hotline on the public home page. The three advisory fields set the "What to do now" steps residents see on the home page. Replace the sample contact details with the barangay's official information before deployment.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 620, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginTop: 0 }}>Other settings</h3>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: 14 }}>
          <li><Link to="/admin/disaster-settings">Disaster Settings</Link> — disaster types used in reports</li>
          <li><Link to="/admin/inventory-settings">Inventory Settings</Link> — relief item categories and units</li>
          <li><Link to="/admin/purok-cleanup">Purok Cleanup</Link> — map older purok values to the standard list</li>
          <li><Link to="/admin/login-history">Login History</Link> — sign-in records</li>
        </ul>
      </div>

      <div className="card" style={{ maxWidth: 620 }}>
        <form onSubmit={handleSubmit}>
          {FIELDS.map((f) => (
            <div className="form-group" key={f.key}>
              <label htmlFor={`ss-${f.key}`}>{f.label}</label>
              {f.multiline ? (
                <textarea id={`ss-${f.key}`} name={f.key} rows={4} value={form[f.key] ?? ""} onChange={handleChange} aria-describedby={`ss-${f.key}-help`} />
              ) : (
                <input id={`ss-${f.key}`} name={f.key} value={form[f.key] ?? ""} onChange={handleChange} />
              )}
              {f.help && <p id={`ss-${f.key}-help`} style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--color-ink-soft)" }}>{f.help}</p>}
            </div>
          ))}
          {msg && (
            <p style={{ color: msg.type === "success" ? "var(--color-success)" : "var(--color-danger)", fontSize: 13 }}>
              {msg.text}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>
    </>
  );
}
