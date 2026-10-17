import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { getMyProfile, updateMyProfile, changeMyPassword } from "../services/api.jsx";

const ROLE_LABEL = {
  admin: "Administrator",
  resident: "Resident",
  relief_personnel: "Relief Personnel",
  field_officer: "Field Officer",
};

/**
 * Shared "My Profile" screen used by all three roles (admin/resident/personnel
 * pages just render this). Lets a logged-in user view/edit their own name,
 * email, contact number, and change their own password.
 */
export default function MyProfileView() {
  const { user, setUser } = useAuth();
  // Phase 21: residents may update only their contact number and password;
  // name and email are managed by the barangay office.
  const isResident = user?.role === "resident";
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ full_name: "", email: "", contact_number: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => {
    getMyProfile()
      .then((res) => {
        setProfile(res.data.data);
        setForm({
          full_name: res.data.data.full_name,
          email: res.data.data.email,
          contact_number: res.data.data.contact_number || "",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleProfileChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await updateMyProfile(form);
      setProfileMsg({ type: "success", text: res.data.message || "Your profile has been updated." });
      // Keep the navbar/sidebar name in sync without requiring a re-login,
      // when the AuthContext exposes a setter for this.
      if (typeof setUser === "function" && res.data.user) {
        setUser(res.data.user);
      }
    } catch (err) {
      setProfileMsg({ type: "error", text: err.response?.data?.message || "We couldn't update your profile. Please try again." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePwChange = (e) => setPwForm({ ...pwForm, [e.target.name]: e.target.value });

  const handlePwSubmit = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwMsg({ type: "error", text: "The new passwords do not match. Please enter them again." });
      return;
    }
    if (pwForm.new_password.length < 6) {
      setPwMsg({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }
    setSavingPw(true);
    try {
      const res = await changeMyPassword({
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwMsg({ type: "success", text: res.data.message || "Your password has been changed." });
      setPwForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      setPwMsg({ type: "error", text: err.response?.data?.message || "We couldn't change your password. Please try again." });
    } finally {
      setSavingPw(false);
    }
  };

  if (loading) return <div className="loading-text">Loading profile…</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p>{isResident
            ? "View your registered account. You can update your contact number and change your password."
            : "View and update your account details, or change your password."}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Account Details</h3>
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: -8 }}>
          Role: <strong>{ROLE_LABEL[profile?.role] || profile?.role}</strong> · Account created{" "}
          {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—"}
        </p>
        <form onSubmit={handleProfileSubmit}>
          {["field_officer", "relief_personnel"].includes(profile?.role) && <p>Assigned Purok: <strong>{profile.assigned_purok || "Not assigned"}</strong>. Contact the administrator to change your assignment.</p>}
          <div className="form-group">
            <label>Full Name</label>
            <input name="full_name" value={form.full_name} onChange={handleProfileChange} required readOnly={isResident} aria-readonly={isResident} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" name="email" value={form.email} onChange={handleProfileChange} required readOnly={isResident} aria-readonly={isResident} />
          </div>
          <div className="form-group">
            <label>Contact Number</label>
            <input name="contact_number" value={form.contact_number} onChange={handleProfileChange} placeholder="09XXXXXXXXX" />
            {isResident && (
              <small style={{ display: "block", marginTop: 4, color: "var(--color-ink-soft)" }}>
                Relief SMS notifications are sent to this number. Your name, email and household details are managed by the barangay office.
              </small>
            )}
          </div>
          {profileMsg && (
            <p style={{ color: profileMsg.type === "success" ? "var(--color-success, green)" : "var(--color-danger, crimson)", fontSize: 13 }}>
              {profileMsg.text}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={savingProfile}>
            {savingProfile ? "Saving…" : isResident ? "Save Contact Number" : "Save Changes"}
          </button>
        </form>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Change Password</h3>
        <form onSubmit={handlePwSubmit}>
          <div className="form-group">
            <label>Current Password</label>
            <input type="password" name="current_password" value={pwForm.current_password} onChange={handlePwChange} required />
          </div>
          <div className="form-group">
            <label>New Password (at least 6 characters)</label>
            <input type="password" name="new_password" value={pwForm.new_password} onChange={handlePwChange} minLength={6} required />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input type="password" name="confirm_password" value={pwForm.confirm_password} onChange={handlePwChange} minLength={6} required />
          </div>
          {pwMsg && (
            <p style={{ color: pwMsg.type === "success" ? "var(--color-success, green)" : "var(--color-danger, crimson)", fontSize: 13 }}>
              {pwMsg.text}
            </p>
          )}
          <button type="submit" className="btn btn-secondary" disabled={savingPw}>
            {savingPw ? "Changing…" : "Change Password"}
          </button>
        </form>
      </div>
    </>
  );
}
