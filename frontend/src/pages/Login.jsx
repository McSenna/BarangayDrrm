import { useSearchParams } from "react-router-dom";
import SiteHeader from "../components/site/SiteHeader.jsx";
import HazardTape from "../components/ui/HazardTape.jsx";
import LoginForm from "../features/auth/LoginForm.jsx";
import "../features/auth/auth.css";

/**
 * /login — the full-page home of the same LoginForm the dialog uses (for
 * bookmarks, password managers and old links). ?next= and ?reason=idle work
 * here too.
 */
export default function Login() {
  const [params] = useSearchParams();
  return (
    <div className="layout">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="auth-wrap">
        <div className="lf-page">
          <HazardTape variant="orange" />
          <div className="ld-scroll">
            <LoginForm variant="page" next={params.get("next")} reason={params.get("reason") === "idle" ? "idle" : null} />
          </div>
        </div>
      </main>
    </div>
  );
}
