import { Phone } from "lucide-react";
import { useSettings } from "../../context/SettingsContext.jsx";

const telHref = (number) => `tel:${String(number).replace(/[^\d+]/g, "")}`;

/** Emergency hotline pinned to the bottom of the sidebar. Number from System Settings. */
export default function HotlineCard() {
  const { settings } = useSettings();
  const number = settings.contact_phone;
  return (
    <section className="hotline" aria-labelledby="hotline-label">
      <span className="hotline-tile" aria-hidden="true">
        <Phone size={18} strokeWidth={2.25} />
      </span>
      <div className="hotline-body">
        <p id="hotline-label" className="hotline-label">Emergency Hotline</p>
        {number && (
          <a className="hotline-number" href={telHref(number)}>
            {number}
          </a>
        )}
        <p className="hotline-national">
          National: <a href="tel:911">911</a>
        </p>
      </div>
    </section>
  );
}
