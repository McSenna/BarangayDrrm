import { localDateISO } from "./dates.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Tries to load /logo.png as a data URL for embedding in the PDF header; resolves null if it doesn't exist. */
function loadLogoDataUrl() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = "/logo.png";
  });
}

/** Adds the standard barangay header to a page and returns the Y position to start content at. */
async function addHeader(doc, title, subtitle) {
  const logo = await loadLogoDataUrl();
  const textX = logo ? 36 : 14;

  if (logo) {
    try { doc.addImage(logo, "PNG", 14, 10, 18, 18); } catch { /* ignore malformed logo */ }
  }

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("Barangay Binitayan, Daraga, Albay", textX, 18);

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  doc.text(title, textX, 25);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(subtitle || `Generated ${new Date().toLocaleString()}`, textX, 31);
  doc.setTextColor(0);

  doc.setDrawColor(220);
  doc.line(14, 36, 196, 36);

  return 44;
}

/**
 * Phase 19 — "Rule-Based Summary" paragraph (template sentences generated
 * from the report's own figures by utils/narratives.js). Not AI/NLG.
 */
function addSummary(doc, lines, y) {
  if (!lines || lines.length === 0) return y;
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text("Rule-Based Summary", 14, y);
  doc.setFont(undefined, "normal");
  doc.setFontSize(9.5);
  const wrapped = doc.splitTextToSize(lines.join(" "), 182);
  doc.text(wrapped, 14, y + 6);
  let next = y + 6 + wrapped.length * 4.6;
  doc.setFontSize(7.5);
  doc.setTextColor(120);
  doc.text("Generated automatically from the figures in this report using fixed sentence rules.", 14, next + 1);
  doc.setTextColor(0);
  return next + 9;
}

function addSectionTitle(doc, text, y) {
  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text(text, 14, y);
  doc.setFont(undefined, "normal");
  return y + 6;
}

