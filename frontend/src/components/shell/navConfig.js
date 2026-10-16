import {
  ClipboardList,
  FileText,
  House,
  LayoutDashboard,
  ListOrdered,
  MessageSquareText,
  Package,
  Settings,
  Bell,
  TriangleAlert,
  Truck,
} from "lucide-react";

const n = (v) => Number(v || 0);
const count = (obj, key) => n(obj?.[key]);

const pending = (value) => (value > 0 ? { kind: "pending", value } : null);

export const ADMIN_NAV = [
  {
    label: "Overview",
    items: [{ to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Operations",
    items: [
      {
        key: "reports",
        label: "Disaster Reports",
        icon: FileText,
        badge: ({ stats }) => pending(count(stats?.workflow?.reports_by_status, "Pending")),
        children: [
          { to: "/admin/reports", label: "All Reports" },
          { to: "/admin/disaster-events", label: "Disaster Events" },
          { to: "/admin/analytics/situation-report", label: "Situation Report" },
          { to: "/admin/assessment-form", label: "Paper Assessment Form" },
        ],
        also: ["/admin/reports/new"],
      },
      {
        key: "priorities",
        label: "Household Priorities",
        icon: ListOrdered,
        badge: ({ stats }) => pending(n(stats?.workflow?.dss_needs_review)),
        children: [
          { to: "/admin/priority", label: "Priority Assessment" },
          { to: "/admin/recommendations", label: "Relief Recommendations" },
        ],
      },
      {
        key: "hazards",
        label: "Hazards & Map",
        icon: TriangleAlert,
        badge: ({ hazard, stats }) => {
          const active = (hazard?.active_alerts ?? stats?.workflow?.active_alerts ?? []).length;
          return active > 0 ? { kind: "critical", value: active } : null;
        },
        children: [
          { to: "/admin/monitoring", label: "Hazard Monitoring" },
          { to: "/admin/map", label: "Barangay Map" },
          { to: "/admin/hazard-alerts", label: "Hazard Alerts" },
          { to: "/admin/affected-areas", label: "Flood & Affected Areas" },
          { to: "/admin/evacuation-centers", label: "Evacuation Centers" },
        ],
      },
      {
        key: "relief",
        label: "Relief Allocation",
        icon: Package,
        badge: ({ stats }) => pending(count(stats?.workflow?.allocations_by_status, "Pending")),
        children: [
          { to: "/admin/allocations", label: "Relief Allocations" },
          { to: "/admin/relief-requests", label: "Relief Requests" },
          { to: "/admin/inventory", label: "Inventory" },
        ],
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        to: "/admin/sms-logs",
        label: "SMS Notifications",
        icon: MessageSquareText,
        // Manual messages are reached from SMS Logs (Phase 23).
        also: ["/admin/send-sms"],
        badge: ({ stats }) => (stats && !stats.workflow?.sms?.configured ? { kind: "off" } : null),
      },
      {
        key: "administration",
        label: "Administration",
        icon: Settings,
        children: [
          { to: "/admin/households", label: "Households" },
          { to: "/admin/residents", label: "Residents" },
          { to: "/admin/personnel", label: "Relief Personnel" },
          { to: "/admin/administrators", label: "Administrators" },
          { to: "/admin/audit-logs", label: "Audit Log" },
          { to: "/admin/system-settings", label: "System Settings" },
        ],
        also: ["/admin/login-history", "/admin/inventory-settings", "/admin/disaster-settings", "/admin/purok-cleanup"],
      },
    ],
  },
];

const unreadBadge = ({ unread }) => (unread > 0 ? { kind: "pending", value: unread } : null);

export const PERSONNEL_NAV = [
  {
    label: "Overview",
    items: [{ to: "/personnel", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "Operations",
    items: [
      {
        key: "reports",
        label: "Disaster Reports",
        icon: FileText,
        children: [
          { to: "/personnel/reports", label: "All Reports" },
          { to: "/personnel/assessment-form", label: "Paper Assessment Form" },
        ],
        also: ["/personnel/reports/new"],
      },
      { to: "/personnel/priority", label: "Priority Assessment", icon: ListOrdered },
      {
        key: "hazards",
        label: "Hazards & Map",
        icon: TriangleAlert,
        badge: ({ hazard }) => {
          const active = (hazard?.active_alerts || []).length;
          return active > 0 ? { kind: "critical", value: active } : null;
        },
        children: [
          { to: "/personnel/monitoring", label: "Hazard Monitoring" },
          { to: "/personnel/map", label: "Barangay Map" },
        ],
      },
      { to: "/personnel/assigned", label: "Relief Allocations", icon: Truck },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/personnel/notifications", label: "Notifications", icon: Bell, badge: unreadBadge }],
  },
];

export const RESIDENT_NAV = [
  {
    label: "Overview",
    items: [{ to: "/resident", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    label: "My Relief",
    items: [
      { to: "/resident/relief-status", label: "Relief Allocation Status", icon: ClipboardList },
      { to: "/resident/household", label: "My Household", icon: House },
    ],
  },
  {
    label: "Account",
    items: [{ to: "/resident/notifications", label: "Notifications", icon: Bell, badge: unreadBadge }],
  },
];

export const NAV_BY_ROLE = {
  admin: ADMIN_NAV,
  relief_personnel: PERSONNEL_NAV,
  resident: RESIDENT_NAV,
};

/** Per-role pages linked from the header (bell, user menu, status chip). */
export const ROLE_LINKS = {
  admin: { home: "/admin", profile: "/admin/my-profile", monitoring: "/admin/monitoring", map: "/admin/map", notifications: null },
  relief_personnel: { home: "/personnel", profile: "/personnel/my-profile", monitoring: "/personnel/monitoring", map: "/personnel/map", notifications: "/personnel/notifications" },
  resident: { home: "/resident", profile: "/resident/my-profile", monitoring: null, map: null, notifications: "/resident/notifications" },
};

export const ROLE_LABEL = {
  admin: "Administrator",
  resident: "Resident",
  relief_personnel: "Relief Personnel",
};

/** Does `pathname` belong to this link (exact, or a sub-page when not `end`)? */
export function matchesPath(pathname, to, end = false) {
  if (pathname === to) return true;
  return !end && pathname.startsWith(`${to}/`);
}

/** Is the current page inside this nav item (link, any child, or an `also` page)? */
export function itemContainsPath(item, pathname) {
  if (item.to && matchesPath(pathname, item.to, item.end)) return true;
  if ((item.also || []).some((p) => matchesPath(pathname, p))) return true;
  return (item.children || []).some((c) => matchesPath(pathname, c.to, c.end));
}
