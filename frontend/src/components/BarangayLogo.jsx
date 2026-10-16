import { useState } from "react";
import { Shield } from "lucide-react";

/**
 * Barangay Binitayan seal from /logo.png (see public/ADD_LOGO_HERE.txt), shown
 * as a circle. `tone` sets its backing: "dark" (sidebar: dashed ring on
 * navy-deep) or "light" (public header: white disc). Until the image is added
 * a placeholder ring with a shield is shown.
 */
export default function BarangayLogo({ size = 52, className = "", tone = "dark" }) {
  const [imgError, setImgError] = useState(false);
  const light = tone === "light";

  if (imgError) {
    return (
      <span
        className={`seal ${light ? "seal-placeholder-light" : "seal-placeholder"} ${className}`}
        style={{ width: size, height: size }}
        role="img"
        aria-label="Barangay Binitayan seal (placeholder)"
      >
        <Shield aria-hidden="true" size={Math.round(size * 0.42)} strokeWidth={1.75} />
      </span>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="Barangay Binitayan seal"
      width={size}
      height={size}
      onError={() => setImgError(true)}
      className={`seal${light ? " seal-light" : ""} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
