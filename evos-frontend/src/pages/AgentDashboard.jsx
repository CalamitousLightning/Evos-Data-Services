import { useEffect, useState } from "react";

const API_BASE = "https://api.evosdata.xyz";

// Converts store name → URL slug
// "Besah Andy Store" → "besah-andy-store"
const slugify = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")   // strip special chars
    .replace(/\s+/g, "-")            // spaces → hyphens
    .replace(/-+/g, "-")             // collapse double hyphens
    .replace(/^-|-$/g, "");          // trim leading/trailing hyphens

// Builds the full store link given agent id + store name
const buildStoreLink = (agentId, storeName) => {
  const base = `${window.location.origin}/store/${agentId}`;
  const slug = storeName ? slugify(storeName) : "";
  return slug ? `${base}/${slug}` : base;
};

export default function AgentDashboard({ user, setPage }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState({
    wallet_balance: 0,
    total_sales: 0,
    total_profit: 0,
    total_orders: 0,
    store_link: "",
    transactions: [],
  });

  // Store name state
  const [storeName, setStoreName] = useState("");
  const [storeNameInput, setStoreNameInput] = useState("");
  const [storeNameSaving, setStoreNameSaving] = useState(false);
  const [storeNameMsg, setStoreNameMsg] = useState("");

  useEffect(() => {
    if (!user) { setPage("login"); return; }
    const isAgent = user.role === "agent" && user.agent_status === "approved";
    if (!isAgent) { setPage("dashboard"); }
  }, [user, setPage]);

  useEffect(() => {
    if (!user?.id) return;
    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError("");

        const [dashRes, txRes, nameRes] = await Promise.all([
          fetch(`${API_BASE}/agent/dashboard/${user.id}`),
          fetch(`${API_BASE}/agent/transactions/${user.id}`),
          fetch(`${API_BASE}/agent/store-name/${user.id}`),
        ]);

        const data = await dashRes.json();
        const txData = await txRes.json();
        const nameData = await nameRes.json();

        const currentName = nameData.store_name || "";

        setStats({
          wallet_balance: Number(data.wallet_balance || 0),
          total_sales: Number(data.total_sales || 0),
          total_profit: Number(data.total_profit || 0),
          total_orders: Number(data.total_orders || 0),
          // Use slugified link if agent has a store name, fallback to plain /store/{id}
          store_link: buildStoreLink(user.id, currentName),
          transactions: txData.transactions || [],
        });

        setStoreName(currentName);
        setStoreNameInput(currentName);

      } catch (err) {
        console.log(err);
        setError("Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [user]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(stats.store_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Copy failed");
    }
  };

  const saveStoreName = async () => {
    setStoreNameMsg("");
    setStoreNameSaving(true);
    try {
      const res = await fetch(`${API_BASE}/agent/store-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: user.id, store_name: storeNameInput.trim() }),
      });
      const data = await res.json();
      if (data.status === "success") {
        const newName = storeNameInput.trim();
        setStoreName(newName);
        // Immediately update the displayed store link with the new slug
        setStats((prev) => ({
          ...prev,
          store_link: buildStoreLink(user.id, newName),
        }));
        setStoreNameMsg("✅ Store name saved!");
      } else {
        setStoreNameMsg(data.error || "Failed to save");
      }
    } catch {
      setStoreNameMsg("Network error");
    } finally {
      setStoreNameSaving(false);
      setTimeout(() => setStoreNameMsg(""), 3000);
    }
  };

  const logout = () => {
    localStorage.clear();
    setPage("login");
  };

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.brand}>🚀 Agent Hub</div>
          <div style={styles.agentBadge}>Agent · Active</div>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.iconBtn} onClick={() => setPage("dashboard")} title="Home">🏠</button>
          <button style={styles.logoutBtn} onClick={logout}>Sign Out</button>
        </div>
      </div>

      <div style={styles.main}>

        {/* WELCOME */}
        <div style={styles.welcomeRow}>
          <div>
            <h1 style={styles.title}>Welcome back 👋</h1>
            <p style={styles.subtitle}>@{user?.username}</p>
          </div>
          <button style={styles.refreshBtn} onClick={() => window.location.reload()}>
            🔄 Refresh
          </button>
        </div>

        {error && <div style={styles.errorBox}>⚠️ {error}</div>}

        {loading ? (
          <div style={styles.loadingWrap}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <p style={styles.loadingText}>Loading your dashboard...</p>
          </div>
        ) : (
          <>
            {/* WALLET HERO CARD */}
            <div style={styles.walletCard}>
              <div style={styles.walletTop}>
                <div>
                  <p style={styles.walletLabel}>Available Balance</p>
                  <h2 style={styles.walletAmount}>GH₵ {stats.wallet_balance.toFixed(2)}</h2>
                </div>
                <div style={styles.walletIcon}>💰</div>
              </div>
              <button style={styles.withdrawBtn} onClick={() => setPage("agent-withdraw")}>
                💳 Withdraw Funds
              </button>
            </div>

            {/* STATS GRID */}
            <div style={styles.statsGrid}>
              {[
                { icon: "📈", label: "Total Profit", val: `GH₵ ${stats.total_profit.toFixed(2)}`, color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" },
                { icon: "📦", label: "Total Orders", val: stats.total_orders, color: "#38bdf8", bg: "rgba(56,189,248,0.1)", border: "rgba(56,189,248,0.25)" },
                { icon: "🛒", label: "Total Sales", val: stats.total_sales, color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.25)" },
                { icon: "⭐", label: "Status", val: "Approved", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
              ].map((s, i) => (
                <div key={i} style={{ ...styles.statCard, background: s.bg, border: `1px solid ${s.border}` }}>
                  <div style={styles.statIcon}>{s.icon}</div>
                  <div style={{ ...styles.statVal, color: s.color }}>{s.val}</div>
                  <div style={styles.statLabel}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* STORE LINK */}
            <div style={styles.storeLinkCard}>
              <div style={styles.storeLinkHeader}>
                <span style={styles.storeLinkTitle}>🏪 Your Store Link</span>
                <span style={styles.storeLinkBadge}>Live</span>
              </div>
              <div style={styles.storeLinkText}>{stats.store_link}</div>
              <div style={styles.storeLinkBtns}>
                <button style={styles.copyBtn} onClick={copyLink}>
                  {copied ? "✅ Copied!" : "📋 Copy Link"}
                </button>
                <button style={styles.visitBtn} onClick={() => window.open(stats.store_link, "_blank")}>
                  🔗 Visit Store
                </button>
              </div>
            </div>

            {/* STORE NAME */}
            <div style={styles.storeNameCard}>
              <div style={styles.storeNameHeader}>
                <span style={styles.storeNameTitle}>✏️ Store Display Name</span>
                {storeName && (
                  <span style={styles.storeNameCurrent}>
                    Current: <strong style={{ color: "#38bdf8" }}>{storeName}</strong>
                  </span>
                )}
              </div>
              <p style={styles.storeNameHint}>
                This name appears on your store page and in your store link.
                e.g. <span style={{ color: "#38bdf8", fontFamily: "monospace", fontSize: 11 }}>
                  /store/{user?.id}/{storeName ? slugify(storeName) : "your-store-name"}
                </span>
              </p>
              <input
                type="text"
                placeholder={`e.g. ${user?.username || "My Data Store"}`}
                value={storeNameInput}
                maxLength={40}
                onChange={(e) => setStoreNameInput(e.target.value)}
                style={styles.storeNameInput}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#475569" }}>
                  {storeNameInput.length}/40 characters
                </span>
                {storeNameMsg && (
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: storeNameMsg.startsWith("✅") ? "#22c55e" : "#f87171"
                  }}>
                    {storeNameMsg}
                  </span>
                )}
              </div>
              <button
                onClick={saveStoreName}
                disabled={storeNameSaving || storeNameInput.trim() === storeName}
                style={{
                  ...styles.storeNameBtn,
                  opacity: storeNameSaving || storeNameInput.trim() === storeName ? 0.5 : 1,
                  cursor: storeNameSaving || storeNameInput.trim() === storeName ? "not-allowed" : "pointer",
                }}
              >
                {storeNameSaving ? "Saving..." : "Save Store Name"}
              </button>
            </div>

            {/* QUICK ACTIONS */}
            <div style={styles.actionsSection}>
              <h3 style={styles.sectionTitle}>Quick Actions</h3>
              <div style={styles.actionsGrid}>
                {[
                  { icon: "💰", label: "Manage Pricing", desc: "Set your bundle markups", page: "agent-pricing", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" },
                  { icon: "💳", label: "Withdraw", desc: "Send to your MoMo", page: "agent-withdraw", color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" },
                  { icon: "🏠", label: "Dashboard", desc: "Main account page", page: "dashboard", color: "#38bdf8", bg: "rgba(56,189,248,0.1)", border: "rgba(56,189,248,0.25)" },
                ].map((a, i) => (
                  <div
                    key={i}
                    style={{ ...styles.actionCard, background: a.bg, border: `1px solid ${a.border}` }}
                    onClick={() => setPage(a.page)}
                  >
                    <div style={{ ...styles.actionIcon, color: a.color }}>{a.icon}</div>
                    <div style={{ ...styles.actionLabel, color: a.color }}>{a.label}</div>
                    <div style={styles.actionDesc}>{a.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* TRANSACTIONS */}
            <div style={styles.txSection}>
              <div style={styles.txHeader}>
                <h3 style={styles.sectionTitle}>Recent Transactions</h3>
                <span style={styles.txCount}>{stats.transactions.length} total</span>
              </div>

              {stats.transactions.length === 0 ? (
                <div style={styles.emptyTx}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                  <p style={styles.emptyTxText}>No transactions yet</p>
                  <p style={styles.emptyTxSub}>Your earnings will appear here</p>
                </div>
              ) : (
                stats.transactions.slice(0, 10).map((tx, i) => {
                  const isCredit = tx.type === "credit";
                  const isWithdrawal = tx.type === "withdrawal";
                  return (
                    <div key={i} style={styles.txCard}>
                      <div style={{
                        ...styles.txIconWrap,
                        background: isCredit ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                      }}>
                        <span style={{ fontSize: 18 }}>
                          {isCredit ? "📥" : isWithdrawal ? "💸" : "📤"}
                        </span>
                      </div>
                      <div style={styles.txInfo}>
                        <div style={styles.txType}>
                          {isCredit ? "Commission Earned" : isWithdrawal ? "Withdrawal" : "Debit"}
                        </div>
                        <div style={styles.txRef}>{tx.reference || "N/A"}</div>
                      </div>
                      <div style={{ ...styles.txAmount, color: isCredit ? "#22c55e" : "#ef4444" }}>
                        {isCredit ? "+" : "-"}GH₵ {Math.abs(Number(tx.amount || 0)).toFixed(2)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", color: "#e5e7eb", fontFamily: "ui-sans-serif, system-ui, Arial" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(15,23,42,0.8)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  brand: { color: "#38bdf8", fontSize: 18, fontWeight: 900 },
  agentBadge: { fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 50, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  iconBtn: { width: 38, height: 38, border: "none", borderRadius: 10, background: "rgba(255,255,255,0.06)", cursor: "pointer", fontSize: 16 },
  logoutBtn: { padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  main: { maxWidth: 600, margin: "0 auto", padding: "24px 18px 60px" },
  welcomeRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  title: { fontSize: 26, fontWeight: 900, color: "#f1f5f9", margin: "0 0 4px" },
  subtitle: { fontSize: 14, color: "#64748b", margin: 0 },
  refreshBtn: { padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#94a3b8", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  errorBox: { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", padding: "12px 16px", borderRadius: 12, fontSize: 14, marginBottom: 16 },
  loadingWrap: { textAlign: "center", padding: "60px 0" },
  loadingText: { fontSize: 15, color: "#64748b", fontWeight: 600 },
  walletCard: { background: "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(167,139,250,0.1))", border: "1px solid rgba(56,189,248,0.25)", borderRadius: 22, padding: "22px 20px", marginBottom: 16 },
  walletTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  walletLabel: { fontSize: 13, color: "#94a3b8", margin: "0 0 6px", fontWeight: 600 },
  walletAmount: { fontSize: 34, fontWeight: 900, color: "#f1f5f9", margin: 0 },
  walletIcon: { fontSize: 40 },
  withdrawBtn: { width: "100%", padding: "13px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "white", fontWeight: 900, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 20px rgba(34,197,94,0.3)" },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 },
  statCard: { padding: "16px 14px", borderRadius: 18, textAlign: "center" },
  statIcon: { fontSize: 24, marginBottom: 8 },
  statVal: { fontWeight: 900, fontSize: 18, marginBottom: 4 },
  statLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },
  storeLinkCard: { background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: "18px 16px", marginBottom: 16, backdropFilter: "blur(20px)" },
  storeLinkHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  storeLinkTitle: { fontWeight: 800, fontSize: 14, color: "#f1f5f9" },
  storeLinkBadge: { fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 50, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", textTransform: "uppercase" },
  storeLinkText: { fontSize: 13, color: "#64748b", wordBreak: "break-all", lineHeight: 1.5, marginBottom: 14, background: "rgba(2,6,23,0.5)", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" },
  storeLinkBtns: { display: "flex", gap: 10 },
  copyBtn: { flex: 1, padding: "11px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #38bdf8, #0ea5e9)", color: "#000", fontWeight: 900, fontSize: 13, cursor: "pointer" },
  visitBtn: { flex: 1, padding: "11px", borderRadius: 12, border: "1px solid rgba(56,189,248,0.3)", background: "rgba(56,189,248,0.08)", color: "#38bdf8", fontWeight: 800, fontSize: 13, cursor: "pointer" },

  // STORE NAME
  storeNameCard: { background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: "18px 16px", marginBottom: 16, backdropFilter: "blur(20px)" },
  storeNameHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  storeNameTitle: { fontWeight: 800, fontSize: 14, color: "#f1f5f9" },
  storeNameCurrent: { fontSize: 12, color: "#64748b" },
  storeNameHint: { fontSize: 12, color: "#475569", margin: "0 0 12px", lineHeight: 1.6 },
  storeNameInput: { width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.75)", color: "#e5e7eb", fontSize: 14, marginBottom: 8, boxSizing: "border-box", outline: "none" },
  storeNameBtn: { marginTop: 10, width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #38bdf8, #0ea5e9)", color: "#000", fontWeight: 900, fontSize: 14 },

  // ACTIONS
  actionsSection: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 900, color: "#f1f5f9", margin: "0 0 14px" },
  actionsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
  actionCard: { padding: "16px 12px", borderRadius: 16, cursor: "pointer", textAlign: "center", transition: "transform 0.15s" },
  actionIcon: { fontSize: 26, marginBottom: 8 },
  actionLabel: { fontWeight: 800, fontSize: 13, marginBottom: 4 },
  actionDesc: { fontSize: 11, color: "#64748b" },

  // TRANSACTIONS
  txSection: { marginBottom: 20 },
  txHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  txCount: { fontSize: 12, color: "#64748b", fontWeight: 700 },
  emptyTx: { textAlign: "center", padding: "30px 0" },
  emptyTxText: { fontSize: 15, color: "#475569", fontWeight: 700, margin: "0 0 4px" },
  emptyTxSub: { fontSize: 13, color: "#334155", margin: 0 },
  txCard: { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 16, marginBottom: 10, background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.06)" },
  txIconWrap: { width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  txInfo: { flex: 1 },
  txType: { fontWeight: 700, fontSize: 14, color: "#e5e7eb", marginBottom: 3 },
  txRef: { fontSize: 11, color: "#475569" },
  txAmount: { fontWeight: 900, fontSize: 16, flexShrink: 0 },
};
