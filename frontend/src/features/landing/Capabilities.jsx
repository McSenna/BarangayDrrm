import { FileText, Package, Scale } from "lucide-react";
import IconTile from "../../components/ui/IconTile.jsx";

// Copy matches what the system does: since Phase 21 only barangay officials
// and relief personnel record incidents (residents cannot file reports).
const CAPABILITIES = [
  {
    icon: FileText,
    title: "Disaster reporting",
    body: "Barangay officials and relief personnel record incidents and conduct household assessments for a faster, verified response.",
  },
  {
    icon: Package,
    title: "Relief inventory",
    body: "Track relief supplies, monitor stock levels, and get alerts for low-stock items so distribution stays on time.",
  },
  {
    icon: Scale,
    title: "Explainable relief allocation",
    body: "Transparent priority scoring based on verified needs and available resources, with final decisions made by authorized personnel.",
  },
];

export function CapabilityCard({ number, icon, title, body }) {
  return (
    <li className="cap-card">
      <div className="cap-card-top">
        <IconTile icon={icon} tone="navy" size="lg" />
        <span className="cap-num">{String(number).padStart(2, "0")}</span>
      </div>
      <h3 className="cap-title">{title}</h3>
      <p className="cap-body">{body}</p>
    </li>
  );
}

export default function Capabilities() {
  return (
    <section className="lp-section" aria-labelledby="cap-title">
      <p className="lp-eyebrow lp-eyebrow-orange">What the system does</p>
      <h2 id="cap-title" className="lp-h2">One system. Three essential capabilities.</h2>
      <ul className="cap-grid" role="list">
        {CAPABILITIES.map((c, i) => <CapabilityCard key={c.title} number={i + 1} {...c} />)}
      </ul>
    </section>
  );
}
