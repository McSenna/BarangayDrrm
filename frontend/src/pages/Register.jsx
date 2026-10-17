import { useState } from "react";
import SiteHeader from "../components/site/SiteHeader.jsx";
import { register } from "../services/api.jsx";
import { useLoginDialog } from "../features/auth/LoginDialogContext.jsx";

export default function Register() {
  const { openLogin } = useLoginDialog();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    contact_number: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const response = await register(form);
      setSuccess(response.data.message || "Registration submitted. Please wait for barangay approval before signing in.");
      setForm({ ...form, password: "" });
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="layout">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="auth-wrap">
        <div className="auth-card">
          <h2>Create a Resident Account</h2>
          <div className="sub">Register as a Resident of Barangay Binitayan. Your account must be approved by the barangay before you can sign in. Administrator and Relief Personnel accounts are created by the Barangay Administrator.</div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success" role="status">{success}</div>}

          {!success && <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="registration-name">Full Name</label>
              <input id="registration-name" type="text" name="full_name" value={form.full_name} maxLength={150} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="registration-email">Email</label>
              <input id="registration-email" type="email" name="email" value={form.email} maxLength={150} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="registration-password">Password (at least 6 characters)</label>
              <input id="registration-password" type="password" name="password" value={form.password} onChange={handleChange} minLength={6} maxLength={72} required />
            </div>
            <div className="form-group">
              <label htmlFor="registration-contact">Contact Number (optional)</label>
              <input id="registration-contact" type="text" name="contact_number" value={form.contact_number} maxLength={20} onChange={handleChange} placeholder="09XXXXXXXXX" />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Creating account…" : "Register"}
            </button>
          </form>}

          <div className="auth-switch">
            Already have an account?{" "}
            <button type="button" className="btn-text" aria-haspopup="dialog" onClick={() => openLogin()}>Log in</button>
          </div>
        </div>
      </main>
    </div>
  );
}
