import { Phone } from "lucide-react";
import { useSettings } from "../../context/SettingsContext.jsx";

const telHref = (n) => `tel:${String(n).replace(/[^\d+]/g, "")}`;

/** "Emergency? Don't wait to log in." — the barangay hotline (System Settings › contact phone) and 911. */
export default function EmergencyNote() {
  const { settings } = useSettings();
  const hotline = settings?.contact_phone;
  return (
    <aside className="lf-emergency" aria-label="Emergency numbers">
      <span className="lf-emergency-tile" aria-hidden="true"><Phone size={18} strokeWidth={2.25} /></span>
      <div>
        <p className="lf-emergency-title">Emergency? Don't wait to log in.</p>
        <p className="lf-emergency-text">
          Call {hotline ? <><a href={telHref(hotline)}>{hotline}</a> or </> : null}<a href="tel:911">911</a>.
        </p>
      </div>
    </aside>
  );
}
