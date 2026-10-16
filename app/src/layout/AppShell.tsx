import { useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { pageTitleFromPath, userInitials } from "../lib/format";
import { useTheme } from "../lib/theme";
import { useIsMobile } from "../lib/useIsMobile";
import { useCurrentUser } from "../lib/user";
import { TimerBar } from "../screens/TimerBar";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { DropdownMenu, Drawer } from "../ui/overlays";

type NavItem = { to: string; label: string; icon: IconName };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Track",
    items: [
      { to: "/", label: "Calendar", icon: "date" },
      { to: "/list", label: "List", icon: "board" },
    ],
  },
  { label: "Analyze", items: [{ to: "/reports", label: "Reports", icon: "trending-up" }] },
  {
    label: "Manage",
    items: [
      { to: "/projects", label: "Projects", icon: "folder" },
      { to: "/clients", label: "Clients", icon: "users" },
      { to: "/tags", label: "Tags", icon: "hash" },
      { to: "/import", label: "Import", icon: "upload" },
    ],
  },
];

// On mobile the footer dropdown would render behind the nav drawer, so
// Settings is surfaced as a first-class link there instead.
const MOBILE_EXTRA_GROUP = {
  label: "Account",
  items: [{ to: "/settings", label: "Settings", icon: "cog" as IconName }],
};

function Logo() {
  const { tone } = useTheme();
  return (
    <img
      src={tone === "dark" ? "/resources/dark-full-logo.svg" : "/resources/full-logo.svg"}
      alt="Animo"
    />
  );
}

function NavGroup({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="nav__group">
      <button
        type="button"
        className="nav__group-label"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {label}
        <Icon name={expanded ? "chevrondown" : "chevronright"} size={14} />
      </button>
      {expanded &&
        items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className="nav__link"
            onClick={onNavigate}
          >
            <Icon name={item.icon} size={18} />
            {item.label}
          </NavLink>
        ))}
    </div>
  );
}

function UserMenu() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  return (
    <DropdownMenu
      placement="top-start"
      style={{ minWidth: 220 }}
      trigger={
        <button type="button" className="btn btn--ghost btn--secondary nav__user">
          <span className="nav__initials">{userInitials(user.name)}</span>
          <span className="grow ellipsis" style={{ textAlign: "left", fontSize: 14, fontWeight: 500 }}>
            {user.name}
          </span>
          <Icon name="chevrondown" size={16} />
        </button>
      }
      items={[{ label: "Settings", icon: "cog", onSelect: () => navigate("/settings") }]}
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const title = pageTitleFromPath(pathname);
  // Reports scrolls edge to edge so its scrollbar sits flush on the right.
  const flushX = pathname === "/reports";

  const navContent = (onNavigate?: () => void) => (
    <>
      {NAV_GROUPS.map((g) => (
        <NavGroup key={g.label} label={g.label} items={g.items} onNavigate={onNavigate} />
      ))}
      {isMobile && (
        <NavGroup
          label={MOBILE_EXTRA_GROUP.label}
          items={MOBILE_EXTRA_GROUP.items}
          onNavigate={onNavigate}
        />
      )}
    </>
  );

  return (
    <div className="shell">
      {!isMobile && (
        <nav className="nav" aria-label="Main">
          <div className="nav__logo">
            <Logo />
          </div>
          {navContent()}
          <div className="nav__footer">
            <UserMenu />
          </div>
        </nav>
      )}

      <div className="main">
        <header className="header">
          {isMobile && (
            <Button
              icon="hamburger"
              variant="ghost"
              themeColor="secondary"
              onClick={() => setNavOpen(true)}
            />
          )}
          <div className="header__title">{title}</div>
          {/* The TimerBar lives in the header so it stays mounted across
              navigations — that keeps the running stopwatch ticking when the
              user jumps to Reports/Manage and back. */}
          {!isMobile && <TimerBar />}
        </header>
        <main className={flushX ? "content content--flush-x" : "content"}>{children}</main>
      </div>

      {isMobile && (
        <Drawer open={navOpen} onClose={() => setNavOpen(false)} title="Navigation">
          <nav className="mobile-nav" aria-label="Main">
            <div className="nav__logo">
              <Logo />
            </div>
            {navContent(() => setNavOpen(false))}
          </nav>
        </Drawer>
      )}
    </div>
  );
}
