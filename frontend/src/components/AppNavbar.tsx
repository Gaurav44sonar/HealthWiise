import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    LayoutDashboard,
    Dumbbell,
    Utensils,
    Droplets,
    Moon,
    Sparkles,
    CalendarDays,
    Flower2,
    LogOut,
    Menu,
    X,
    HeartPulse,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface AppNavbarProps {
    theme?: "mens" | "womens";
}

export default function AppNavbar({ theme }: AppNavbarProps) {
    const { user, logout } = useAuth();
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isWomens = theme ? theme === "womens" : user?.dashboard_type === "womens";
    const activeTheme: "mens" | "womens" = isWomens ? "womens" : "mens";
    const homePath = isWomens ? "/womens/dashboard" : "/mens/dashboard";

    const navLinks = [
        {
            to: homePath,
            label: "Dashboard",
            icon: LayoutDashboard,
            activeMatch: homePath,
            exact: true,
        },
        {
            to: "/shared/fitness",
            label: "Fitness",
            icon: Dumbbell,
            activeMatch: "/shared/fitness",
            exact: false,
        },
        {
            to: "/shared/nutrition",
            label: "Nutrition",
            icon: Utensils,
            activeMatch: "/shared/nutrition",
            exact: false,
        },
        {
            to: "/shared/hydration",
            label: "Hydration",
            icon: Droplets,
            activeMatch: "/shared/hydration",
            exact: false,
        },
        {
            to: "/shared/sleep",
            label: "Sleep",
            icon: Moon,
            activeMatch: "/shared/sleep",
            exact: false,
        },
        ...(isWomens
            ? [
                  {
                      to: "/shared/cycle",
                      label: "Cycle",
                      icon: Flower2,
                      activeMatch: "/shared/cycle",
                      exact: false,
                  },
              ]
            : []),
        {
            to: "/shared/wellness",
            label: "Insights",
            icon: Sparkles,
            activeMatch: "/shared/wellness",
            exact: false,
        },
        {
            to: "/shared/plan",
            label: "AI Plan",
            icon: CalendarDays,
            activeMatch: "/shared/plan",
            exact: false,
        },
    ];

    const getInitials = (name?: string) => {
        if (!name) return "HW";
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    return (
        <header className={`app-navbar ${activeTheme}-theme`}>
            <div className="app-navbar-container">
                {/* Brand / Logo */}
                <div className="app-navbar-brand-section">
                    <Link to={homePath} className="app-navbar-brand" title="Go to Dashboard">
                        <div className="app-navbar-logo-bubble">
                            <HeartPulse size={18} />
                        </div>
                        <span className="app-navbar-title">HealthWiise</span>
                    </Link>
                    <span className="app-navbar-badge">
                        {isWomens ? "Women's Health" : "Men's Wellness"}
                    </span>
                </div>

                {/* Desktop Nav Links */}
                <nav className="app-navbar-links" aria-label="Main Navigation">
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = link.exact
                            ? location.pathname === link.activeMatch
                            : location.pathname.startsWith(link.activeMatch);
                        return (
                            <Link
                                key={link.to}
                                to={link.to}
                                className={`app-navbar-link ${isActive ? "active" : ""}`}
                            >
                                <Icon size={15} />
                                <span>{link.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Right: User Profile & Logout */}
                <div className="app-navbar-user-section">
                    <div className="app-navbar-user-pill" title={user?.email || ""}>
                        <div className="app-navbar-avatar">
                            {getInitials(user?.name)}
                        </div>
                        <div className="app-navbar-user-info">
                            <span className="app-navbar-user-name">
                                {user?.name || "Member"}
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="app-navbar-signout-btn"
                        onClick={logout}
                        title="Sign out of HealthWiise"
                    >
                        <LogOut size={15} />
                        <span>Sign out</span>
                    </button>

                    {/* Mobile Hamburger Button */}
                    <button
                        type="button"
                        className="app-navbar-mobile-toggle"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        aria-label="Toggle navigation menu"
                    >
                        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                </div>
            </div>

            {/* Mobile Drawer / Menu */}
            {mobileMenuOpen && (
                <div className="app-navbar-mobile-menu">
                    <div className="app-navbar-mobile-user">
                        <div className="app-navbar-avatar large">
                            {getInitials(user?.name)}
                        </div>
                        <div>
                            <strong>{user?.name || "Member"}</strong>
                            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                                {user?.email}
                            </p>
                        </div>
                    </div>

                    <div className="app-navbar-mobile-links">
                        {navLinks.map((link) => {
                            const Icon = link.icon;
                            const isActive = link.exact
                                ? location.pathname === link.activeMatch
                                : location.pathname.startsWith(link.activeMatch);
                            return (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    className={`app-navbar-mobile-link ${isActive ? "active" : ""}`}
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    <Icon size={18} />
                                    <span>{link.label}</span>
                                </Link>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        className="app-navbar-mobile-signout"
                        onClick={() => {
                            setMobileMenuOpen(false);
                            logout();
                        }}
                    >
                        <LogOut size={16} />
                        <span>Sign out</span>
                    </button>
                </div>
            )}
        </header>
    );
}
