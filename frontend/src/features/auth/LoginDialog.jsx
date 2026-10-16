import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import useFocusTrap from "../../hooks/useFocusTrap.js";
import HazardTape from "../../components/ui/HazardTape.jsx";
import LoginForm from "./LoginForm.jsx";
import { useLoginDialog } from "./LoginDialogContext.jsx";
import "./auth.css";

/** Mounted once in App; shows the dialog while the history entry asks for it. */
export default function LoginDialog() {
  const { dialog, closeLogin } = useLoginDialog();
  const location = useLocation();
  if (!dialog) return null;
  return createPortal(<DialogPanel key={location.key} dialog={dialog} onClose={closeLogin} />, document.body);
}

function DialogPanel({ dialog, onClose }) {
  const panelRef = useRef(null);
  // The element that opened the dialog, captured before the page goes inert.
  const [opener] = useState(() => document.activeElement);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const downOnBackdrop = useRef(false);
  const [nudge, setNudge] = useState(false);

  const tryClose = useCallback(() => {
    if (!busyRef.current) onClose();
  }, [onClose]);

  // Page behind: inert and not scrollable (scrollbar width kept, so nothing shifts).
  // Declared before useFocusTrap so this cleanup runs first and focus can return to the opener.
  useEffect(() => {
    const root = document.getElementById("root");
    const body = document.body;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const prev = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    root?.setAttribute("inert", "");
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      root?.removeAttribute("inert");
      body.style.overflow = prev.overflow;
      body.style.paddingRight = prev.paddingRight;
      if (opener && opener !== document.body && document.contains(opener) && typeof opener.focus === "function") opener.focus();
    };
  }, [opener]);

  useFocusTrap(panelRef, true, tryClose);

  // A prefilled email (e.g. right after registering) puts the caret in Password instead.
  useEffect(() => {
    if (dialog.email) document.getElementById("login-password")?.focus();
  }, [dialog.email]);

  const onBackdropDown = (e) => { downOnBackdrop.current = e.target === e.currentTarget; };
  const onBackdropClick = (e) => {
    if (!downOnBackdrop.current || e.target !== e.currentTarget) return;
    if (busyRef.current) return;
    if (dirtyRef.current) {
      // Something was typed: a stray click outside should not throw it away.
      setNudge(true);
      setTimeout(() => setNudge(false), 320);
      return;
    }
    onClose();
  };

  return (
    <div className="ld-scrim" onMouseDown={onBackdropDown} onClick={onBackdropClick}>
      <div
        ref={panelRef}
        className={`ld-panel${nudge ? " is-nudged" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        aria-describedby="login-desc"
      >
        <HazardTape variant="orange" className="ld-tape" />
        <div className="ld-scroll">
          <LoginForm
            variant="dialog"
            initialEmail={dialog.email || ""}
            next={dialog.next}
            reason={dialog.reason}
            onBusyChange={(b) => { busyRef.current = b; }}
            onDirtyChange={(d) => { dirtyRef.current = d; }}
          />
        </div>
        {/* Last in the DOM so focus starts in the form; drawn top-right. */}
        <button type="button" className="ld-close" aria-label="Close" onClick={tryClose}>
          <X aria-hidden="true" size={22} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
