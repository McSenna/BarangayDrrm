/** Household damage classification chosen by the assigned Field Officer. Points come from the server (scoring method). */
export const DAMAGE_CLASSIFICATIONS = [
  { value: 'Destroyed', label: 'Destroyed / uninhabitable' },
  { value: 'Severely Damaged', label: 'Severely damaged' },
  { value: 'Partially Damaged', label: 'Partially damaged' },
  { value: 'Minor Damage', label: 'Minor damage' },
  { value: 'No Damage', label: 'No damage' },
];
const DAMAGE_LABEL = Object.fromEntries(DAMAGE_CLASSIFICATIONS.map((d) => [d.value, d.label]));
/** Other damage noted during the visit (recorded, not scored). */
export const NOTE_DAMAGE_LEVELS = ['None', 'Minor', 'Major', 'Totally Damaged'];
export const ASSESSMENT_STATUSES = {
  pending_assignment: 'Pending Assignment', assigned: 'Assigned / Pending Visit', assessed: 'Assessed',
};
export const ALLOCATION_STATUS_LABELS = {
  PENDING_ASSESSMENT: 'Pending Assessment', ASSESSMENT_IN_PROGRESS: 'Assessment in Progress',
  READY_FOR_DISTRIBUTION: 'Ready for Distribution', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
export const ALLOCATION_STATUS_BADGE = {
  PENDING_ASSESSMENT: 'badge-unassessed', ASSESSMENT_IN_PROGRESS: 'badge-pending',
  READY_FOR_DISTRIBUTION: 'badge-ready', COMPLETED: 'badge-verified', CANCELLED: 'badge-rejected',
};

export const damageLabel = (value) => DAMAGE_LABEL[value] || null;
export const isLocked = (row) => Boolean(row?.locked_at);
export const assessmentStatusLabel = (row) => ASSESSMENT_STATUSES[row?.status] || ASSESSMENT_STATUSES.pending_assignment;
export const assessmentDamageLabel = (row) => row?.status !== 'assessed' || !row.damage_classification
  ? 'Not Yet Assessed' : row.damage_classification === 'No Damage' ? 'No Damage — Assessed' : `${damageLabel(row.damage_classification)} — Assessed`;
/** Only the assigned Field Officer, and only while the visit is not submitted (locked). */
export const canEditHouseholdAssessment = (user, row) => user?.role === 'field_officer'
  && Number(user.user_id) > 0 && Number(user.user_id) === Number(row?.assigned_field_officer_id) && !isLocked(row);

/** The form starts from whatever is saved for this round: a draft or the submitted visit. */
export function assessmentFormFor(row) {
  return {
    field_visit_date: row.field_visit_date || '', damage_classification: row.damage_classification || '',
    infrastructure_damage: row.infrastructure_damage || 'None', property_damage: row.property_damage || 'None',
    agricultural_damage: row.agricultural_damage || 'None', estimated_severity: row.estimated_severity || 'Low',
    findings: row.findings || '', remarks: row.remarks || '',
  };
}

/** Draft: send what has been filled in; nothing is required yet. */
export function assessmentDraftPayload(row, form) {
  const payload = { household_id: row.household_id, version: row.version || 0 };
  for (const [key, value] of Object.entries(form)) if (typeof value === 'string' && value.trim() !== '') payload[key] = value.trim();
  return payload;
}

/** Submission: every required field, classification only (the server maps it to points). */
export function assessmentPayload(row, form) {
  if (!form.field_visit_date) throw new Error('Enter the actual visit date.');
  if (!DAMAGE_LABEL[form.damage_classification]) throw new Error('Choose the household damage classification.');
  if (!form.findings?.trim()) throw new Error('Enter the findings from your household visit.');
  return {
    household_id: row.household_id, version: row.version || 0,
    field_visit_date: form.field_visit_date, damage_classification: form.damage_classification,
    infrastructure_damage: form.infrastructure_damage || 'None',
    property_damage: form.property_damage || 'None', agricultural_damage: form.agricultural_damage || 'None',
    estimated_severity: form.estimated_severity || 'Low', findings: form.findings.trim(), remarks: form.remarks?.trim() || '',
  };
}
