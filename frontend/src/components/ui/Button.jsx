import { Link } from "react-router-dom";

// "primary-navy" / "danger-red" are the design-spec names; the short names are aliases.
const VARIANT_CLASS = {
  primary: "btn-primary",
  "primary-navy": "btn-primary",
  danger: "btn-danger",
  "danger-red": "btn-danger",
  ghost: "btn-ghost",
  text: "btn-text",
  // Public site
  "primary-orange": "btn-orange",
  "outline-navy": "btn-outline-navy",
  "outline-on-navy": "btn-outline-on-navy",
  "white-red": "btn-white-red",
};
const SIZE_CLASS = { sm: "btn-sm", md: "", lg: "btn-lg" };
const ICON_SIZE = { sm: 15, md: 17, lg: 19 };

/**
 * One component for every action button and button-styled link.
 *
 * variant: "primary" (navy, the default action), "danger" (red, urgent
 *          response only), "ghost" (outlined, secondary), "text" (inline
 *          secondary link); public site: "primary-orange" (orange, navy
 *          text), "outline-navy", "outline-on-navy" (for navy bands),
 *          "white-red" (white, red text, on red headers)
 * size:    "sm" (32px), "md" (40px) or "lg" (52px)
 * icon / iconEnd: a lucide-react component, drawn before / after the label.
 *
 * Renders a router <Link> when `to` is given, an <a> for `href`, and a
 * <button type="button"> otherwise (pass type="submit" for forms).
 */
export default function Button({
  variant = "primary",
  size = "md",
  to,
  href,
  icon: Icon,
  iconEnd: IconEnd,
  className = "",
  type = "button",
  children,
  ...rest
}) {
  const cls = ["btn", VARIANT_CLASS[variant] || VARIANT_CLASS.primary, SIZE_CLASS[size] || "", className]
    .filter(Boolean)
    .join(" ");
  const iconSize = ICON_SIZE[size] || ICON_SIZE.md;
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" size={iconSize} strokeWidth={2} />}
      {children}
      {IconEnd && <IconEnd aria-hidden="true" size={iconSize} strokeWidth={2} />}
    </>
  );

  if (to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{content}</a>;
  return <button type={type} className={cls} {...rest}>{content}</button>;
}
