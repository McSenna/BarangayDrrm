import { ArrowRight } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import HazardTape from "../../components/ui/HazardTape.jsx";
import { useLoginDialog } from "../auth/LoginDialogContext.jsx";

/** Full-bleed white band asking households to register. */
export default function RegisterCTA() {
  const { openLogin } = useLoginDialog();
  return (
    <section className="cta-band" aria-labelledby="cta-title">
      <HazardTape variant="orange" />
      <div className="cta-inner">
        <div>
          <h2 id="cta-title" className="lp-h2">Register your household before the next storm.</h2>
          <p className="cta-text">
            Registered households get located on the barangay map, assessed faster, and notified by SMS when relief is ready.
          </p>
        </div>
        <div className="lp-actions">
          <Button variant="primary-orange" size="lg" to="/register" iconEnd={ArrowRight}>Register as a resident</Button>
          <Button variant="primary" size="lg" aria-haspopup="dialog" onClick={() => openLogin()}>Log in</Button>
        </div>
      </div>
    </section>
  );
}
