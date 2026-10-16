"""Independent reference implementation of the Phase 22 weighted DSS (for tests).

Recomputes a household's five ratings and score directly from the database rows,
following the documented rules, so tests can compare it with the PHP API.
`sql` is a function that returns rows (lists of strings) for a query."""
W = {"disaster_severity": 30, "damage_unmet_needs": 25, "vulnerable_members": 20, "household_size": 15, "assessment_confidence": 10}


def category(score):
    return "Critical Priority" if score >= 80 else "High Priority" if score >= 60 else "Moderate Priority" if score >= 40 else "Low Priority"


def _ceil_div(a, b):
    return -(-a // b)


def recompute(sql, hid):
    h = sql(f"SELECT number_of_members, vulnerable_members, IFNULL(purok,''), latitude IS NOT NULL AND longitude IS NOT NULL, "
            f"(SELECT COUNT(*) FROM household_members m WHERE m.household_id=h.household_id) FROM households h WHERE household_id={hid}")[0]
    members, vuln, purok, coords, mrows = int(h[0]), int(h[1]), h[2], h[3] == "1", int(h[4])
    vuln = min(vuln, max(1, members))
    rep = sql(f"SELECT report_id, severity, status, report_date FROM disaster_reports WHERE household_id={hid} AND status<>'Rejected' "
              f"ORDER BY (status='Verified') DESC, FIELD(severity,'Critical','High','Medium','Low'), report_date DESC, report_id DESC LIMIT 1")
    if not rep:
        return None
    rid, sev, status, rdate = rep[0]
    norm = lambda p: p.replace("Purok ", "").strip().upper()
    hazard = any(a[0] == "" or norm(a[0]) == norm(purok) for a in sql("SELECT IFNULL(affected_purok,'') FROM hazard_alerts WHERE is_active=1"))
    S = min(5, {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}[sev] + (1 if hazard else 0))
    da = sql(f"SELECT house_damage, infrastructure_damage, property_damage, agricultural_damage FROM damage_assessments WHERE report_id={rid}")
    if da:
        house, *others = da[0]
        lvl = 5 if house == "Totally Damaged" else 4 if house == "Major" or "Totally Damaged" in others else 3 if "Major" in others \
            else 2 if house == "Minor" or "Minor" in others else 1
    else:
        lvl = 3
    got = {c: int(q) for c, q in sql(
        f"SELECT i.category, SUM(a.quantity) FROM relief_allocations a JOIN relief_items i ON i.item_id=a.item_id "
        f"WHERE a.household_id={hid} AND a.status IN ('Approved','Distributed') AND a.allocation_date >= '{rdate}' GROUP BY i.category")}
    inv = [c[0] for c in sql("SELECT DISTINCT category FROM relief_items")]
    need = {"Food": _ceil_div(max(1, members), 2), "Water": 3 * max(1, members), "Hygiene": 1, "Shelter": _ceil_div(max(1, members), 3), "Medical": 1 if vuln > 0 else 0}
    ratios = [min(1, got.get(c, 0) / n) for c, n in need.items() if c in inv and n > 0]
    cov = sum(ratios) / len(ratios) if ratios else 0
    D = max(1, lvl - (2 if cov >= 0.999 else 1 if cov >= 0.5 else 0))
    V = min(5, vuln + 1)
    H = 5 if members >= 8 else 4 if members >= 6 else 3 if members >= 4 else 2 if members >= 2 else 1
    complete = members >= 1 and coords and mrows == members
    ver = status == "Verified"
    C = (5 if complete else 4) if ver and da else 3 if ver else 2 if da else 1
    ratings = {"disaster_severity": S, "damage_unmet_needs": D, "vulnerable_members": V, "household_size": H, "assessment_confidence": C}
    score = sum(r / 5 * W[k] for k, r in ratings.items())
    return ratings, score, category(score)
