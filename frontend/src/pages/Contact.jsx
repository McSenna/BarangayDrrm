import { useState } from "react";
import SiteHeader from "../components/site/SiteHeader.jsx";
import SiteFooter from "../components/site/SiteFooter.jsx";
import { useSettings } from "../context/SettingsContext.jsx";

export default function Contact() {
  const { settings } = useSettings();
  const [form, setForm] = useState({ name: "", message: "" });
  const [opened, setOpened] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    const subject = `Inquiry from ${form.name.trim()}`;
    const body = `${form.message.trim()}\n\n— ${form.name.trim()}`;
    window.location.href =
      `mailto:${encodeURIComponent(settings.contact_email)}` +
      `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };

  return (
    <div className="layout">
      <SiteHeader />
      <section id="main" tabIndex={-1} className="section" style={{ maxWidth: 560 }}>
        <h2>Contact the Barangay Office</h2>
        <p style={{ color: "var(--color-ink-soft)" }}>
          For questions about the system or requests for assistance, contact the barangay office using the details
          below. For emergencies, call the emergency hotline.
        </p>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16 }}>{settings.barangay_name} Office</h3>
          <p style={{ margin: "4px 0", color: "var(--color-ink-soft)", fontSize: 14 }}>
            {settings.barangay_address}<br />
            Office Hours: {settings.office_hours}<br />
            Contact Number: {settings.contact_phone}<br />
            Email: <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a><br />
            Emergency Hotline: {settings.emergency_hotline}
          </p>
        </div>

        <form className="card" onSubmit={handleSubmit} style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 16, marginTop: 0 }}>Write an Email to the Barangay Office</h3>
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)", marginTop: 0 }}>
            This form does not send or store your message. It opens your own email application with a message
            addressed to {settings.contact_email}, which you can review and send from your email account.
          </p>
          <div className="form-group">
            <label>Full Name</label>
            <input type="text" name="name" value={form.name} onChange={handleChange} required placeholder="Juan Dela Cruz" />
          </div>
          <div className="form-group">
            <label>Message</label>
            <textarea name="message" value={form.message} onChange={handleChange} required placeholder="Type your message" />
          </div>
          {opened && (
            <div className="alert alert-success">
              Your email application should now be open with your message. If nothing opened, email the barangay
              office directly at {settings.contact_email}.
            </div>
          )}
          <button className="btn btn-primary" type="submit">Open in Email Application</button>
        </form>
      </section>
      <SiteFooter />
    </div>
  );
}
