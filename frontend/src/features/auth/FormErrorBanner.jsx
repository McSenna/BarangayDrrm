import { forwardRef } from "react";
import { CircleAlert } from "lucide-react";

/** Error banner at the top of the form. Focusable so focus can move to it after a failed attempt. */
const FormErrorBanner = forwardRef(function FormErrorBanner({ children, action }, ref) {
  return (
    <div ref={ref} className="lf-banner" role="alert" tabIndex={-1}>
      <CircleAlert className="lf-banner-icon" aria-hidden="true" size={18} strokeWidth={2.25} />
      <div>
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
});

export default FormErrorBanner;
