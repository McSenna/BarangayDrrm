import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, CircleAlert, Mail } from "lucide-react";
import BarangayLogo from "../../components/BarangayLogo.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import PasswordField from "./PasswordField.jsx";
import FormErrorBanner from "./FormErrorBanner.jsx";
import EmergencyNote from "./EmergencyNote.jsx";
import { destinationFor, loginErrorFor, throttledMessage, validateLogin } from "./authLogic.js";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The one login form, used by the dialog (LoginDialog) and the /login page.
 * It calls the existing useAuth().login() -> POST auth/login.php, unchanged.
 * The password lives only in this component's state: it is never stored,
 * logged, or kept after a failed attempt.
 */
export default function LoginForm({ variant = "dialog", initialEmail = "", next = null, reason = null, onBusyChange, onDirtyChange }) {
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [banner, setBanner] = useState(null); // { kind, message }
  const [status, setStatus] = useState("idle"); // idle | submitting | success
  const [retryLeft, setRetryLeft] = useState(0);
  const [forgotOpen, setForgotOpen] = useState(false);
  const bannerRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const busy = status !== "idle";

  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => { onDirtyChange?.(email !== initialEmail || password !== ""); }, [email, password, initialEmail, onDirtyChange]);

  // Server-supplied Retry-After: count down, keep the button disabled.
  useEffect(() => {
    if (retryLeft <= 0) return undefined;
    const t = setTimeout(() => {
      const left = retryLeft - 1;
      setRetryLeft(left);
      setBanner((b) => (left > 0 ? { ...b, message: throttledMessage(left) } : null));
    }, 1000);
    return () => clearTimeout(t);
  }, [retryLeft]);

  const revalidate = (values) => {
    if (submitted) setErrors(validateLogin(values));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy || retryLeft > 0) return;
    setSubmitted(true);
    const errs = validateLogin({ email, password });
    setErrors(errs);
    if (errs.email || errs.password) {
      (errs.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBanner(null);
    setStatus("submitting");
    try {
      const user = await login(email.trim(), password);
      setPassword("");
      setStatus("success");
      setTimeout(() => navigate(destinationFor(user, next), { replace: true }), reducedMotion() ? 0 : 550);
    } catch (err) {
      const m = loginErrorFor(err);
      setPassword("");
      setStatus("idle");
      setBanner(m);
      if (m.retryAfter) setRetryLeft(m.retryAfter);
      requestAnimationFrame(() => bannerRef.current?.focus());
    }
  };

  const TitleTag = variant === "page" ? "h1" : "h2";
  const officePhone = settings?.contact_phone;

  return (
    <div className="lf">
      <div className="lf-head">
        <BarangayLogo tone="light" size={64} className="lf-seal" />
        <TitleTag id="login-title" className="lf-title">Log in</TitleTag>
        <p id="login-desc" className="lf-desc">Log in to your Barangay Binitayan account.</p>
      </div>

      {reason === "idle" && !banner && (
        <p className="lf-notice" role="status">You were signed out after a period of inactivity. Please log in again.</p>
      )}

      <form className="lf-form" method="post" action="/login" noValidate onSubmit={onSubmit} aria-busy={status === "submitting"}>
        {banner && (
          <FormErrorBanner ref={bannerRef}>
            {banner.message}
          </FormErrorBanner>
        )}

        <div className="lf-field">
          <label htmlFor="login-email" className="lf-label">Email</label>
          <div className={`lf-control${errors.email ? " is-invalid" : ""}`}>
            <Mail className="lf-icon" aria-hidden="true" size={18} strokeWidth={2} />
            <input
              ref={emailRef}
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              className="lf-input"
              value={email}
              onChange={(e) => { setEmail(e.target.value); revalidate({ email: e.target.value, password }); }}
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "login-email-error" : undefined}
              disabled={busy}
              required
            />
          </div>
          {errors.email && <p id="login-email-error" className="lf-error"><CircleAlert aria-hidden="true" size={15} strokeWidth={2.25} />{errors.email}</p>}
        </div>

        <div className="lf-field">
          <div className="lf-label-row">
            <label htmlFor="login-password" className="lf-label">Password</label>
            <button type="button" className="lf-link" aria-expanded={forgotOpen} aria-controls="login-forgot" onClick={() => setForgotOpen((o) => !o)}>
              Forgot password?
            </button>
          </div>
          <PasswordField
            ref={passwordRef}
            id="login-password"
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); revalidate({ email, password: e.target.value }); }}
            error={errors.password}
            errorId="login-password-error"
            disabled={busy}
            required
          />
          {errors.password && <p id="login-password-error" className="lf-error"><CircleAlert aria-hidden="true" size={15} strokeWidth={2.25} />{errors.password}</p>}
          {forgotOpen && (
            <p id="login-forgot" className="lf-forgot">
              Passwords are reset by the barangay office.{" "}
              {officePhone ? <>Call <a href={`tel:${String(officePhone).replace(/[^\d+]/g, "")}`}>{officePhone}</a> or visit</> : "Visit"} the Barangay Hall
              {settings?.office_hours ? ` (${settings.office_hours})` : ""}.
            </p>
          )}
        </div>

        <button type="submit" className={`lf-submit${status === "success" ? " is-success" : ""}`} disabled={retryLeft > 0} aria-disabled={busy || undefined}>
          {status === "submitting" ? (
            <><span className="lf-spinner" aria-hidden="true" />Logging in…</>
          ) : status === "success" ? (
            <><Check aria-hidden="true" size={19} strokeWidth={3} />Success</>
          ) : (
            <>Log in<ArrowRight aria-hidden="true" size={19} strokeWidth={2.5} /></>
          )}
        </button>
      </form>

      <div className="lf-divider" role="presentation"><span>New here?</span></div>
      <Link to="/register" className="lf-register">Create a resident account</Link>
      <EmergencyNote />
    </div>
  );
}
