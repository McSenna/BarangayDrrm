import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Bell, Menu } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { useShellStatus } from "../../context/ShellStatusContext.jsx";
import HazardStatusChip from "./HazardStatusChip.jsx";
import UserMenu from "./UserMenu.jsx";
import { ROLE_LINKS } from "./navConfig.js";

const TopHeader = forwardRef(function TopHeader({ showMenuButton, navOpen, onOpenNav }, menuButtonRef) {
  const { user } = useAuth();
  const { unread } = useShellStatus();
  const links = ROLE_LINKS[user?.role] || {};

  return (
    <header className="topbar">
      <div className="topbar-start">
        {showMenuButton && (
          <button
            ref={menuButtonRef}
            type="button"
            className="topbar-icon-btn"
            aria-label="Open navigation menu"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={onOpenNav}
          >
            <Menu aria-hidden="true" size={22} strokeWidth={2} />
          </button>
        )}
        <HazardStatusChip to={links.monitoring} />
      </div>

      <div className="topbar-end">
        {links.notifications && (
          <>
            <Link
              to={links.notifications}
              className="topbar-icon-btn"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            >
              <Bell aria-hidden="true" size={20} strokeWidth={1.9} />
              {unread > 0 && <span className="bell-dot" aria-hidden="true" />}
            </Link>
            <span className="topbar-divider" aria-hidden="true" />
          </>
        )}
        <UserMenu />
      </div>
    </header>
  );
});

export default TopHeader;
