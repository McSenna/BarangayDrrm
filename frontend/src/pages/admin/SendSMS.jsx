import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import BeneficiaryPicker from "../../components/BeneficiaryPicker.jsx";
import UserRecipientPicker from "../../components/UserRecipientPicker.jsx";
import { sendSms } from "../../services/api.jsx";

const CATEGORIES = [
  "General", "Emergency Warning", "Disaster Alert", "Evacuation Warning",
  "Relief Distribution Announcement", "Distribution Schedule", "Beneficiary Notification", "Relief Availability",
];

const TEMPLATES = {
  "Emergency Warning": "BARANGAY BINITAYAN EMERGENCY: [describe the emergency]. Please stay alert and follow the instructions of barangay officials.",
  "Disaster Alert": "BARANGAY BINITAYAN ALERT: A [disaster type] has been reported in [location]. Please take necessary precautions.",
  "Evacuation Warning": "EVACUATION NOTICE: Residents of [purok/area] are advised to evacuate to [evacuation center] immediately due to [reason].",
  "Relief Distribution Announcement": "Relief goods will be distributed on [date] at [time], [location]. Please bring a valid ID.",
  "Distribution Schedule": "Your household is scheduled to receive relief on [date] at [time], [location].",
  "Beneficiary Notification": "Your household is included in the relief distribution. Please proceed to [location] on [date] at [time] to receive your relief items. Please bring a valid ID.",
  "Relief Availability": "New relief goods are now available at the barangay hall. Eligible households may inquire with the barangay office.",
  "General": "",
};

export default function SendSMS() {
  const location = useLocation();
  const prefill = location.state || {};

  const [recipientMode, setRecipientMode] = useState(prefill.recipient_mode || "resident");
  const [category, setCategory] = useState(prefill.category || "General");
  const [message, setMessage] = useState(prefill.message || "");
  const [userIds, setUserIds] = useState([]);
  const [householdIds, setHouseholdIds] = useState(prefill.household_ids || []);
  const [customRecipients, setCustomRecipients] = useState([{ name: "", number: "" }]);

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (prefill.household_ids) setRecipientMode("household");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCategoryChange = (e) => {
    const newCategory = e.target.value;
    setCategory(newCategory);
    if (!message.trim() || Object.values(TEMPLATES).includes(message)) {
      setMessage(TEMPLATES[newCategory] || "");
    }
  };

  const updateCustomRow = (index, field, value) => {
    const updated = [...customRecipients];
    updated[index] = { ...updated[index], [field]: value };
    setCustomRecipients(updated);
  };
  const addCustomRow = () => setCustomRecipients([...customRecipients, { name: "", number: "" }]);
  const removeCustomRow = (index) => setCustomRecipients(customRecipients.filter((_, i) => i !== index));

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const payload = { recipient_mode: recipientMode, message: message.trim(), category };
      if (recipientMode === "resident" || recipientMode === "personnel") payload.user_ids = userIds;
      if (recipientMode === "household") payload.household_ids = householdIds;
      if (recipientMode === "custom") payload.custom_recipients = customRecipients.filter((c) => c.number.trim());

      const res = await sendSms(payload);
      setResult({ success: res.data.success, message: res.data.message });
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.message || "The SMS could not be sent. Please try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Send SMS</h1>
          <p>Manually send SMS notifications to residents, relief personnel, selected households, or other phone numbers.</p>
        </div>
      </div>

      {result && (
        <div className={`alert ${result.success ? "alert-success" : "alert-error"}`}>{result.message}</div>
      )}

      <form onSubmit={handleSend}>
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Message</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              <select value={category} onChange={handleCategoryChange}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Message Text</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message. Choosing a category inserts a template you can edit."
              rows={4}
              required
            />
            <p style={{ fontSize: 12, color: "var(--color-ink-soft)", marginTop: 4 }}>{message.length} characters</p>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Recipients</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              ["resident", "Residents"],
              ["personnel", "Relief Personnel"],
              ["household", "Selected Households"],
              ["custom", "Other Phone Numbers"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`btn btn-sm ${recipientMode === mode ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setRecipientMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          {recipientMode === "resident" && <UserRecipientPicker role="resident" selected={userIds} onChange={setUserIds} />}
          {recipientMode === "personnel" && <UserRecipientPicker role="relief_personnel" selected={userIds} onChange={setUserIds} />}
          {recipientMode === "household" && <BeneficiaryPicker selected={householdIds} onChange={setHouseholdIds} />}

          {recipientMode === "custom" && (
            <div>
              {customRecipients.map((row, index) => (
                <div key={index} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
                  <div className="form-group" style={{ marginBottom: 0, flex: "1 1 160px" }}>
                    <input value={row.name} onChange={(e) => updateCustomRow(index, "name", e.target.value)} placeholder="Name (optional)" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0, flex: "1 1 160px" }}>
                    <input value={row.number} onChange={(e) => updateCustomRow(index, "number", e.target.value)} placeholder="+63 9XX XXX XXXX" required />
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeCustomRow(index)} disabled={customRecipients.length === 1} aria-label={`Remove recipient ${index + 1}`}><X aria-hidden="true" size={15} strokeWidth={2.25} /></button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={addCustomRow}>+ Add Number</button>
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary" disabled={sending}>
          {sending ? "Sending…" : "Send SMS"}
        </button>
      </form>
    </>
  );
}
