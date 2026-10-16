import { useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import StatusBadge from "../ui/StatusBadge.jsx";
import { purokLabel } from "../../utils/purokLabel.js";
import { bucketLabel } from "./ReportsChart.jsx";

const SEVERITY_RANK = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const shortDate = (iso) => (iso ? bucketLabel(String(iso).slice(0, 10), "day") : "—");

function NewMarker() {
  return (
    <span className="new-marker">
      <span className="new-dot" aria-hidden="true" />
      <span className="sr-only">New since your last visit. </span>
    </span>
  );
}

/* ---------- Tab definitions: columns, filters and links per queue ---------- */

const TABS = {
  reports: {
    label: "Reports to verify",
    kind: "reports",
    idKey: "report_id",
    empty: "No reports are waiting for verification in this view.",
    search: (r) => `${r.reference_no} ${r.head_of_family || ""} ${r.location || ""} ${r.disaster_type}`,
    filter: { key: "severity", label: "Severity", options: ["Critical", "High", "Medium", "Low"], match: (r, v) => r.severity === v },
    defaultSort: { key: "severity", dir: "desc" },
    href: (r) => (r.household_id ? `/admin/reports?household_id=${r.household_id}` : "/admin/reports"),
    action: "Verify",
    columns: [
      { key: "ref", label: "Ref.", render: (r, isNew) => <span className="queue-ref">{isNew && <NewMarker />}{r.reference_no}</span> },
      { key: "household", label: "Household", render: (r) => r.head_of_family || <span className="queue-muted">{r.location}</span>, sort: (r) => r.head_of_family || r.location || "" },
      { key: "purok", label: "Purok", render: (r) => (r.purok ? purokLabel(r.purok) : "—"), sort: (r) => r.purok || "" },
      { key: "type", label: "Type", render: (r) => r.disaster_type, sort: (r) => r.disaster_type },
      { key: "severity", label: "Severity", render: (r) => <StatusBadge status={r.severity} />, sort: (r) => SEVERITY_RANK[r.severity] || 0 },
      { key: "date", label: "Reported", render: (r) => shortDate(r.report_date), sort: (r) => r.report_date },
    ],
  },
  priorities: {
    label: "Priority households",
    kind: null,
    idKey: "household_id",
    empty: "No Critical or High priority households in this view.",
    search: (r) => `${r.head_of_family} ${r.purok}`,
    filter: {
      key: "level",
      label: "Priority",
      options: ["Critical Priority", "High Priority", "Needs manual review"],
      match: (r, v) => (v === "Needs manual review" ? r.needs_review : r.priority_level === v),
    },
    defaultSort: { key: "rank", dir: "asc" },
    href: () => "/admin/priority",
    action: "Review",
    columns: [
      { key: "rank", label: "Rank", render: (r) => <strong className="queue-rank">#{r.rank}</strong>, sort: (r) => r.rank ?? 9999 },
      { key: "household", label: "Household", render: (r) => r.head_of_family, sort: (r) => r.head_of_family },
      { key: "purok", label: "Purok", render: (r) => purokLabel(r.purok), sort: (r) => r.purok || "" },
      { key: "score", label: "Score", render: (r) => <strong>{r.priority_score}</strong>, sort: (r) => r.priority_score ?? 0 },
      {
        key: "level",
        label: "Priority",
        render: (r) => (
          <span className="queue-badges">
            <StatusBadge status={r.priority_level} />
            {r.needs_review && <StatusBadge tone="warning">Needs review</StatusBadge>}
          </span>
        ),
        sort: (r) => (r.priority_level === "Critical Priority" ? 2 : 1),
      },
      { key: "relief", label: "Relief", render: (r) => r.current_relief_status, sort: (r) => r.current_relief_status },
    ],
  },
  allocations: {
    label: "Allocations",
    kind: "allocations",
    idKey: "allocation_id",
    empty: "No pending or approved allocations in this view.",
    search: (r) => `${r.head_of_family} ${r.item_name} ${r.purok}`,
    filter: {
      key: "stage",
      label: "Stage",
      options: ["Pending", "Approved", "Ready for Distribution"],
      match: (r, v) => stageOf(r) === v,
    },
    defaultSort: { key: "stage", dir: "asc" },
    href: () => "/admin/allocations",
    action: "Open",
    columns: [
      { key: "household", label: "Household", render: (r, isNew) => <span className="queue-ref">{isNew && <NewMarker />}{r.head_of_family}</span>, sort: (r) => r.head_of_family },
      { key: "item", label: "Item", render: (r) => `${r.item_name} · ${r.quantity} ${r.unit || ""}`.trim(), sort: (r) => r.item_name },
      { key: "purok", label: "Purok", render: (r) => purokLabel(r.purok), sort: (r) => r.purok || "" },
      {
        key: "stage",
        label: "Stage",
        render: (r) => (
          <span className="queue-badges">
            <StatusBadge status={stageOf(r)} />
            {r.is_emergency_override && <StatusBadge tone="high">Override</StatusBadge>}
          </span>
        ),
        sort: (r) => ["Pending", "Approved", "Ready for Distribution"].indexOf(stageOf(r)),
      },
      { key: "date", label: "Allocated", render: (r) => shortDate(r.allocation_date), sort: (r) => r.allocation_date },
    ],
  },
};
const TAB_ORDER = ["reports", "priorities", "allocations"];

function stageOf(r) {
  if (r.status === "Approved" && r.is_ready) return "Ready for Distribution";
  return r.status;
}

/* ---------- Component ---------- */

/**
 * Tabbed work queue: what needs a decision, scoped by the dashboard filters.
 * Each tab has its own search, one dropdown filter and sortable columns.
 * Under 640px the rows become stacked cards (labels from data-label).
 */
export default function WorkQueue({ queue, markers }) {
  const baseId = useId();
  const [tab, setTab] = useState("reports");
  const [search, setSearch] = useState("");
  const [choice, setChoice] = useState("");
  const [sort, setSort] = useState(TABS.reports.defaultSort);
  const tabRefs = useRef({});

  const def = TABS[tab];
  const rows = queue?.[tab] || [];
  const newCount = (key) =>
    TABS[key].kind ? (queue?.[key] || []).filter((r) => markers.isNew(TABS[key].kind, r[TABS[key].idKey])).length : 0;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const col = def.columns.find((c) => c.key === sort.key) || def.columns.find((c) => c.sort);
    const filtered = rows.filter(
      (r) => (!q || def.search(r).toLowerCase().includes(q)) && (!choice || def.filter.match(r, choice))
    );
    if (!col?.sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = col.sort(a);
      const y = col.sort(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, search, choice, sort, def]);

  const selectTab = (key, focus = false) => {
    setTab(key);
    setSearch("");
    setChoice("");
    setSort(TABS[key].defaultSort);
    if (focus) tabRefs.current[key]?.focus();
  };
  const onTabKey = (e) => {
    const i = TAB_ORDER.indexOf(tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TAB_ORDER.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(TAB_ORDER[(next + TAB_ORDER.length) % TAB_ORDER.length], true);
  };
  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" || key === "severity" || key === "score" ? "desc" : "asc" }));

  const anyNew = TAB_ORDER.some((k) => newCount(k) > 0);

  return (
    <section className="queue card" aria-labelledby={`${baseId}-title`}>
      <div className="queue-head">
        <h2 id={`${baseId}-title`} className="section-title">Work queue</h2>
        {anyNew && (
          <button type="button" className="btn btn-text queue-seen" onClick={markers.markAllSeen}>
            Mark all as seen
          </button>
        )}
      </div>

      <div className="queue-tabs" role="tablist" aria-label="Work queue" onKeyDown={onTabKey}>
        {TAB_ORDER.map((key) => {
          const count = (queue?.[key] || []).length;
          const fresh = newCount(key);
          return (
            <button
              key={key}
              ref={(el) => { tabRefs.current[key] = el; }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${key}`}
              aria-controls={`${baseId}-panel`}
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              className="queue-tab"
              onClick={() => selectTab(key)}
            >
              {TABS[key].label}
              <span className="queue-count">{count}</span>
              {fresh > 0 && <span className="queue-new">{fresh} new</span>}
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`}>
        <div className="queue-tools">
          <label className="queue-search">
            <Search aria-hidden="true" size={16} strokeWidth={2} />
            <span className="sr-only">Search {def.label.toLowerCase()}</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search household or ref." />
          </label>
          <label className="queue-filter">
            <span className="sr-only">{def.filter.label}</span>
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{def.filter.label}: All</option>
              {def.filter.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <p className="queue-status" aria-live="polite">
            {visible.length === rows.length ? `${rows.length} shown` : `${visible.length} of ${rows.length} shown`}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="empty-state queue-empty">
            {rows.length === 0 ? def.empty : "Nothing matches this search or filter."}
          </div>
        ) : (
          <div className="table-wrap queue-scroll" tabIndex={0} role="region" aria-label={`${def.label} table`}>
            <table className="queue-table">
              <thead>
                <tr>
                  {def.columns.map((c) => {
                    const active = sort.key === c.key;
                    const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                    return (
                      <th key={c.key} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                        {c.sort ? (
                          <button type="button" className="th-sort" onClick={() => toggleSort(c.key)}>
                            {c.label}
                            <Icon aria-hidden="true" size={13} strokeWidth={2.25} className={active ? "" : "th-sort-idle"} />
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    );
                  })}
                  <th scope="col"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const id = r[def.idKey];
                  const isNew = def.kind ? markers.isNew(def.kind, id) : false;
                  return (
                    <tr key={id} className={isNew ? "is-new" : undefined}>
                      {def.columns.map((c) => (
                        <td key={c.key} data-label={c.label}>{c.render(r, isNew)}</td>
                      ))}
                      <td className="queue-action">
                        <Link
                          to={def.href(r)}
                          className="btn btn-ghost btn-sm"
                          onClick={() => def.kind && markers.markOpened(def.kind, id)}
                        >
                          {def.action}
                          <span className="sr-only"> {r.reference_no || r.head_of_family}</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
