import { useId } from "react";
import { ChevronDown } from "lucide-react";
import NavBadge from "./NavBadge.jsx";
import NavItem from "./NavItem.jsx";

/**
 * A collapsible sidebar group (e.g. Household Priorities -> Priority
 * Assessment, Relief Recommendations). The header is a real button with
 * aria-expanded; its count badge stays visible while the group is collapsed.
 */
export default function NavGroup({ label, icon: Icon, children, badge, open, current, onToggle }) {
  const listId = useId();
  return (
    <div className={`nav-group${current ? " is-current" : ""}`}>
      <button
        type="button"
        className="nav-item nav-group-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
      >
        {Icon && <Icon className="nav-icon" aria-hidden="true" size={18} strokeWidth={1.75} />}
        <span className="nav-label">{label}</span>
        <NavBadge badge={badge} />
        <ChevronDown className="nav-chevron" aria-hidden="true" size={16} strokeWidth={2} />
      </button>
      {open && (
        <ul id={listId} className="nav-children" role="list">
          {children.map((child) => (
            <li key={child.to}>
              <NavItem {...child} nested />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
