import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { ROLE_LABEL, ROLE_LINKS } from "./navConfig.js";

const initialsOf = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";


export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const items = () => Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || []);

  useEffect(() => {
    if (!open) return undefined;
    items()[0]?.focus();
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  if (!user) return null;

  const role = ROLE_LABEL[user.role] || "";
  const profileTo = ROLE_LINKS[user.role]?.profile;

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKeyDown = (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    window.confirm("Are you sure you want to log out?") && navigate("/", { replace: true });
  
  };

  return (
    <div className="user-menu">
      <button
        ref={buttonRef}
        type="button"
        className="user-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="avatar" aria-hidden="true">{initialsOf(user.full_name)}</span>
        {/* Below 1024px the name is visually hidden (still read out). */}
        <span className="user-meta">
          <span className="user-name">{user.full_name}</span>
          <span className="user-role"><span className="sr-only">, </span>{role}</span>
        </span>
        <span className="sr-only">, account menu</span>
        <ChevronDown className={`user-chevron${open ? " is-open" : ""}`} aria-hidden="true" size={16} strokeWidth={2} />
      </button>

      {open && (
        <div id={menuId} ref={menuRef} className="user-menu-pop" role="menu" aria-label="Account" onKeyDown={onMenuKeyDown}>
          <div className="user-menu-head" role="none">
            <span className="user-menu-name">{user.full_name}</span>
            <span className="user-menu-role">{role}</span>
          </div>
          {profileTo && (
            <Link to={profileTo} role="menuitem" className="user-menu-item" onClick={() => setOpen(false)}>
              <UserRound aria-hidden="true" size={17} strokeWidth={1.75} />
              Profile
            </Link>
          )}
          <button type="button" role="menuitem" className="user-menu-item" onClick={handleLogout}>
            <LogOut aria-hidden="true" size={17} strokeWidth={1.75} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
