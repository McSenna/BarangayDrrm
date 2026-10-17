import { useEffect, useState } from "react";
import HouseholdScoreSummary from "../../components/HouseholdScoreSummary.jsx";
import DataTable from "../../components/DataTable.jsx";
import AccountDialog from "../../components/users/AccountDialog.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { getHouseholds, getHouseholdMembers } from "../../services/api.jsx";

export default function FieldHouseholds() {
  const [households, setHouseholds] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [details, setDetails] = useState(null);
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    getHouseholds().then((res) => { if (current) setHouseholds(res.data.data || []); })
      .catch(() => { if (current) setError("We couldn't load households. Please try again."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision]);
  const query = search.trim().toLowerCase();
  const rows = households.filter((row) => `${row.head_of_family} ${row.purok} ${row.address}`.toLowerCase().includes(query));
  const inspect = async (row) => {
    setDetails({ row, loading: true, members: [] });
    try {
      const res = await getHouseholdMembers(row.household_id);
      setDetails((current) => current?.row.household_id === row.household_id ? { row, loading: false, members: res.data.data || [] } : current);
    } catch {
      setDetails((current) => current?.row.household_id === row.household_id ? { row, loading: false, members: [], error: "We couldn't load family members. Close this dialog and try again." } : current);
    }
  };
  return <>
    <PageHeader title="Households" description="View registered household information for field reporting. Household changes are managed by the barangay administrator." />
    {error && <div className="alert alert-error" role="alert">{error} <button className="btn btn-ghost" onClick={() => setRevision((n) => n + 1)}>Retry</button></div>}
    <div className="card">
      <div className="form-group"><label htmlFor="field-household-search">Search household head, purok or address</label><input id="field-household-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {loading ? <p className="loading-text">Loading households…</p> : <>
        <p role="status">{rows.length} household(s)</p>
        <DataTable columns={[
          { key: "head_of_family", label: "Household Head" }, { key: "purok", label: "Purok" },
          { key: "address", label: "Address" }, { key: "number_of_members", label: "Reported members (verify roster)" },
          { key: "vulnerable_members", label: "Reported vulnerable people" },
          { key: "actions", label: "Actions", render: (row) => <button className="btn btn-ghost" onClick={() => inspect(row)}>View members</button> },
        ]} rows={rows} emptyText="No households match your search." />
      </>}
    </div>
    {details && <AccountDialog title={`Household members — ${details.row.head_of_family}`} onClose={() => setDetails(null)}>
      {details.error && <p className="alert alert-error" role="alert">{details.error}</p>}
      {details.loading ? <p>Loading members…</p> : <DataTable columns={[
        { key: "full_name", label: "Name" }, { key: "relationship", label: "Relationship" }, { key: "age", label: "Age" },
      ]} rows={details.members} emptyText="No individual members have been recorded." />}
      <HouseholdScoreSummary householdId={details.row.household_id} />
    </AccountDialog>}
  </>;
}
