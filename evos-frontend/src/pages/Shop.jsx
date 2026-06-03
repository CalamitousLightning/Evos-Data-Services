import { useEffect, useState } from "react";
import API from "../api";

export default function Shop() {
  const [step, setStep] = useState(1);
  const [network, setNetwork] = useState("");
  const [bundle, setBundle] = useState("");
  const [bundlePrice, setBundlePrice] = useState(0);
  const [phone, setPhone] = useState("");
  const [confirmPhone, setConfirmPhone] = useState("");
  const [email, setEmail] = useState(localStorage.getItem("email") || "");
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [agree, setAgree] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const user_id = user?.id || null;

  useEffect(() => {
    const loadPrices = async () => {
      try {
        const res = await API.get("/prices");
        const data = res.data?.data;
        setPrices(Array.isArray(data) ? data : []);
      } catch {
        setPrices([]);
      }
    };
    loadPrices();
  }, []);

  const OUT_OF_STOCK = [];
  const isOutOfStock = (name) => OUT_OF_STOCK.includes(name);

  // ✅ Sort bundles lowest price first
  const bundles = prices
    .filter((p) => p.network === network)
    .sort((a, b) => Number(a.price) - Number(b.price));

  const validPhone = (num) => /^0\d{9}$/.test(num);

  const handleBuy = async () => {
    try {
      setError("");
      if (!network || !bundle) { setError("Select network and bundle"); return; }
      if (!phone) { setError("Enter phone number"); return; }
      if (!validPhone(phone)) { setError("Phone must be 10 digits and start with 0"); return; }
      if (phone !== confirmPhone) { setError("Phone numbers do not match"); return; }
      if (!agree) { setError("You must confirm refund policy"); return; }

      setLoading(true);
      const res = await API.post("/orders/create", {
        user_id, network, bundle, phone,
        email: email || "guest@evoshub.com",
      });

      const paymentUrl =
        res.data?.payment_url ||
        res.data?.authorization_url ||
        res.data?.data?.authorization_url;

      if (!paymentUrl) {
        setLoading(false);
        setError("Payment link not received");
        return;
      }

      localStorage.setItem("email", email);
      window.location.href = paymentUrl;
    } catch (err) {
      setLoading(false);
      setError(
        err.response?.data?.detail ||
        err.response?.data?.message ||
        "Order failed"
      );
    }
  };

  const networks = [
    {
      name: "MTN",
      label: "MTN",
      emoji: "🟡",
      color: "#FFC107",
      bg: "linear-gradient(135deg, rgba(255,193,7,0.18), rgba(255,193,7,0.06))",
      border: "rgba(255,193,7,0.4)",
      desc: "Ghana's largest network",
    },
    {
      name: "TELECEL",
      label: "Telecel",
      emoji: "🔴",
      color: "#ef4444",
      bg: "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))",
      border: "rgba(239,68,68,0.4)",
      desc: "Formerly Vodafone Ghana",
    },
    {
      name: "AIRTELTIGO",
      label: "AirtelTigo",
      emoji: "🔵",
      color: "#6366f1",
      bg: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(99,102,241,0.06))",
      border: "rgba(99,102,241,0.4)",
      desc: "Nationwide coverage",
    },
  ];

  const selectedNetwork = networks.find((n) => n.name === network);

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerBadge}>🛒 Buy Data</div>
        <h2 style={styles.title}>Choose Your Bundle</h2>
        <p style={styles.subtitle}>Fast automated delivery across Ghana</p>
      </div>

      {/* PROGRESS BAR */}
      <div style={styles.progressWrap}>
        {["Network", "Bundle", "Checkout"].map((label, i) => {
          const active = step === i + 1;
          const done = step > i + 1;
          return (
            <div key={i} style={styles.progressItem}>
              <div style={{
                ...styles.progressDot,
                background: done ? "#22c55e" : active ? "#38bdf8" : "rgba(255,255,255,0.1)",
                border: active ? "2px solid #38bdf8" : done ? "2px solid #22c55e" : "2px solid rgba(255,255,255,0.1)",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{
                ...styles.progressLabel,
                color: active ? "#38bdf8" : done ? "#22c55e" : "#475569",
              }}>{label}</span>
            </div>
          );
        })}
        <div style={styles.progressLine} />
      </div>

      {/* ERROR */}
      {error && (
        <div style={styles.error}>
          ⚠️ {error}
        </div>
      )}

      <div style={styles.wrapper}>

        {/* ============ STEP 1 — NETWORK ============ */}
        {step === 1 && (
          <div style={styles.box}>
            <p style={styles.stepLabel}>Step 1 of 3 · Select Network</p>

            <div style={styles.networkGrid}>
              {networks.map((n) => {
                const disabled = isOutOfStock(n.name);
                return (
                  <div
                    key={n.name}
                    style={{
                      ...styles.networkCard,
                      background: n.bg,
                      border: `1px solid ${n.border}`,
                      opacity: disabled ? 0.4 : 1,
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}
                    onClick={() => {
                      if (disabled) return;
                      setNetwork(n.name);
                      setStep(2);
                    }}
                  >
                    <div style={{ ...styles.networkEmoji, color: n.color }}>
                      {n.emoji}
                    </div>
                    <div style={{ ...styles.networkName, color: n.color }}>
                      {n.label}
                    </div>
                    <div style={styles.networkDesc}>{n.desc}</div>
                    {disabled && (
                      <div style={styles.stockBadge}>Out of Stock</div>
                    )}
                    <div style={{ ...styles.networkArrow, color: n.color }}>→</div>
                  </div>
                );
              })}
            </div>

            <div style={styles.infoRow}>
              <span style={styles.infoText}>🔒 Secured by Paystack</span>
              <span style={styles.infoText}>⚡ Instant delivery</span>
            </div>
          </div>
        )}

        {/* ============ STEP 2 — BUNDLE ============ */}
        {step === 2 && (
          <div style={styles.box}>
            <button style={styles.backBtn} onClick={() => setStep(1)}>
              ← Back
            </button>

            <p style={styles.stepLabel}>Step 2 of 3 · Select Bundle</p>

            <div style={{
              ...styles.networkPill,
              background: selectedNetwork?.bg,
              border: `1px solid ${selectedNetwork?.border}`,
              color: selectedNetwork?.color,
            }}>
              {selectedNetwork?.emoji} {selectedNetwork?.label}
            </div>

            {bundles.length === 0 && (
              <p style={styles.emptyText}>No bundles available for this network.</p>
            )}

            <div style={styles.bundleGrid}>
              {bundles.map((b, i) => (
                <div
                  key={i}
                  style={styles.bundleCard}
                  onClick={() => {
                    setBundle(b.bundle);
                    setBundlePrice(b.price);
                    setStep(3);
                  }}
                >
                  <div style={styles.bundleSize}>{b.bundle}</div>
                  <div style={styles.bundlePrice}>
                    GH₵ {Number(b.price).toFixed(2)}
                  </div>
                  <div style={styles.bundleTap}>Tap to select →</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============ STEP 3 — CHECKOUT ============ */}
        {step === 3 && (
          <div style={styles.box}>
            <button style={styles.backBtn} onClick={() => setStep(2)}>
              ← Back
            </button>

            <p style={styles.stepLabel}>Step 3 of 3 · Complete Order</p>

            <div style={styles.summaryCard}>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>Network</span>
                <span style={{
                  ...styles.summaryVal,
                  color: selectedNetwork?.color,
                  fontWeight: 800,
                }}>
                  {selectedNetwork?.emoji} {selectedNetwork?.label}
                </span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>Bundle</span>
                <span style={styles.summaryVal}>{bundle}</span>
              </div>
              <div style={{ ...styles.summaryRow, borderBottom: "none" }}>
                <span style={styles.summaryLabel}>Amount</span>
                <span style={{ ...styles.summaryVal, color: "#38bdf8", fontSize: 20, fontWeight: 900 }}>
                  GH₵ {Number(bundlePrice).toFixed(2)}
                </span>
              </div>
            </div>

            <label style={styles.inputLabel}>📱 Recipient Phone Number</label>
            <input
              style={styles.input}
              type="tel"
              placeholder="e.g. 0244000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <label style={styles.inputLabel}>🔁 Confirm Phone Number</label>
            <input
              style={styles.input}
              type="tel"
              placeholder="Re-enter phone number"
              value={confirmPhone}
              onChange={(e) => setConfirmPhone(e.target.value)}
            />

            <label style={styles.inputLabel}>📧 Email (for receipt)</label>
            <input
              style={styles.input}
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label style={styles.checkWrap}>
              <input
                type="checkbox"
                checked={agree}
                onChange={() => setAgree(!agree)}
                style={{ accentColor: "#38bdf8", width: 16, height: 16, flexShrink: 0, marginTop: 2 }}
              />
              <span style={styles.checkText}>
                I confirm this number is correct.{" "}
                <strong style={{ color: "#f87171" }}>Wrong numbers will NOT be refunded.</strong>{" "}
                I take full responsibility.
              </span>
            </label>

            <button
              onClick={handleBuy}
              disabled={loading}
              style={{ ...styles.buyBtn, opacity: loading ? 0.6 : 1 }}
            >
              {loading
                ? "⏳ Processing..."
                : `💳 Pay GH₵ ${Number(bundlePrice).toFixed(2)} via Paystack`}
            </button>

            <p style={styles.secureNote}>🔒 Secured & encrypted via Paystack</p>
          </div>
        )}
      </div>

      {/* FLOATING SUPPORT */}
      <div style={styles.floatWrap}>
        {chatOpen && (
          <div style={styles.chatPopup}>
            <div style={styles.chatHeader}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#e5e7eb" }}>💬 EVOS Support</span>
              <button style={styles.chatClose} onClick={() => setChatOpen(false)}>✕</button>
            </div>
            <p style={styles.chatMsg}>Hi! Need help with your order? Choose an option below 👇</p>
            <div style={styles.chatOptions}>
              <button style={styles.chatOption}
                onClick={() => window.open("https://wa.me/233208718943", "_blank")}>
                💬 WhatsApp Chat
              </button>
              <button style={styles.chatOption}
                onClick={() => window.open("https://chat.whatsapp.com/CYSA7PRIlK0JklgVtQfhnR", "_blank")}>
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

    </div>
  );
}

const styles = {
  container: {
    padding: "24px 18px 60px",
    color: "#e5e7eb",
    fontFamily: "ui-sans-serif, system-ui, Arial",
    minHeight: "100vh",
  },
  header: { textAlign: "center", marginBottom: 28 },
  headerBadge: {
    display: "inline-block", padding: "5px 16px", borderRadius: 50,
    background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)",
    color: "#38bdf8", fontSize: 12, fontWeight: 700, marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: 900, color: "#f1f5f9", margin: "0 0 6px" },
  subtitle: { fontSize: 14, color: "#64748b", margin: 0 },
  progressWrap: {
    display: "flex", justifyContent: "center", alignItems: "center",
    gap: 0, marginBottom: 28, position: "relative",
    maxWidth: 340, margin: "0 auto 28px",
  },
  progressItem: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 6, flex: 1, position: "relative", zIndex: 1,
  },
  progressDot: {
    width: 32, height: 32, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 800, color: "white", transition: "all 0.3s",
  },
  progressLabel: { fontSize: 11, fontWeight: 700, transition: "color 0.3s" },
  progressLine: {
    position: "absolute", top: 16, left: "16%", right: "16%",
    height: 2, background: "rgba(255,255,255,0.08)", zIndex: 0,
  },
  error: {
    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
    color: "#f87171", padding: "12px 16px", borderRadius: 12,
    marginBottom: 16, fontSize: 14, maxWidth: 480,
    margin: "0 auto 16px", textAlign: "center",
  },
  wrapper: { maxWidth: 480, margin: "0 auto" },
  box: {
    background: "rgba(15,23,42,0.9)", backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)", padding: "24px 20px",
    borderRadius: 22, border: "1px solid rgba(255,255,255,0.07)",
    boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
  },
  stepLabel: {
    fontSize: 12, color: "#38bdf8", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 18, margin: "0 0 18px",
  },
  networkGrid: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 },
  networkCard: {
    padding: "16px 18px", borderRadius: 16, cursor: "pointer",
    display: "flex", alignItems: "center", gap: 14,
    transition: "transform 0.15s", position: "relative",
  },
  networkEmoji: { fontSize: 26, flexShrink: 0 },
  networkName: { fontWeight: 800, fontSize: 16, flex: 1 },
  networkDesc: { fontSize: 12, color: "#64748b" },
  networkArrow: { fontSize: 18, fontWeight: 900 },
  stockBadge: {
    position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
    background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
    color: "#ef4444", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 50,
  },
  infoRow: { display: "flex", justifyContent: "center", gap: 20 },
  infoText: { fontSize: 12, color: "#475569", fontWeight: 600 },
  backBtn: {
    background: "none", border: "none", color: "#38bdf8",
    fontSize: 14, fontWeight: 700, cursor: "pointer",
    padding: 0, marginBottom: 14, display: "block",
  },
  networkPill: {
    display: "inline-block", padding: "6px 16px", borderRadius: 50,
    fontSize: 13, fontWeight: 800, marginBottom: 18,
  },
  emptyText: { color: "#475569", fontSize: 14, textAlign: "center", padding: "20px 0" },
  bundleGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 },
  bundleCard: {
    background: "rgba(2,6,23,0.7)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16, padding: "16px 14px", cursor: "pointer",
    textAlign: "center", transition: "border-color 0.15s",
  },
  bundleSize: { fontWeight: 900, fontSize: 18, color: "#f1f5f9", marginBottom: 6 },
  bundlePrice: { fontWeight: 800, fontSize: 16, color: "#38bdf8", marginBottom: 8 },
  bundleTap: { fontSize: 11, color: "#38bdf8", opacity: 0.6 },
  summaryCard: {
    background: "rgba(2,6,23,0.7)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16, padding: "6px 16px", marginBottom: 20,
  },
  summaryRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  summaryLabel: { fontSize: 13, color: "#64748b" },
  summaryVal: { fontSize: 15, fontWeight: 700, color: "#e5e7eb" },
  inputLabel: { display: "block", fontSize: 12, color: "#64748b", fontWeight: 700, marginBottom: 6 },
  input: {
    width: "100%", padding: "13px 14px", marginBottom: 14, borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.75)",
    color: "#fff", outline: "none", fontSize: 14, boxSizing: "border-box",
  },
  checkWrap: {
    display: "flex", gap: 10, alignItems: "flex-start",
    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
    padding: "12px 14px", borderRadius: 12, marginBottom: 16, cursor: "pointer",
  },
  checkText: { fontSize: 13, color: "#94a3b8", lineHeight: 1.55 },
  buyBtn: {
    width: "100%", padding: "15px", borderRadius: 14, border: "none",
    background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "white",
    fontWeight: 900, fontSize: 15, cursor: "pointer", marginBottom: 12,
    boxShadow: "0 4px 20px rgba(34,197,94,0.3)",
  },
  secureNote: { textAlign: "center", fontSize: 12, color: "#475569", margin: 0 },
  floatWrap: {
    position: "fixed", bottom: 24, right: 20, zIndex: 9999,
    display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
  },
  chatPopup: {
    background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 18, padding: 18, width: 270, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  },
  chatHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  chatClose: { background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14 },
  chatMsg: { fontSize: 13, color: "#94a3b8", lineHeight: 1.55, margin: "0 0 12px" },
  chatOptions: { display: "flex", flexDirection: "column", gap: 8 },
  chatOption: {
    padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
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
};
