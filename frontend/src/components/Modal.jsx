import { useId } from "react";
import { X } from "lucide-react";

export default function Modal({ title, onClose, children }) {
  const titleId = useId();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id={titleId} style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
