import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

/**
 * Password input with a leading lock icon and a show/hide toggle. Toggling
 * keeps focus and the caret where they were (the button does not take focus
 * from the input on mouse/touch, and the selection is restored after the
 * input's type changes).
 */
const PasswordField = forwardRef(function PasswordField({ id, error, errorId, disabled, ...inputProps }, ref) {
  const [shown, setShown] = useState(false);
  const innerRef = useRef(null);
  const selection = useRef(null);

  const setRefs = (el) => {
    innerRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (el && selection.current && document.activeElement === el) {
      el.setSelectionRange(selection.current[0], selection.current[1]);
    }
    selection.current = null;
  }, [shown]);

  const toggle = () => {
    const el = innerRef.current;
    if (el && document.activeElement === el) selection.current = [el.selectionStart, el.selectionEnd];
    setShown((s) => !s);
  };

  return (
    <div className={`lf-control${error ? " is-invalid" : ""}`}>
      <Lock className="lf-icon" aria-hidden="true" size={18} strokeWidth={2} />
      <input
        ref={setRefs}
        id={id}
        type={shown ? "text" : "password"}
        className="lf-input lf-input-pass"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        {...inputProps}
      />
      <button
        type="button"
        className="lf-eye"
        onMouseDown={(e) => e.preventDefault()} /* keep focus (and the caret) in the input */
        onClick={toggle}
        aria-controls={id}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        disabled={disabled}
      >
        {shown ? <EyeOff aria-hidden="true" size={19} strokeWidth={2} /> : <Eye aria-hidden="true" size={19} strokeWidth={2} />}
      </button>
    </div>
  );
});

export default PasswordField;
