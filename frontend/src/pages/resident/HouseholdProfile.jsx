import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import { getHouseholds, getHouseholdMembers } from "../../services/api.jsx";

export default function HouseholdProfile() {
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHouseholds()
      .then(async (res) => {
        const hh = res.data.data[0] || null;
        setHousehold(hh);
        if (hh) {
          const m = await getHouseholdMembers(hh.household_id);
          setMembers(m.data.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Household</h1>
          <p>Your household information as registered with the barangay.</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-text">Loading household profile…</div>
      ) : !household ? (
        <div className="alert alert-error">
          No household profile is linked to your account yet. Please contact the Barangay
          Administrator or visit the barangay office to register your household.
        </div>
      ) : (
        <>
          <div className="card" style={{ maxWidth: 560, marginBottom: 18 }}>
            <p><strong>Household Head:</strong> {household.head_of_family}</p>
            <p><strong>Purok:</strong> {household.purok}</p>
            <p><strong>Address:</strong> {household.address}</p>
            <p><strong>Number of Members:</strong> {household.number_of_members}</p>
            <p><strong>Contact Number:</strong> {household.contact_number || "—"}</p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              {household.children_count > 0 && <span className="badge badge-medium">Children: {household.children_count}</span>}
              {household.seniors_count > 0 && <span className="badge badge-medium">Seniors: {household.seniors_count}</span>}
              {household.pwd_count > 0 && <span className="badge badge-medium">PWD: {household.pwd_count}</span>}
              {household.pregnant_count > 0 && <span className="badge badge-medium">Pregnant Women: {household.pregnant_count}</span>}
              {household.medical_needs_count > 0 && <span className="badge badge-medium">With Medical Needs: {household.medical_needs_count}</span>}
              {household.other_vulnerable_count > 0 && <span className="badge badge-medium">Other Vulnerable: {household.other_vulnerable_count}</span>}
              {household.vulnerable_members === 0 && <span style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>No vulnerable members recorded.</span>}
            </div>

            <p style={{ color: "var(--color-ink-soft)", fontSize: 13, marginTop: 16 }}>
              Household, member and vulnerability information is managed by authorized barangay personnel. To correct it, please contact the barangay office.
            </p>
          </div>

          <div className="card" style={{ maxWidth: 560 }}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Household Members</h3>
            <DataTable
              columns={[
                { key: "full_name", label: "Name" },
                { key: "relationship", label: "Relationship", render: (m) => m.relationship || "—" },
                { key: "age", label: "Age", render: (m) => m.age ?? "—" },
              ]}
              rows={members}
              emptyText="No household members have been recorded yet."
            />
          </div>
        </>
      )}
    </>
  );
}
