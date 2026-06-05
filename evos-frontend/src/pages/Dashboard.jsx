import { useEffect, useState } from "react";

export default function Dashboard({ setPage, user }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    total_orders: 0,
    my_orders: 0,
    my_successful_orders: 0,
    transactions: [],
  });

  const isAgentActive =
    user?.role === "agent" && user?.agent_status === "approved";

  useEffect(() => {
    if (!user) setPage("login");
  }, [user, setPage]);

  useEffect(() => {
    if (!user?.id) return;
    const loadDashboard = async () => {
      try {
        const res = await fetch(`https://api.evosdata.xyz/today/${user.id}`);
        const data = await res.json();
        setStats({
          total_orders: data.global.total_orders || 0,
          my_orders: data.user.my_orders || 0,
          my_successful_orders: data.user.my_successful_orders || 0,
          transactions: data.user.transactions || [],
        });
      } catch (error) {
        console.log("Dashboard error:", error);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [user]);

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("email");
    setPage("login");
  };

  const handleAgentAccess = () => {
    if (isAgentActive) {
      setPage("agent-dashboard");
    } else {
      setSupportOpen(true);
    }
    setMenuOpen(false);
  };

  const statusColor = (status) => {
    if (["successful", "delivered"].includes(status)) return "#22c55e";
    if (status === "processing") return "#a78bfa";
    if (status === "paid") return "#38bdf8";
    if (status === "failed") return "#ef4444";
    return "#f59e0b";
  };

  const statusIcon = (status) => {
    if (["successful", "delivered"].includes(status)) return "🎉";
    if (status === "processing") return "📡";
    if (status === "paid") return "✅";
    if (status === "failed") return "❌";
    return "⏳";
  };

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.brand}>EVOS HUB</div>
          <div style={styles.onlineDot} />
        </div>
        <button style={styles.menuBtn} onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </button>
      </div>

      {/* SIDEBAR */}
      <div style={{ ...styles.sidebar, left: menuOpen ? "0" : "-290px" }}>
        <div style={styles.sideHeader}>
          <div style={styles.sideAvatar}>
            {(user?.username || "U")[0].toUpperCase()}
          </div>
          <div>
            <div style={styles.sideUsername}>@{user?.username}</div>
            <div style={styles.sideRole}>
              {isAgentActive ? "🟢 Agent" : "👤 Member"}
            </div>
          </div>
        </div>

        <div style={styles.navWrap}>
          {[
            { icon: "🛒", label: "Buy Data", page: "shop" },
            { icon: "📋", label: "My Orders", page: "orders" },
            { icon: "📦", label: "Track Order", page: "eta-track" },
          ].map((item, i) => (
            <button key={i} style={styles.navBtn}
              onClick={() => { setPage(item.page); setMenuOpen(false); }}>
              <span style={styles.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}

          <button style={styles.agentBtn} onClick={handleAgentAccess}>
            <span style={styles.navIcon}>🚀</span>
            {isAgentActive ? "Agent Dashboard" : "Become Agent"}
          </button>

          <div style={styles.sideDiv} />

          <button style={styles.logoutBtn} onClick={logout}>
            <span style={styles.navIcon}>🚪</span>
            Sign Out
          </button>
        </div>

        <div style={styles.sidePowered}>Powered by EVOS Technologies</div>
      </div>

      {menuOpen && (
        <div style={styles.overlay} onClick={() => setMenuOpen(false)} />
      )}

      {/* MAIN */}
      <div style={styles.main}>

        {/* WELCOME */}
        <div style={styles.welcomeCard}>
          <div style={styles.welcomeLeft}>
            <div style={styles.welcomeGreeting}>Good day 👋</div>
            <h1 style={styles.welcomeName}>
              {user?.username || user?.email}
            </h1>
            <div style={styles.onlineStatus}>
              <div style={styles.greenDot} />
              <span style={styles.onlineText}>System Online</span>
            </div>
          </div>
          <div style={styles.welcomeEmoji}>🌟</div>
        </div>

        {/* STATS */}
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTag}>📊</span>
          <h2 style={styles.sectionTitle}>Your Overview</h2>
        </div>

        {loading ? (
          <div style={styles.loadingWrap}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
            <p style={styles.loadingText}>Loading your data...</p>
          </div>
        ) : (
          <div style={styles.statsGrid}>
            {[
              { icon: "🌍", label: "Global Orders", val: stats.total_orders, color: "#38bdf8", bg: "rgba(56,189,248,0.1)", border: "rgba(56,189,248,0.25)" },
              { icon: "🛒", label: "My Orders", val: stats.my_orders, color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.25)" },
              { icon: "✅", label: "Successful", val: stats.my_successful_orders, color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" },
              { icon: "💳", label: "Transactions", val: stats.transactions.length, color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
            ].map((s, i) => (
              <div key={i} style={{ ...styles.statCard, background: s.bg, border: `1px solid ${s.border}` }}>
                <div style={styles.statIcon}>{s.icon}</div>
                <div style={{ ...styles.statVal, color: s.color }}>{s.val}</div>
                <div style={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* QUICK ACTIONS */}
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTag}>⚡</span>
          <h2 style={styles.sectionTitle}>Quick Actions</h2>
        </div>

        <div style={styles.actionsGrid}>
          {[
            { icon: "🛒", label: "Buy Data", desc: "MTN, Telecel, AirtelTigo", page: "shop", color: "#38bdf8", bg: "rgba(56,189,248,0.1)", border: "rgba(56,189,248,0.25)" },
            { icon: "📋", label: "My Orders", desc: "View transaction history", page: "orders", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.25)" },
            { icon: "📦", label: "Track Order", desc: "Check delivery status", page: "eta-track", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
            {
              icon: isAgentActive ? "🚀" : "🤝",
              label: isAgentActive ? "Agent Hub" : "Become Agent",
              desc: isAgentActive ? "Manage store & earnings" : "Earn on every sale",
              action: handleAgentAccess,
              color: "#22c55e",
              bg: "rgba(34,197,94,0.1)",
              border: "rgba(34,197,94,0.25)",
            },
          ].map((a, i) => (
            <div
              key={i}
              style={{ ...styles.actionCard, background: a.bg, border: `1px solid ${a.border}` }}
              onClick={() => a.action ? a.action() : setPage(a.page)}
            >
              <div style={{ ...styles.actionIcon, color: a.color }}>{a.icon}</div>
              <div style={{ ...styles.actionLabel, color: a.color }}>{a.label}</div>
              <div style={styles.actionDesc}>{a.desc}</div>
              <div style={{ ...styles.actionArrow, color: a.color }}>→</div>
            </div>
          ))}
        </div>

        {/* RECENT TRANSACTIONS */}
        {!loading && stats.transactions.length > 0 && (
          <>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTag}>📋</span>
              <h2 style={styles.sectionTitle}>Recent Orders</h2>
            </div>

            {stats.transactions.slice(0, 5).map((tx, i) => (
              <div key={i} style={styles.txCard}>
                <div style={{
                  ...styles.txIconWrap,
                  background: statusColor(tx.status) + "22",
                }}>
                  <span style={{ fontSize: 18 }}>{statusIcon(tx.status)}</span>
                </div>
                <div style={styles.txInfo}>
                  <div style={styles.txNetwork}>{tx.network} · {tx.amount?.split(" - ")[0]}</div>
                  <div style={styles.txPhone}>{tx.phone_number}</div>
                </div>
                <div style={{
                  ...styles.txStatus,
                  color: statusColor(tx.status),
                  background: statusColor(tx.status) + "22",
                  border: `1px solid ${statusColor(tx.status)}44`,
                }}>
                  {tx.status}
                </div>
              </div>
            ))}
          </>
        )}

        {/* FOOTER */}
        <div style={styles.footer}>
          © 2026 EVOS Technologies · All rights reserved
        </div>
      </div>

      {/* FLOATING SUPPORT */}
      <div style={styles.floatWrap}>
        {chatOpen && (
          <div style={styles.chatPopup}>
            <div style={styles.chatHeader}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#e5e7eb" }}>💬 EVOS Support</span>
              <button style={styles.chatClose} onClick={() => setChatOpen(false)}>✕</button>
            </div>
            <p style={styles.chatMsg}>Hi! How can we help you today? 👇</p>
            <div style={styles.chatOptions}>
              <button style={styles.chatOption}
                onClick={() => window.open("https://wa.me/233208718943", "_blank")}>
                💬 WhatsApp Chat
              </button>
              <button style={styles.chatOption}
                onClick={() => window.open("https://whatsapp.com/channel/0029VaTrnsZEgGfFXkIcjt1M", "_blank")}>
                👥 Community
              </button>
              <button style={styles.chatOption}
                onClick={() => window.location.href = "mailto:support@evosdata.xyz"}>
                📧 Email Support
              </button>
            </div>
          </div>
        )}
        <button style={styles.floatBtn} onClick={() => setChatOpen(!chatOpen)}>
          {chatOpen ? "✕" : "💬"}
        </button>
      </div>

      {/* SUPPORT MODAL */}
      {supportOpen && (
        <>
          <div style={styles.modalOverlay} onClick={() => setSupportOpen(false)} />
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>🤝 Become an Agent</h2>
            <p style={styles.modalDesc}>
              You need 20 successful orders to qualify. Contact us to get onboarded.
            </p>
            <div style={styles.modalOptions}>
              <div style={styles.helpCard}
                onClick={() => window.open("https://wa.me/233208718943?text=Hi, I'd like to become an EVOS agent", "_blank")}>
                💬 WhatsApp Support
              </div>
              <div style={styles.helpCard}
                onClick={() => window.location.href = "mailto:support@evosdata.xyz"}>
                📧 Email Support
              </div>
            </div>
            <button style={styles.closeBtn} onClick={() => setSupportOpen(false)}>
              Close
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    color: "#e5e7eb",
    fontFamily: "ui-sans-serif, system-ui, Arial",
  },

  // HEADER
  header: {
    height: 64,
    padding: "0 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 1000,
    background: "rgba(15,23,42,0.85)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  brand: { color: "#38bdf8", fontWeight: 900, fontSize: 20 },
  onlineDot: {
    width: 8, height: 8, borderRadius: "50%",
    background: "#22c55e",
    boxShadow: "0 0 6px rgba(34,197,94,0.6)",
  },
  menuBtn: {
    width: 44, height: 44, border: "none", borderRadius: 12,
    background: "rgba(56,189,248,0.12)", color: "#38bdf8",
    cursor: "pointer", fontSize: 18,
  },

  // SIDEBAR
  sidebar: {
    position: "fixed",
    top: 0,
    width: 270,
    height: "100vh",
    padding: "24px 18px",
    zIndex: 1200,
    transition: "left 0.3s ease",
    background: "#020617",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
  },
  sideHeader: {
    display: "flex", alignItems: "center", gap: 12,
    marginBottom: 28, paddingBottom: 20,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  sideAvatar: {
    width: 44, height: 44, borderRadius: "50%",
    background: "linear-gradient(135deg, #38bdf8, #a78bfa)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: 18, color: "#000", flexShrink: 0,
  },
  sideUsername: { fontWeight: 800, fontSize: 15, color: "#f1f5f9" },
  sideRole: { fontSize: 12, color: "#64748b", marginTop: 3 },
  navWrap: { display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  navBtn: {
    padding: "13px 14px", borderRadius: 14,
    background: "rgba(255,255,255,0.04)", color: "#e5e7eb",
    fontWeight: 700, textAlign: "left", cursor: "pointer",
    fontSize: 14, display: "flex", alignItems: "center", gap: 10,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  navIcon: { fontSize: 18 },
  agentBtn: {
    padding: "13px 14px", borderRadius: 14,
    background: "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(167,139,250,0.15))",
    border: "1px solid rgba(56,189,248,0.3)",
    color: "#38bdf8", fontWeight: 900, textAlign: "left",
    cursor: "pointer", fontSize: 14,
    display: "flex", alignItems: "center", gap: 10,
  },
  sideDiv: { height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 0" },
  logoutBtn: {
    padding: "13px 14px", borderRadius: 14,
    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
    color: "#ef4444", fontWeight: 800, textAlign: "left",
    cursor: "pointer", fontSize: 14,
    display: "flex", alignItems: "center", gap: 10,
  },
  sidePowered: { fontSize: 11, color: "#334155", textAlign: "center", paddingTop: 16 },

  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.6)", zIndex: 1100,
  },

  // MAIN
  main: { padding: "20px 18px 80px", maxWidth: 600, margin: "0 auto" },

  // WELCOME
  welcomeCard: {
    background: "linear-gradient(135deg, rgba(56,189,248,0.12), rgba(167,139,250,0.08))",
    border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 22, padding: "22px 20px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 24,
  },
  welcomeLeft: {},
  welcomeGreeting: { fontSize: 13, color: "#64748b", fontWeight: 600, marginBottom: 4 },
  welcomeName: { fontSize: 22, fontWeight: 900, color: "#f1f5f9", margin: "0 0 10px" },
  onlineStatus: { display: "flex", alignItems: "center", gap: 6 },
  greenDot: {
    width: 8, height: 8, borderRadius: "50%",
    background: "#22c55e", boxShadow: "0 0 6px rgba(34,197,94,0.5)",
  },
  onlineText: { fontSize: 12, color: "#22c55e", fontWeight: 700 },
  welcomeEmoji: { fontSize: 44 },

  // SECTION HEADER
  sectionHeader: {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
  },
  sectionTag: { fontSize: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 900, color: "#f1f5f9", margin: 0 },

  // LOADING
  loadingWrap: { textAlign: "center", padding: "30px 0" },
  loadingText: { fontSize: 14, color: "#64748b", fontWeight: 600 },

  // STATS
  statsGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr",
    gap: 12, marginBottom: 24,
  },
  statCard: { padding: "16px 14px", borderRadius: 18, textAlign: "center" },
  statIcon: { fontSize: 24, marginBottom: 8 },
  statVal: { fontWeight: 900, fontSize: 26, marginBottom: 4 },
  statLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },

  // ACTIONS
  actionsGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr",
    gap: 12, marginBottom: 24,
  },
  actionCard: {
    padding: "18px 14px", borderRadius: 18, cursor: "pointer",
    transition: "transform 0.15s", position: "relative",
  },
  actionIcon: { fontSize: 28, marginBottom: 8 },
  actionLabel: { fontWeight: 800, fontSize: 14, marginBottom: 4 },
  actionDesc: { fontSize: 12, color: "#64748b", lineHeight: 1.5, marginBottom: 10 },
  actionArrow: { fontSize: 16, fontWeight: 900 },

  // TRANSACTIONS
  txCard: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "14px 16px", borderRadius: 16, marginBottom: 10,
    background: "rgba(15,23,42,0.9)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  txIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  txInfo: { flex: 1 },
  txNetwork: { fontWeight: 700, fontSize: 14, color: "#e5e7eb", marginBottom: 3 },
  txPhone: { fontSize: 12, color: "#475569" },
  txStatus: {
    fontSize: 11, fontWeight: 800, padding: "4px 10px",
    borderRadius: 50, textTransform: "capitalize", flexShrink: 0,
  },

  // FOOTER
  footer: { textAlign: "center", fontSize: 12, color: "#334155", marginTop: 28, paddingBottom: 20 },

  // FLOATING SUPPORT
  floatWrap: {
    position: "fixed", bottom: 24, right: 20, zIndex: 9999,
    display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
  },
  chatPopup: {
    background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 18, padding: 18, width: 270,
    boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
  },
  chatHeader: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: 10,
  },
  chatClose: {
    background: "none", border: "none", color: "#64748b",
    cursor: "pointer", fontSize: 14, fontWeight: 800,
  },
  chatMsg: { fontSize: 13, color: "#94a3b8", lineHeight: 1.55, margin: "0 0 12px" },
  chatOptions: { display: "flex", flexDirection: "column", gap: 8 },
  chatOption: {
    padding: "10px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)", color: "#e5e7eb",
    fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left",
  },
  floatBtn: {
    width: 54, height: 54, borderRadius: "50%",
    background: "linear-gradient(135deg, #25D366, #128C7E)",
    border: "none", color: "white", fontSize: 22, cursor: "pointer",
    boxShadow: "0 4px 20px rgba(37,211,102,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },

  // MODAL
  modalOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1300,
  },
  modal: {
    position: "fixed", left: "50%", top: "50%",
    transform: "translate(-50%, -50%)",
    width: "90%", maxWidth: 420,
    background: "#0f172a", padding: 24,
    borderRadius: 22, zIndex: 1400,
    border: "1px solid rgba(255,255,255,0.08)",
  },
  modalTitle: { fontSize: 20, fontWeight: 900, color: "#f1f5f9", marginBottom: 8 },
  modalDesc: { fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 16 },
  modalOptions: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 },
  helpCard: {
    padding: 14, borderRadius: 14,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    cursor: "pointer", fontSize: 14, color: "#e5e7eb", fontWeight: 700,
  },
  closeBtn: {
    width: "100%", padding: 13, border: "none", borderRadius: 14,
    background: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
    color: "#000", fontWeight: 900, cursor: "pointer", fontSize: 14,
  },
};