function addTable(doc, head, body, startY) {
  autoTable(doc, {
    head: [head],
    body,
    startY,
    styles: { fontSize: 8.5, cellPadding: 3 },
    headStyles: { fillColor: [55, 65, 81] }, // matches the app's primary gray
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY + 10;
}

// ---------------------------------------------------------------
// Disaster Report PDF
// ---------------------------------------------------------------
export async function generateDisasterReportPDF(data, filters = {}, summaryLines = []) {
  const doc = new jsPDF();
  const filterText = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ");
  let y = await addHeader(doc, "Disaster Report Summary", filterText || undefined);
  y = addSummary(doc, summaryLines, y);

  doc.setFontSize(10);
  doc.text(`Total Reports: ${data.total_reports}`, 14, y);
  y += 10;

  y = addSectionTitle(doc, "By Disaster Type", y);
  y = addTable(doc, ["Disaster Type", "Count"], data.by_type.map((r) => [r.label, r.count]), y);

  y = addSectionTitle(doc, "By Severity", y);
  y = addTable(doc, ["Severity", "Count"], data.by_severity.map((r) => [r.label, r.count]), y);

  y = addSectionTitle(doc, "By Purok", y);
  y = addTable(doc, ["Purok", "Count"], data.by_purok.map((r) => [r.label, r.count]), y);

  if (y > 240) { doc.addPage(); y = 20; }
  y = addSectionTitle(doc, "By Month", y);
  addTable(doc, ["Month", "Count"], data.by_month.map((r) => [r.label, r.count]), y);

  doc.save(`disaster-reports-summary-${dateStamp()}.pdf`);
}

// ---------------------------------------------------------------
// Household Report PDF
// ---------------------------------------------------------------
export async function generateHouseholdReportPDF(data, summaryLines = []) {
  const doc = new jsPDF();
  let y = await addHeader(doc, "Household Report");
  y = addSummary(doc, summaryLines, y);

  doc.setFontSize(10);
  doc.text(`Total Households: ${data.total_households}    Total Population: ${data.total_population}`, 14, y);
  y += 6;
  doc.text(`Vulnerable Households: ${data.vulnerable_household_count}    High and Critical Priority Households: ${data.high_priority_count}`, 14, y);
  y += 10;

  y = addSectionTitle(doc, "Population per Purok", y);
  y = addTable(doc, ["Purok", "Households", "Population"], data.population_per_purok.map((r) => [r.label, r.household_count, r.population]), y);

  const vb = data.vulnerability_breakdown;
  y = addSectionTitle(doc, "Vulnerability Breakdown (Barangay-wide)", y);
  y = addTable(doc, ["Category", "Count"], [
    ["Children", vb.children], ["Senior Citizens", vb.seniors], ["Persons with Disabilities", vb.pwd],
    ["Pregnant Members", vb.pregnant], ["Members with Medical Needs", vb.medical_needs], ["Other", vb.other],
  ], y);

  if (y > 220) { doc.addPage(); y = 20; }
  y = addSectionTitle(doc, `High and Critical Priority Households (${data.high_priority_count})`, y);
  addTable(doc, ["Household Head", "Purok", "Household Members", "Vulnerable Members", "Priority Score", "Priority Level"],
    data.high_priority_households.map((h) => [h.head_of_family, h.purok, h.number_of_members, h.vulnerable_members, h.priority_score, h.priority_level]), y);

  doc.save(`household-report-${dateStamp()}.pdf`);
}

// ---------------------------------------------------------------
// Inventory Report PDF
// ---------------------------------------------------------------
export async function generateInventoryReportPDF(data, filters = {}, summaryLines = []) {
  const doc = new jsPDF();
  const filterText = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ");
  let y = await addHeader(doc, "Inventory Report", filterText || undefined);
  y = addSummary(doc, summaryLines, y);

  doc.setFontSize(10);
  doc.text(`Total Stock In: ${data.total_stock_in}    Total Stock Out: ${data.total_stock_out}    Total Donated: ${data.total_donated}`, 14, y);
  y += 10;

  y = addSectionTitle(doc, "Current Inventory", y);
  y = addTable(doc, ["Item", "Category", "Quantity", "Minimum Level", "Status"],
    data.current_inventory.map((i) => [i.item_name, i.category, `${i.quantity} ${i.unit}`, i.minimum_level, i.low_stock ? "Low Stock" : "Sufficient"]), y);

  if (y > 220) { doc.addPage(); y = 20; }
  y = addSectionTitle(doc, "Stock In Report", y);
  y = data.stock_in_report.length
    ? addTable(doc, ["Item", "Total In", "Transactions"], data.stock_in_report.map((r) => [r.item_name, `${r.total_in} ${r.unit}`, r.transaction_count]), y)
    : addNoDataLine(doc, y);

  if (y > 220) { doc.addPage(); y = 20; }
  y = addSectionTitle(doc, "Stock Out Report", y);
  y = data.stock_out_report.length
    ? addTable(doc, ["Item", "Total Out", "Transactions"], data.stock_out_report.map((r) => [r.item_name, `${r.total_out} ${r.unit}`, r.transaction_count]), y)
    : addNoDataLine(doc, y);

  if (y > 220) { doc.addPage(); y = 20; }
  y = addSectionTitle(doc, "Donation Report", y);
  y = data.donation_report.length
    ? addTable(doc, ["Item", "Total Donated", "Donations", "Donors"], data.donation_report.map((r) => [r.item_name, `${r.total_donated} ${r.unit}`, r.donation_count, r.donors]), y)
    : addNoDataLine(doc, y);

  if (y > 220) { doc.addPage(); y = 20; }
  y = addSectionTitle(doc, "Low Stock Report", y);
  data.low_stock_report.length
    ? addTable(doc, ["Item", "Category", "Quantity", "Min. Level"], data.low_stock_report.map((i) => [i.item_name, i.category, `${i.quantity} ${i.unit}`, i.minimum_level]), y)
    : addNoDataLine(doc, y);

  doc.save(`inventory-report-${dateStamp()}.pdf`);
}

// ---------------------------------------------------------------
// Relief Distribution PDF
// ---------------------------------------------------------------
export async function generateReliefDistributionPDF(data, filters = {}, summaryLines = []) {
  const doc = new jsPDF();
  const filterText = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ");
  let y = await addHeader(doc, "Relief Distribution Report", filterText || undefined);
  y = addSummary(doc, summaryLines, y);

  doc.setFontSize(10);
  doc.text(`Households Served: ${data.total_beneficiaries}    Total Units Distributed: ${data.total_distributed_items}`, 14, y);
  y += 10;

  y = addSectionTitle(doc, "Distribution by Purok", y);
  y = addTable(doc, ["Purok", "Households", "Items"], data.distribution_by_purok.map((r) => [r.label, r.household_count, r.item_count]), y);

  if (y > 220) { doc.addPage(); y = 20; }
  y = addSectionTitle(doc, "Distribution by Item", y);
  y = addTable(doc, ["Item", "Category", "Quantity"], data.distribution_by_item.map((r) => [r.label, r.category, r.quantity]), y);

  if (y > 200) { doc.addPage(); y = 20; }
  y = addSectionTitle(doc, "Distribution History", y);
  addTable(doc, ["Household Head", "Purok", "Relief Item", "Quantity", "Date Distributed", "Distributed By"],
    data.distribution_history.map((r) => [r.head_of_family, r.purok, r.item_name, `${r.quantity} ${r.unit}`, r.distributed_at, r.distributed_by_name || "—"]), y);

  doc.save(`relief-distribution-report-${dateStamp()}.pdf`);
}

function addNoDataLine(doc, y) {
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text("No records for the selected period.", 14, y);
  doc.setTextColor(0);
  return y + 10;
}

function dateStamp() {
  return localDateISO();
}

// ---------------------------------------------------------------
// Phase 20 — Automated Disaster Situation Report PDF
// Uses the same header / section / table helpers as the other reports.
// ---------------------------------------------------------------
const NA_TEXT = "Not available in recorded data";
const na = (v) => (v === null || v === undefined ? NA_TEXT : v);
const kv = (obj) => Object.entries(obj || {}).map(([k, v]) => [k, v]);

export async function generateSituationReportPDF(d) {
  const doc = new jsPDF();
  const title = d.disaster.event_name ? `Disaster Situation Report — ${d.disaster.event_name}` : "Disaster Situation Report";
  let y = await addHeader(doc, title, `Generated automatically ${d.generated_at} · Reports ${d.scope.report_period.from} to ${d.scope.report_period.to}`);
  const ensure = (need = 30) => { if (y > 280 - need) { doc.addPage(); y = 20; } };
  const section = (t) => { ensure(); y = addSectionTitle(doc, t, y); };
  const note = (text) => {
    if (!text) return;
    ensure(12);
    doc.setFontSize(8); doc.setTextColor(110);
    const w = doc.splitTextToSize(text, 182); doc.text(w, 14, y); y += w.length * 3.6 + 3;
    doc.setTextColor(0);
  };

  // 1. Executive summary
  doc.setFontSize(11); doc.setFont(undefined, "bold"); doc.text("1. Executive Summary", 14, y); doc.setFont(undefined, "normal");
  doc.setFontSize(9.5);
  const sum = doc.splitTextToSize((d.executive_summary || []).join(" ") || NA_TEXT, 182);
  doc.text(sum, 14, y + 6); y += 6 + sum.length * 4.6 + 2;
  note("Generated automatically from the system database using fixed sentence rules (not AI).");

  section("2. Disaster Overview");
  y = addTable(doc, ["Item", "Value"], [
    ["Disaster / event", na(d.disaster.event_name)], ["Disaster type", na(d.disaster.disaster_type)],
    ["Period", `${d.disaster.start_date} to ${d.disaster.end_date || "ongoing"}`], ["Affected barangay", d.disaster.affected_barangay],
    ["Highest recorded severity", na(d.disaster.highest_severity)], ["Disaster types reported", d.disaster.disaster_types_reported.join(", ") || NA_TEXT],
    ["Description", na(d.disaster.description)],
    ["Reports (total / verified / pending / rejected)", `${d.reports.total} / ${d.reports.by_status.Verified} / ${d.reports.by_status.Pending} / ${d.reports.by_status.Rejected}`],
    ["Reports by severity", Object.entries(d.reports.by_severity).map(([k, v]) => `${k} ${v}`).join(", ")],
  ], y);

  section("3. Affected Area Summary");
  y = addTable(doc, ["Recorded area", "Hazard", "Status", "Households inside"],
    d.affected_areas.list.length ? d.affected_areas.list.map((a) => [a.area_name, a.hazard_type, a.status, a.households_inside]) : [[NA_TEXT, "", "", ""]], y);
  note(d.affected_areas.note);

  section("4. Household Impact");
  y = addTable(doc, ["Measure", "Value"], [
    ["Total affected households", d.households.total_affected], ["With a disaster report", d.households.reported_affected],
    ["Inside recorded affected areas", d.households.inside_recorded_areas], ["Persons in affected households", d.households.persons],
    ["Households with vulnerable members", d.households.vulnerable_households], ["Vulnerable persons", d.households.vulnerable_persons],
    ["Affected puroks", d.households.affected_puroks.join(", ") || NA_TEXT],
    ...kv(d.households.by_purok).map(([k, v]) => [`  ${k}`, v]),
  ], y);
  note(d.households.note);

  section("5. Damage Assessment Summary");
  y = addTable(doc, ["Category", "None", "Minor", "Major", "Totally Damaged"],
    Object.entries(d.damage.by_category).map(([k, v]) => [k, v.None, v.Minor, v.Major, v["Totally Damaged"]]), y);
  note(`Assessed reports: ${d.damage.assessed_reports}; with major damage: ${d.damage.with_major_damage}; with totally damaged: ${d.damage.with_totally_damaged}. ${d.damage.note}`);

  section("6. Evacuation Center Summary");
  y = addTable(doc, ["Center", "Purok", "Status", "Occupancy / Capacity"],
    d.evacuation.list.length ? d.evacuation.list.map((c) => [c.name, c.purok, c.status, `${c.occupancy} / ${c.capacity}`]) : [[NA_TEXT, "", "", ""]], y);
  note(`Persons in centers: ${d.evacuation.current_occupancy_persons}; available capacity in open centers: ${d.evacuation.available_capacity_open_centers}. Evacuated households: ${d.evacuation.evacuated_households_note}`);

  section("7. Relief Request Summary");
  y = addTable(doc, ["Status", "Count"], kv(d.requests.by_status), y);
  note(`Urgency: ${Object.entries(d.requests.by_urgency).map(([k, v]) => `${k} ${v}`).join(", ")}. ${d.requests.note}`);

  section("8. Inventory and Shortage Summary");
  y = addTable(doc, ["Item", "Stock", "Reserved", "Available", "Open demand", "Shortage", "Low"],
    d.inventory.list.map((i) => [i.item_name, i.stock, i.reserved, i.available, i.open_request_demand, i.shortage, i.low_stock ? "Yes" : ""]), y);
  note(d.inventory.note);

  section("9. Relief Allocation Summary");
  y = addTable(doc, ["Status", "Allocations", "Total quantity"], Object.entries(d.allocations.by_status).map(([k, v]) => [k, v.count, v.quantity]), y);
  note(d.allocations.note);
  if (d.allocations.emergency_overrides && d.allocations.emergency_overrides.length) {
    y = addTable(doc, ["Override date", "Household", "Relief", "DSS at override", "Reason"],
      d.allocations.emergency_overrides.map((o) => [o.date, o.household, o.item, o.dss_at_override, o.reason]), y);
  }

  section("10. Distribution Summary");
  y = addTable(doc, ["Measure", "Value"], [
    ["Distribution schedules", d.distribution.schedules], ["Upcoming schedules", d.distribution.upcoming_schedules ?? 0],
    ...kv(d.distribution.beneficiaries_by_status).map(([k, v]) => [`Scheduled beneficiaries — ${k}`, v]),
    ["Allocations distributed directly", d.distribution.direct_allocations_distributed], ["Households served", d.distribution.households_served],
    ["Approved allocations awaiting distribution", d.distribution.approved_awaiting_distribution],
    ["of which Ready for Distribution (verified schedule set)", d.distribution.ready_for_distribution ?? "Not available in recorded data"],
  ], y);
  note(d.distribution.note);

  section("11. SMS Notification Summary");
  y = addTable(doc, ["Measure", "Value"], [
    ["Total", d.sms.total], ["Accepted by gateway (delivery not confirmed)", d.sms.sent], ["Queued", d.sms.queued ?? 0], ["Failed", d.sms.failed],
    ["Not sent — SMS disabled", d.sms.not_sent_disabled], ["Automatic / manual", `${d.sms.automatic} / ${d.sms.manual}`], ["Pending", d.sms.pending_note],
  ], y);
  note(d.sms.note);

  section("12–13. Generated and Data Sources");
  note(`Generated: ${d.generated_at}.`);
  (d.data_sources || []).forEach((t) => note(t));

  doc.save(`situation-report-${dateStamp()}.pdf`);
}
