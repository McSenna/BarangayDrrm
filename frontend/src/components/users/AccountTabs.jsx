import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import "./users.css";

export default function AccountTabs({ active, counts = {} }) {
  const navRef = useRef(null);
  useEffect(() => {
    const nav = navRef.current;
    const selected = nav?.querySelector('[aria-current="page"]');
    if (!selected) return;
    const bounds = nav.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    if (item.left < bounds.left) nav.scrollLeft += item.left - bounds.left;
    else if (item.right > bounds.right) nav.scrollLeft += item.right - bounds.right;
  }, [active, counts.active, counts.requests, counts.rejected, counts.inactive, counts.total]);
  const tabs = [
    ["active", "Active users", "/admin/administrators?tab=active", counts.active],
    ["requests", "Requests", "/admin/administrators?tab=requests", counts.requests],
    ["rejected", "Rejected", "/admin/administrators?tab=rejected", counts.rejected],
    ["inactive", "Deactivated", "/admin/administrators?tab=inactive", counts.inactive],
    ["all", "All accounts", "/admin/administrators?tab=all", counts.total],
    ["households", "Household masterlist", "/admin/administrators?tab=households"],
    ["residents", "Resident masterlist", "/admin/administrators?tab=residents"],
    ["personnel", "Relief Personnel", "/admin/administrators?tab=personnel"],
    ["field_officers", "Field Officers", "/admin/administrators?tab=field_officers"],
  ];
  return <nav ref={navRef} className="users-tabs" aria-label="Users and masterlists">
    {tabs.map(([id, label, to, count]) => <Link key={id} to={to} aria-current={active === id ? "page" : undefined}>
      {label}{count !== undefined && <span>{count.toLocaleString()}</span>}
    </Link>)}
  </nav>;
}
