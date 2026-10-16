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
      await register(form);
      setSuccess("Registration successful. You may now log in.");
      setTimeout(() => openLogin({ at: "/", replace: true, email: form.email }), 1500);
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
          <div className="sub">Register as a Resident of Barangay Binitayan. Administrator and Relief Personnel accounts are created by the Barangay Administrator.</div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" name="full_name" value={form.full_name} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Password (at least 6 characters)</label>
              <input type="password" name="password" value={form.password} onChange={handleChange} minLength={6} required />
            </div>
            <div className="form-group">
              <label>Contact Number (optional)</label>
              <input type="text" name="contact_number" value={form.contact_number} onChange={handleChange} placeholder="09XXXXXXXXX" />
            </div>
            <button className="btn btn-primary" type="submit" style={{ width: "100%" }} disabled={loading}>
              {loading ? "Creating account…" : "Register"}
            </button>
          </form>

          <div className="auth-switch">
            Already have an account?{" "}
            <button type="button" className="btn-text" aria-haspopup="dialog" onClick={() => openLogin()}>Log in</button>
          </div>
        </div>
      </main>
    </div>
  );
}
