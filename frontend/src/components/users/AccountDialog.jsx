import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Native modal semantics provide focus containment, Escape, and focus restoration.
export default function AccountDialog({ title, busy, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="account-dialog" aria-labelledby="account-dialog-title" onCancel={(event) => {
    event.preventDefault(); if (!busy) onClose();
  }}>
    <div className="modal-header"><h2 id="account-dialog-title">{title}</h2>
      <button className="icon-btn" type="button" disabled={busy} onClick={onClose} aria-label="Close dialog"><X size={20} aria-hidden="true" /></button>
    </div>{children}
  </dialog>;
}
