import { useState, useEffect } from "react";
import Home               from "./pages/Home";
import Shop               from "./pages/Shop";
import Dashboard          from "./pages/Dashboard";
import Orders             from "./pages/Orders";
import Login              from "./pages/Login";
import Register           from "./pages/Register";
import Success            from "./pages/Success";
import AgentDashboard     from "./pages/AgentDashboard";
import AgentPricing       from "./pages/AgentPricing";
import AgentStore         from "./pages/AgentStore";
import AgentWithdraw      from "./pages/AgentWithdraw";
import AdminWithdrawals   from "./pages/AdminWithdrawals";
import StorePage          from "./pages/StorePage";
import OrderTracking      from "./pages/OrderTracking";
import ETATrack           from "./pages/ETATrack";
import AgentBuyData       from "./pages/AgentBuyData";
import AgentDeposit       from "./pages/AgentDeposit";
import ForgotPassword     from "./pages/ForgotPassword";
import Checkers           from "./pages/Checkers";

export default function App() {
    const [page, setPage]         = useState("home");
    const [menuOpen, setMenuOpen] = useState(false);
    const [user, setUser]         = useState(null);

    const theme = "dark";

    // =========================
    // INITIAL LOAD
    // =========================
    useEffect(() => {
        const savedUser = localStorage.getItem("user");
        if (savedUser) {
            try {
                const parsed = JSON.parse(savedUser);
                setUser(parsed);

                // FIX: re-sync agentToken to sessionStorage on every page load/refresh
                // so all components that read sessionStorage also get a valid token
                if (parsed?.agent_token) {
                    sessionStorage.setItem("agentToken", parsed.agent_token);
                    localStorage.setItem("agentToken",   parsed.agent_token);
                }
            } catch {
                localStorage.removeItem("user");
            }
        }

        detectRoute();

        window.addEventListener("popstate", detectRoute);
        return () => window.removeEventListener("popstate", detectRoute);
    }, []);

    // Close sidebar on Escape key
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // =========================
    // ROUTE DETECTOR
    // =========================
    const detectRoute = () => {
        const path = window.location.pathname;

        if (path.startsWith("/store/")) {
            setPage("store");
            return;
        }

        const routeMap = {
            "/":                   "home",
            "/shop":               "shop",
            "/checkers":           "checkers",
            "/orders":             "orders",
            "/dashboard":          "dashboard",
            "/login":              "login",
            "/register":           "register",
            "/success":            "success",
            "/agent-dashboard":    "agent-dashboard",
            "/agent-pricing":      "agent-pricing",
            "/agent-store":        "agent-store",
            "/agent-withdraw":     "agent-withdraw",
            "/agent-buy-data":     "agent-buy-data",
            "/agent-deposit":      "agent-deposit",
            "/admin-withdrawals":  "admin-withdrawals",
            "/track":              "track-order",
            "/eta-track":          "eta-track",
            "/forgot-password":    "forgot-password",
        };

        setPage(routeMap[path] || "home");
    };

    const isAgentActive = user?.role === "agent" && user?.agent_status === "approved";
    const isAdmin       = user?.role === "admin";

    // =========================
    // LOGOUT
    // =========================
    const logout = () => {
        // FIX: explicitly clear both storages so no stale token lingers
        localStorage.clear();
        sessionStorage.removeItem("agentToken");
        setUser(null);
        navigate("home");
    };

    // =========================
    // NAVIGATE
    // =========================
    const navigate = (target) => {
        setMenuOpen(false);
        setPage(target);

        const routes = {
            home:               "/",
            shop:               "/shop",
            checkers:           "/checkers",
            orders:             "/orders",
            dashboard:          "/dashboard",
            login:              "/login",
            register:           "/register",
            success:            "/success",
            "agent-dashboard":  "/agent-dashboard",
            "agent-pricing":    "/agent-pricing",
            "agent-store":      "/agent-store",
            "agent-withdraw":   "/agent-withdraw",
            "agent-buy-data":   "/agent-buy-data",
            "agent-deposit":    "/agent-deposit",
            "admin-withdrawals":"/admin-withdrawals",
            store:              "/store",
            "track-order":      "/track",
            "eta-track":        "/eta-track",
            "order-tracking":   "/eta-track",
            "forgot-password":  "/forgot-password",
        };

        window.history.pushState({}, "", routes[target] || "/");
    };

    // =========================
    // PAGE RENDER
    // =========================
    const renderPage = () => {
        switch (page) {
            case "home":
                return <Home setPage={navigate} theme={theme} />;
            case "shop":
                return <Shop user={user} theme={theme} />;
            case "checkers":
                return <Checkers user={user} theme={theme} />;
            case "orders":
                return <Orders user={user} theme={theme} />;
            case "login":
                return <Login setUser={setUser} setPage={navigate} theme={theme} />;
            case "register":
                return <Register setPage={navigate} theme={theme} />;
            case "dashboard":
                return <Dashboard user={user} setPage={navigate} theme={theme} />;
            case "agent-dashboard":
                return <AgentDashboard user={user} setPage={navigate} theme={theme} />;
            case "agent-pricing":
                return <AgentPricing user={user} setPage={navigate} />;
            case "agent-store":
                return <AgentStore user={user} setPage={navigate} />;
            case "agent-withdraw":
                return <AgentWithdraw user={user} setPage={navigate} />;
            case "agent-buy-data":
                return <AgentBuyData user={user} setPage={navigate} />;
            case "agent-deposit":
                return <AgentDeposit user={user} setPage={navigate} />;
            case "admin-withdrawals":
                return <AdminWithdrawals user={user} setPage={navigate} />;
            case "store":
                return <StorePage setPage={navigate} theme={theme} />;
            case "track-order":
                return <OrderTracking user={user} setPage={navigate} />;
            case "success":
                return <Success theme={theme} />;
            case "eta-track":
            case "order-tracking":
                return <ETATrack setPage={navigate} />;
            case "forgot-password":
                return <ForgotPassword setPage={navigate} />;
            default:
                return <Home setPage={navigate} theme={theme} />;
        }
    };

    return (
        <div style={appStyle}>
            {/* Background overlay */}
            <div style={overlayStyle} />

            <div style={{ position: "relative", zIndex: 2 }}>

                {/* ======= NAVBAR ======= */}
                <nav style={navStyle}>
                    {/* LOGO + BRAND */}
                    <div style={logoWrap} onClick={() => navigate("home")}>
                        <img
                            src="/evosdata.png"
                            alt="EVOS Logo"
                            style={logoImg}
                            onError={(e) => { e.target.style.display = "none"; }}
                        />
                        <div style={brandText}>
                            <span style={brandName}>EVOSDATA</span>
                            <span style={brandSub}>by EVOS Business HUB</span>
                        </div>
                    </div>

                    {/* HAMBURGER / CLOSE */}
                    <button
                        style={menuIconStyle}
                        onClick={() => setMenuOpen(!menuOpen)}
                        aria-label="Toggle menu"
                    >
                        <span style={burgerLine(menuOpen, 0)} />
                        <span style={burgerLine(menuOpen, 1)} />
                        <span style={burgerLine(menuOpen, 2)} />
                    </button>
                </nav>

                {/* ======= SIDEBAR OVERLAY (dim background) ======= */}
                {menuOpen && (
                    <div style={sidebarOverlay} onClick={() => setMenuOpen(false)} />
                )}

                {/* ======= SIDEBAR ======= */}
                <div style={sidebar(menuOpen)}>

                    {/* Sidebar header */}
                    <div style={sidebarHeader}>
                        <div style={sidebarBrand}>
                            <img
                                src="/evosdata.png"
                                alt="EVOS Logo"
                                style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 8 }}
                                onError={(e) => { e.target.style.display = "none"; }}
                            />
                            <div>
                                <div style={{ color: "#38bdf8", fontWeight: 900, fontSize: 15, letterSpacing: "0.5px" }}>EVOSDATA</div>
                                <div style={{ color: "#475569", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>by EVOS Business HUB</div>
                            </div>
                        </div>
                        <button style={sidebarCloseBtn} onClick={() => setMenuOpen(false)}>✕</button>
                    </div>

                    {/* User badge */}
                    {user && (
                        <div style={sidebarUserBadge}>
                            <div style={sidebarAvatar}>{user.username?.[0]?.toUpperCase() || "U"}</div>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: 13, color: "#f1f5f9" }}>@{user.username}</div>
                                <div style={{ fontSize: 11, color: isAgentActive ? "#22c55e" : "#64748b", fontWeight: 600 }}>
                                    {isAgentActive ? "✅ Active Agent" : isAdmin ? "🛠 Admin" : "Customer"}
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={sidebarDivider} />

                    {/* MAIN NAV */}
                    <div style={sidebarSection}>
                        <div style={sidebarSectionLabel}>Main</div>
                        {[
                            { icon: "🏠", label: "Home",         target: "home"       },
                            { icon: "🛒", label: "Buy Data",     target: "shop"       },
                            { icon: "📦", label: "My Orders",    target: "orders"     },
                            { icon: "📊", label: "Dashboard",    target: "dashboard"  },
                            { icon: "📍", label: "Track Order",  target: "eta-track"  },
                        ].map((item) => (
                            <button
                                key={item.target}
                                style={sidebarBtn(page === item.target)}
                                onClick={() => navigate(item.target)}
                            >
                                <span style={sidebarBtnIcon}>{item.icon}</span>
                                {item.label}
                            </button>
                        ))}
                        <button
                            style={sidebarBtnGreen(page === "checkers")}
                            onClick={() => navigate("checkers")}
                        >
                            <span style={sidebarBtnIcon}>🎓</span>
                            Result Checkers
                        </button>
                    </div>

                    {/* AGENT NAV */}
                    {user && (
                        <>
                            <div style={sidebarDivider} />
                            <div style={sidebarSection}>
                                <div style={sidebarSectionLabel}>Agent</div>
                                <button
                                    style={sidebarBtn(page === "agent-dashboard")}
                                    onClick={() => navigate("agent-dashboard")}
                                >
                                    <span style={sidebarBtnIcon}>🚀</span>
                                    {isAgentActive ? "Agent Dashboard" : "Become Agent"}
                                </button>
                                {isAgentActive && (
                                    <>
                                        <button
                                            style={sidebarBtn(page === "agent-buy-data")}
                                            onClick={() => navigate("agent-buy-data")}
                                        >
                                            <span style={sidebarBtnIcon}>📡</span>
                                            Buy Data (Base Price)
                                        </button>
                                        <button
                                            style={sidebarBtn(page === "agent-pricing")}
                                            onClick={() => navigate("agent-pricing")}
                                        >
                                            <span style={sidebarBtnIcon}>💰</span>
                                            Manage Pricing
                                        </button>
                                        <button
                                            style={sidebarBtn(page === "agent-withdraw")}
                                            onClick={() => navigate("agent-withdraw")}
                                        >
                                            <span style={sidebarBtnIcon}>💳</span>
                                            Withdraw Funds
                                        </button>
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {/* ADMIN NAV */}
                    {isAdmin && (
                        <>
                            <div style={sidebarDivider} />
                            <div style={sidebarSection}>
                                <div style={sidebarSectionLabel}>Admin</div>
                                <button
                                    style={sidebarBtn(page === "admin-withdrawals")}
                                    onClick={() => navigate("admin-withdrawals")}
                                >
                                    <span style={sidebarBtnIcon}>🛠</span>
                                    Withdrawals
                                </button>
                            </div>
                        </>
                    )}

                    {/* AUTH */}
                    <div style={{ marginTop: "auto" }}>
                        <div style={sidebarDivider} />
                        <div style={{ padding: "12px 16px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
                            {user ? (
                                <button style={sidebarLogoutBtn} onClick={logout}>
                                    🚪 Sign Out
                                </button>
                            ) : (
                                <>
                                    <button style={sidebarBtn(false)} onClick={() => navigate("login")}>
                                        <span style={sidebarBtnIcon}>🔑</span> Login
                                    </button>
                                    <button style={sidebarPrimaryBtn} onClick={() => navigate("register")}>
                                        ✨ Register
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ======= PAGE CONTENT ======= */}
                <main style={contentStyle}>
                    {renderPage()}
                </main>
            </div>
        </div>
    );
}

/* ================= STYLES ================= */

const appStyle = {
    minHeight:           "100vh",
    fontFamily:          "ui-sans-serif, system-ui, Arial",
    backgroundImage:     "url('/evosdata.png')",
    backgroundSize:      "cover",
    backgroundPosition:  "center",
    backgroundRepeat:    "no-repeat",
    backgroundColor:     "#020617",
    color:               "#e5e7eb",
};

const overlayStyle = {
    position:       "fixed",
    inset:          0,
    background:     "rgba(2,6,23,0.82)",
    zIndex:         0,
    pointerEvents:  "none",
};

const navStyle = {
    display:            "flex",
    justifyContent:     "space-between",
    alignItems:         "center",
    padding:            "10px 16px",
    position:           "sticky",
    top:                0,
    zIndex:             200,
    backdropFilter:     "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    background:         "rgba(2,6,23,0.75)",
    borderBottom:       "1px solid rgba(56,189,248,0.12)",
    boxShadow:          "0 2px 20px rgba(0,0,0,0.4)",
};

const logoWrap = {
    display:    "flex",
    alignItems: "center",
    gap:        10,
    cursor:     "pointer",
};

const logoImg = {
    width:        36,
    height:       36,
    objectFit:    "contain",
    borderRadius: 8,
};

const brandText = {
    display:       "flex",
    flexDirection: "column",
    lineHeight:    1.2,
};

const brandName = {
    color:         "#38bdf8",
    fontWeight:    900,
    fontSize:      16,
    letterSpacing: "1px",
};

const brandSub = {
    color:          "#475569",
    fontSize:       9,
    fontWeight:     600,
    letterSpacing:  "0.5px",
    textTransform:  "uppercase",
};

const menuIconStyle = {
    width:          38,
    height:         38,
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    gap:            5,
    borderRadius:   10,
    background:     "rgba(255,255,255,0.06)",
    border:         "1px solid rgba(255,255,255,0.08)",
    cursor:         "pointer",
    padding:        0,
};

const burgerLine = (open, index) => {
    const base = {
        display:         "block",
        width:           18,
        height:          2,
        borderRadius:    2,
        background:      "#e5e7eb",
        transition:      "all 0.25s ease",
        transformOrigin: "center",
    };
    if (open) {
        if (index === 0) return { ...base, transform: "translateY(7px) rotate(45deg)"  };
        if (index === 1) return { ...base, opacity: 0, transform: "scaleX(0)"          };
        if (index === 2) return { ...base, transform: "translateY(-7px) rotate(-45deg)"};
    }
    return base;
};

const sidebarOverlay = {
    position:       "fixed",
    inset:          0,
    background:     "rgba(0,0,0,0.55)",
    zIndex:         299,
    backdropFilter: "blur(2px)",
};

const sidebar = (open) => ({
    position:           "fixed",
    top:                0,
    right:              0,
    height:             "100vh",
    width:              280,
    background:         "rgba(10,15,30,0.98)",
    backdropFilter:     "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderLeft:         "1px solid rgba(56,189,248,0.12)",
    boxShadow:          open ? "-8px 0 40px rgba(0,0,0,0.6)" : "none",
    zIndex:             300,
    transform:          open ? "translateX(0)" : "translateX(100%)",
    transition:         "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    display:            "flex",
    flexDirection:      "column",
    overflowY:          "auto",
});

const sidebarHeader = {
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "center",
    padding:        "16px 16px 12px",
    borderBottom:   "1px solid rgba(255,255,255,0.06)",
    flexShrink:     0,
};

const sidebarBrand = {
    display:    "flex",
    alignItems: "center",
    gap:        10,
};

const sidebarCloseBtn = {
    width:          32,
    height:         32,
    borderRadius:   8,
    border:         "1px solid rgba(255,255,255,0.08)",
    background:     "rgba(255,255,255,0.05)",
    color:          "#94a3b8",
    fontSize:       13,
    cursor:         "pointer",
    fontWeight:     800,
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
};

const sidebarUserBadge = {
    display:    "flex",
    alignItems: "center",
    gap:        10,
    margin:     "12px 16px 0",
    padding:    "10px 12px",
    borderRadius: 12,
    background: "rgba(56,189,248,0.06)",
    border:     "1px solid rgba(56,189,248,0.12)",
};

const sidebarAvatar = {
    width:          36,
    height:         36,
    borderRadius:   "50%",
    background:     "linear-gradient(135deg, #38bdf8, #6366f1)",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    fontWeight:     900,
    fontSize:       15,
    color:          "white",
    flexShrink:     0,
};

const sidebarDivider = {
    height:     1,
    background: "rgba(255,255,255,0.05)",
    margin:     "10px 16px",
    flexShrink: 0,
};

const sidebarSection = {
    padding:       "0 10px",
    display:       "flex",
    flexDirection: "column",
    gap:           2,
};

const sidebarSectionLabel = {
    fontSize:      10,
    fontWeight:    800,
    color:         "#334155",
    textTransform: "uppercase",
    letterSpacing: "1px",
    padding:       "6px 6px 4px",
};

const sidebarBtn = (active) => ({
    display:    "flex",
    alignItems: "center",
    gap:        10,
    padding:    "10px 12px",
    borderRadius: 10,
    border:     active ? "1px solid rgba(56,189,248,0.25)" : "1px solid transparent",
    background: active ? "rgba(56,189,248,0.1)" : "transparent",
    color:      active ? "#38bdf8" : "#94a3b8",
    fontSize:   14,
    fontWeight: active ? 800 : 600,
    cursor:     "pointer",
    textAlign:  "left",
    width:      "100%",
    transition: "all 0.15s",
});

const sidebarBtnGreen = (active) => ({
    display:    "flex",
    alignItems: "center",
    gap:        10,
    padding:    "10px 12px",
    borderRadius: 10,
    border:     active ? "1px solid rgba(34,197,94,0.3)" : "1px solid transparent",
    background: active ? "rgba(34,197,94,0.12)" : "transparent",
    color:      active ? "#22c55e" : "#94a3b8",
    fontSize:   14,
    fontWeight: active ? 800 : 600,
    cursor:     "pointer",
    textAlign:  "left",
    width:      "100%",
    transition: "all 0.15s",
});

const sidebarBtnIcon = {
    fontSize:   16,
    flexShrink: 0,
    width:      20,
    textAlign:  "center",
};

const sidebarLogoutBtn = {
    display:    "flex",
    alignItems: "center",
    gap:        10,
    width:      "100%",
    padding:    "11px 14px",
    borderRadius: 10,
    border:     "1px solid rgba(239,68,68,0.25)",
    background: "rgba(239,68,68,0.08)",
    color:      "#f87171",
    fontWeight: 700,
    fontSize:   14,
    cursor:     "pointer",
    textAlign:  "left",
};

const sidebarPrimaryBtn = {
    width:        "100%",
    padding:      "11px 14px",
    borderRadius: 10,
    border:       "none",
    background:   "linear-gradient(135deg, #38bdf8, #0ea5e9)",
    color:        "#000",
    fontWeight:   800,
    fontSize:     14,
    cursor:       "pointer",
};

const contentStyle = {
    padding:   0,
    maxWidth:  1200,
    margin:    "0 auto",
};
