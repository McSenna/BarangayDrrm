import { localDateISO } from "../../utils/dates.js";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { REPORT_NEEDS } from "../../config/reportNeeds.js";
import { createReport, uploadReportPhotos, getDisasterTypes, getHouseholds, getDisasterEvents } from "../../services/api.jsx";

// Phase 25 — official-led assessment (field visits, interviews, barangay records, paper forms encoded later).
const COLLECTION_METHODS = ["Field Visit", "Paper Form", "Interview", "Barangay Records", "Direct Entry"];
const DISPLACEMENT = ["Not Displaced", "Staying with Relatives", "In Evacuation Center", "Other Shelter"];

// Fallback list, used only if the disaster types API fails.
const FALLBACK_DISASTER_TYPES = ["Flood", "Typhoon", "Landslide", "Earthquake", "Fire", "Other"];
const SEVERITY_LEVELS = ["Low", "Medium", "High", "Critical"];
const MAX_PHOTOS = 5;


/**
 * Record Disaster Report (Phase 21) — Administrator / Barangay Officials and
 * Relief Personnel record a disaster incident for a registered household.
 * Residents no longer submit reports. The report starts as Pending; only the
 * Administrator can verify or reject it.
 */
export default function RecordDisasterReport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const base = user?.role === "admin" ? "/admin" : "/personnel";
  const [disasterTypes, setDisasterTypes] = useState(FALLBACK_DISASTER_TYPES);
  const [households, setHouseholds] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    household_id: "",
    disaster_type: "Flood",
    location: "",
    description: "",
    report_date: localDateISO(),
    report_time: new Date().toTimeString().slice(0, 5),
    severity: "Medium",
    latitude: "",
    longitude: "",
    reported_needs: [],
    event_id: "",
    collection_method: "Field Visit",
    paper_form_no: "",
    field_assessor: "",
    displacement_status: "",
  });
  const [events, setEvents] = useState([]);
  const [duplicate, setDuplicate] = useState(null); // server message when a likely duplicate is found
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getDisasterTypes({ active_only: 1 })
      .then((res) => {
        const names = res.data.data.map((t) => t.type_name);
        if (names.length > 0) {
          setDisasterTypes(names);
          setForm((f) => ({ ...f, disaster_type: names.includes(f.disaster_type) ? f.disaster_type : names[0] }));
        }
      })
      .catch(() => {});
    getHouseholds().then((res) => setHouseholds(res.data.data || [])).catch(() => {});
    getDisasterEvents()
      .then((res) => {
        const list = res.data.data || [];
        setEvents(list);
        const active = list.find((e) => e.status === "Active");
        if (active) setForm((f) => ({ ...f, event_id: f.event_id || String(active.event_id) }));
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? households.filter((h) => `${h.head_of_family} ${h.purok} ${h.address || ""}`.toLowerCase().includes(q))
      : households;
    return list.slice(0, 200);
  }, [households, search]);

  const selected = households.find((h) => String(h.household_id) === String(form.household_id));

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const chooseHousehold = (e) => {
    const id = e.target.value;
    const h = households.find((x) => String(x.household_id) === id);
    setForm((f) => ({
      ...f,
      household_id: id,
      // Suggest the household's registered address and map location; the recorder can change them.
      location: f.location || (h ? [h.address, h.purok].filter(Boolean).join(", ") : ""),
      latitude: h?.latitude ?? "",
      longitude: h?.longitude ?? "",
    }));
  };

  const handleSubmit = async (e, confirmNotDuplicate = false) => {
    if (e) e.preventDefault();
    setError("");
    setSuccess("");
    setDuplicate(null);
    if (!form.household_id) {
      setError("Please select the affected household.");
      return;
    }
    setLoading(true);
    try {
      const res = await createReport({
        ...form,
        household_id: Number(form.household_id),
        reported_needs: form.reported_needs.join(","),
        event_id: form.event_id || null,
        paper_form_no: form.collection_method === "Paper Form" ? form.paper_form_no : "",
        ...(confirmNotDuplicate ? { confirm_not_duplicate: true } : {}),
      });
      const reportId = res.data.report_id;
      let photoError = "";
      if (photos.length > 0) {
        try {
          const up = await uploadReportPhotos(reportId, photos);
          if (up.data.errors && up.data.errors.length > 0) {
            photoError = "The report was recorded, but some photos could not be uploaded: " + up.data.errors.join(" ");
          }
        } catch (photoErr) {
          photoError = "The report was recorded, but the photos could not be uploaded. " +
            (photoErr.response?.data?.message || "You can add them from Disaster Reports → View.");
        }
      }
      if (photoError) {
        setError(photoError);
        setSuccess(res.data.message);
      } else {
        setSuccess(res.data.message || "Disaster report recorded.");
        setTimeout(() => navigate(`${base}/reports`), 1500);
      }
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.code === "possible_duplicate") {
        setDuplicate(err.response.data.message);
      } else {
        setError(err.response?.data?.message || "We couldn't record the disaster report. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Record Disaster Report</h1>
          <p>Record what barangay staff observed or collected for a registered household — from a field visit, an interview, barangay records,
            or a paper form filled in during an outage. Residents do not need a phone or an account. The Administrator verifies the report.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to={`${base}/assessment-form`} className="btn btn-ghost">Paper form &amp; outage procedure</Link>
          <Link to={`${base}/reports`} className="btn btn-ghost">Back to Disaster Reports</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      {duplicate && (
        <div className="alert alert-warning" role="alert">
          <strong>Possible duplicate.</strong> {duplicate}
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleSubmit(null, true)}>It is a different assessment — save it</button>
            <Link to={`${base}/reports?household_id=${form.household_id}`} className="btn btn-ghost btn-sm">Open the existing report</Link>
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 640 }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="hh-search">Affected Household</label>
            <input id="hh-search" placeholder="Search by head of family, purok or address…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select name="household_id" value={form.household_id} onChange={chooseHousehold} required style={{ marginTop: 8 }} aria-label="Select household">
              <option value="">— Select a household ({filtered.length} shown) —</option>
              {filtered.map((h) => (
                <option key={h.household_id} value={h.household_id}>
                  {h.head_of_family} — {h.purok}{h.address ? `, ${h.address}` : ""}
                </option>
              ))}
            </select>
            {selected && (
              <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "6px 0 0" }}>
                {selected.number_of_members} member(s), {selected.vulnerable_members} vulnerable · contact {selected.contact_number || "—"}
              </p>
            )}
          </div>
          <fieldset className="form-group" style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "10px 12px", margin: "0 0 14px" }}>
            <legend style={{ fontWeight: 600, fontSize: 14, padding: "0 4px" }}>How this information was collected</legend>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="rr-method">Collection method</label>
                <select id="rr-method" name="collection_method" value={form.collection_method} onChange={handleChange}>
                  {COLLECTION_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="rr-event">Disaster event</label>
                <select id="rr-event" name="event_id" value={form.event_id} onChange={handleChange}>
                  <option value="">— Not linked to an event —</option>
                  {events.map((ev) => <option key={ev.event_id} value={ev.event_id}>{ev.event_name} ({ev.status})</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              {form.collection_method === "Paper Form" && (
                <div className="form-group">
                  <label htmlFor="rr-form">Paper form number (required)</label>
                  <input id="rr-form" name="paper_form_no" value={form.paper_form_no} onChange={handleChange} required maxLength={40} placeholder="e.g. P3-0012" />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="rr-assessor">Field assessor (if not you)</label>
                <input id="rr-assessor" name="field_assessor" value={form.field_assessor} onChange={handleChange} maxLength={150} placeholder="e.g. Purok 3 leader J. Cruz" />
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: 0 }}>
              Use the <strong>date of the visit or of the paper form</strong> below; the system separately records when it was encoded and by whom.
              A paper form number can be encoded only once.
            </p>
          </fieldset>
          <div className="form-row">
            <div className="form-group">
              <label>Disaster Type</label>
              <select name="disaster_type" value={form.disaster_type} onChange={handleChange}>
                {disasterTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Severity</label>
              <select name="severity" value={form.severity} onChange={handleChange}>
                {SEVERITY_LEVELS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Location of Incident</label>
            <input name="location" value={form.location} onChange={handleChange} placeholder="e.g. Purok 3, near the covered court" required maxLength={255} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Date of assessment</label>
              <input type="date" name="report_date" value={form.report_date} max={localDateISO()} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" name="report_time" value={form.report_time} onChange={handleChange} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="rr-disp">Displacement status</label>
            <select id="rr-disp" name="displacement_status" value={form.displacement_status} onChange={handleChange}>
              <option value="">— Not recorded —</option>
              {DISPLACEMENT.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <fieldset className="form-group" style={{ border: "none", padding: 0, margin: "0 0 14px" }}>
            <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Immediate needs</legend>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {REPORT_NEEDS.map((n) => (
                <label key={n} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                  <input type="checkbox" style={{ width: 16, height: 16 }} checked={form.reported_needs.includes(n)}
                    onChange={(e) => setForm((f) => ({ ...f, reported_needs: e.target.checked ? [...f.reported_needs, n] : f.reported_needs.filter((x) => x !== n) }))} />
                  {n}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="rr-lat">Incident latitude (optional)</label>
              <input id="rr-lat" name="latitude" inputMode="decimal" value={form.latitude} onChange={handleChange} placeholder="13.1554" />
            </div>
            <div className="form-group">
              <label htmlFor="rr-lng">Incident longitude (optional)</label>
              <input id="rr-lng" name="longitude" inputMode="decimal" value={form.longitude} onChange={handleChange} placeholder="123.7158" />
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "-6px 0 12px" }}>
            Pre-filled from the household's saved location; change it if the incident happened elsewhere, or clear both fields.
            Coordinates outside Barangay Binitayan are refused. A reference number (RPT-year-number) and timestamp are assigned automatically.
          </p>
          <div className="form-group">
            <label>Description / Field Observation</label>
            <textarea name="description" value={form.description} onChange={handleChange} placeholder="What happened and the damage observed…" />
          </div>
          <div className="form-group">
            <label>Photos (optional, up to {MAX_PHOTOS})</label>
            <input type="file" accept="image/*" multiple onChange={(e) => setPhotos(Array.from(e.target.files).slice(0, MAX_PHOTOS))} />
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "4px 0 0" }}>
              JPG, PNG, WebP or GIF, up to 5 MB each. More photos and the damage assessment can be added from Disaster Reports → View.
            </p>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Saving…" : "Record Report"}
          </button>
        </form>
      </div>
    </>
  );
}
