import { useEffect, useState } from "react";

const API = "https://api.evosdata.xyz";

const NETWORK_CONFIG = {
  MTN: {
    label: "MTN", emoji: "🟡", color: "#FFC107",
    bg: "linear-gradient(135deg, rgba(255,193,7,0.18), rgba(255,193,7,0.06))",
    border: "rgba(255,193,7,0.4)", shadow: "0 4px 20px rgba(245,158,11,0.2)",
    tag: "Most Popular", tagColor: "#f59e0b",
  },
  Telecel: {
    label: "Telecel (Vodafone)", emoji: "🔴", color: "#ef4444",
    bg: "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))",
    border: "rgba(239,68,68,0.4)", shadow: "0 4px 20px rgba(239,68,68,0.2)",
    tag: "Reliable", tagColor: "#ef4444",
  },
  AirtelTigo: {
    label: "AirtelTigo", emoji: "🔵", color: "#6366f1",
    bg: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(99,102,241,0.06))",
    border: "rgba(99,102,241,0.4)", shadow: "0 4px 20px rgba(99,102,241,0.2)",
    tag: "Affordable", tagColor: "#6366f1",
  },
};

const bundleAccents = [
  { border: "rgba(34,197,94,0.3)", price: "#22c55e" },
  { border: "rgba(56,189,248,0.3)", price: "#38bdf8" },
  { border: "rgba(167,139,250,0.3)", price: "#a78bfa" },
  { border: "rgba(245,158,11,0.3)", price: "#f59e0b" },
  { border: "rgba(20,184,166,0.3)", price: "#14b8a6" },
  { border: "rgba(239,68,68,0.3)", price: "#ef4444" },
];

// =========================
// CONFIRMATION MODAL
// =========================
function ConfirmModal({ selected, networkLabel, networkCfg, onClose, onConfirm, processing }) {
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const canSubmit = phone.trim().length >= 9 && accepted && !processing;

  return (
    <div style={modal.overlay}>
      <div style={modal.box}>
        <div style={modal.header}>
          <span style={modal.headerLabel}>✅ Complete Purchase</span>
          <button style={modal.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{
          ...modal.summary,
          background: networkCfg?.bg || "rgba(255,255,255,0.04)",
          border: `1px solid ${networkCfg?.border || "rgba(255,255,255,0.08)"}`,
        }}>
          <div style={modal.summaryHeader}>
            <span style={{ fontSize: 18 }}>{networkCfg?.emoji}</span>
            <span style={{ fontWeight: 900, fontSize: 14, color: networkCfg?.color }}>Order Summary</span>
          </div>
          <div style={modal.summaryRow}>
            <span style={modal.summaryLabel}>Network</span>
            <span style={{ ...modal.summaryValue, color: networkCfg?.color, fontWeight: 800 }}>{networkLabel}</span>
          </div>
          <div style={modal.summaryRow}>
            <span style={modal.summaryLabel}>Bundle</span>
            <span style={modal.summaryValue}>{selected.bundle}</span>
          </div>
          <div style={{ ...modal.summaryRow, borderBottom: "none" }}>
            <span style={modal.summaryLabel}>Amount</span>
            <span style={{ ...modal.summaryValue, color: "#22c55e", fontSize: 20, fontWeight: 900 }}>
              GH₵ {Number(selected.final_price).toFixed(2)}
            </span>
          </div>
        </div>

        <label style={modal.label}>📱 Recipient Phone Number</label>
        <input
          type="tel"
          placeholder="e.g. 0244000000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={modal.input}
        />

        <label style={modal.checkRow}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            style={{ marginRight: 8, accentColor: "#38bdf8", width: 15, height: 15, flexShrink: 0, marginTop: 2 }}
          />
          <span style={modal.checkText}>
            I confirm this phone number is correct.{" "}
            <strong style={{ color: "#f87171" }}>Wrong numbers will NOT be refunded.</strong>
          </span>
        </label>

        <button
          onClick={() => onConfirm(phone.trim())}
          disabled={!canSubmit}
          style={{ ...modal.buyBtn, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          {processing ? "⏳ Processing..." : `💳 Pay GH₵ ${Number(selected.final_price).toFixed(2)} via Paystack`}
        </button>
        <p style={modal.secureNote}>🔒 Secured & encrypted by Paystack</p>
      </div>
    </div>
  );
}

// =========================
// MAIN STORE PAGE
// =========================
export default function StorePage({ setPage }) {
  const agentId = window.location.pathname.split("/store/")[1];

  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState(null);
  const [step, setStep] = useState(1);
  const [network, setNetwork] = useState("");
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!agentId) { setLoading(false); return; }
    const loadStore = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API}/store/${agentId}`);
        const data = await res.json();
        if (!res.ok || data.status === "error") { setStore(null); }
        else { setStore(data); }
      } catch (err) {
        console.log("Store error:", err);
        setStore(null);
      } finally {
        setLoading(false);
      }
    };
    loadStore();
  }, [agentId]);

  const placeOrder = async (phone) => {
    if (!selected) return;
    setProcessing(true);
    try {
      const res = await fetch(`${API}/store/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: Number(agentId),
          network: selected.network,
          bundle: selected.bundle,
          phone_number: phone,
        }),
      });
      const data = await res.json();
      if (data.status === "created" && data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }
      alert(data.message || "Failed to create order");
    } catch (err) {
      alert("Network error");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return (
    <div style={styles.centerWrap}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
      <p style={{ fontSize: 15, color: "#64748b", fontWeight: 700 }}>Loading store...</p>
    </div>
  );

  if (!store) return (
    <div style={styles.centerWrap}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
      <h2 style={{ fontSize: 22, fontWeight: 900, color: "#f1f5f9", marginBottom: 8 }}>Store Not Found</h2>
      <p style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>This store link may be invalid or inactive.</p>
    </div>
  );

  const availableNetworks = [...new Set((store.prices || []).map((p) => p.network))];

  // ✅ Sort bundles lowest final_price first
  const bundles = (store.prices || [])
    .filter((p) => p.network === network)
    .sort((a, b) => Number(a.final_price) - Number(b.final_price));

  const cfg = NETWORK_CONFIG[network] || {};
  const networkLabel = cfg.label || network;

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerBadge}>🏪 Agent Store</div>
        <h1 style={styles.title}>{store.agent_name}'s Store</h1>
        <p style={styles.sub}>
          Fast Data Purchase · Powered by <span style={{ color: "#38bdf8", fontWeight: 900 }}>EVOS HUB</span>
        </p>
      </div>

      {/* PROGRESS */}
      <div style={styles.progressWrap}>
        {["Network", "Bundle", "Pay"].map((label, i) => {
          const active = step === i + 1;
          const done = step > i + 1;
          return (
            <div key={i} style={styles.progressItem}>
              <div style={{
                ...styles.progressDot,
                background: done ? "#22c55e" : active ? "#38bdf8" : "rgba(255,255,255,0.1)",
                border: active ? "2px solid #38bdf8" : done ? "2px solid #22c55e" : "2px solid rgba(255,255,255,0.1)",
                color: done || active ? "white" : "#475569",
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

      <div style={styles.wrapper}>

        {/* ============ STEP 1 — NETWORK ============ */}
        {step === 1 && (
          <div style={styles.box}>
            <p style={styles.stepLabel}>Step 1 of 2 · Select Your Network</p>

            <div style={styles.networkGrid}>
              {availableNetworks.map((netKey) => {
                const c = NETWORK_CONFIG[netKey] || {
                  label: netKey, emoji: "📡", color: "#64748b",
                  bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)",
                  shadow: "none", tag: "", tagColor: "#64748b",
                };
                return (
                  <div
                    key={netKey}
                    style={{
                      ...styles.networkCard,
                      background: c.bg,
                      border: `1px solid ${c.border}`,
                    }}
                    onClick={() => { setNetwork(netKey); setStep(2); }}
                  >
                    {c.tag && (
                      <div style={{
                        ...styles.networkTag,
                        background: c.tagColor + "22",
                        color: c.tagColor,
                        border: `1px solid ${c.tagColor}44`,
                      }}>
                        {c.tag}
                      </div>
                    )}
                    <div style={styles.networkEmoji}>{c.emoji}</div>
                    <div style={{ ...styles.networkName, color: c.color }}>{c.label}</div>
                    <div style={{ ...styles.networkArrow, color: c.color }}>→</div>
                  </div>
                );
              })}
            </div>

            <div style={styles.infoRow}>
              <span style={styles.infoChip}>🔒 Paystack Secured</span>
              <span style={styles.infoChip}>⚡ Instant Delivery</span>
            </div>

            <button
              style={styles.trackBtn}
              onClick={() => {
                sessionStorage.setItem("storeAgentId", agentId);
                setPage("eta-track");
              }}
            >
              📦 Track My Order
            </button>
          </div>
        )}

        {/* ============ STEP 2 — BUNDLES ============ */}
        {step === 2 && (
          <div style={styles.box}>
            <button style={styles.backBtn} onClick={() => setStep(1)}>← Back</button>

            <p style={styles.stepLabel}>Step 2 of 2 · Pick a Bundle</p>

            <div style={{
              ...styles.networkPill,
              background: cfg.bg,
              border: `1px solid ${cfg.border}`,
              color: cfg.color,
            }}>
              {cfg.emoji} {networkLabel}
            </div>

            {bundles.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 0 10px" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>No bundles available.</p>
              </div>
            )}

            <div style={styles.bundleGrid}>
              {bundles.map((item, i) => {
                const accent = bundleAccents[i % bundleAccents.length];
                return (
                  <div
                    key={i}
                    style={{ ...styles.bundleCard, border: `1px solid ${accent.border}` }}
                    onClick={() => setSelected(item)}
                  >
                    <div style={styles.bundleSize}>{item.bundle}</div>
                    <div style={{ ...styles.bundlePrice, color: accent.price }}>
                      GH₵ {Number(item.final_price).toFixed(2)}
                    </div>
                    <div style={{ ...styles.bundleCta, color: accent.price }}>Select →</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* CONFIRM MODAL */}
      {selected && (
        <ConfirmModal
          selected={selected}
          networkLabel={networkLabel}
          networkCfg={cfg}
          processing={processing}
          onClose={() => { if (!processing) setSelected(null); }}
          onConfirm={placeOrder}
        />
      )}

      {/* FLOATING SUPPORT */}
      <div style={styles.floatWrap}>
        {chatOpen && (
          <div style={styles.chatPopup}>
            <div style={styles.chatHeader}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#e5e7eb" }}>💬 EVOS Support</span>
              <button style={styles.chatClose} onClick={() => setChatOpen(false)}>✕</button>
            </div>
            <p style={styles.chatMsg}>Hi! How can we help you? Choose an option 👇</p>
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
  container: { padding: "28px 18px 80px", minHeight: "100vh", fontFamily: "ui-sans-serif, system-ui, Arial", color: "#e5e7eb" },
  centerWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center", padding: 24, color: "#e5e7eb" },
  header: { textAlign: "center", marginBottom: 24 },
  headerBadge: { display: "inline-block", padding: "5px 18px", borderRadius: 50, background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.3)", color: "#38bdf8", fontSize: 12, fontWeight: 800, marginBottom: 10, letterSpacing: "0.5px" },
  title: { fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 900, color: "#f1f5f9", margin: "0 0 6px" },
  sub: { fontSize: 13, color: "#64748b", margin: 0, fontWeight: 600 },
  progressWrap: { display: "flex", justifyContent: "center", alignItems: "center", position: "relative", maxWidth: 340, margin: "0 auto 24px" },
  progressItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, position: "relative", zIndex: 1 },
  progressDot: { width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, transition: "all 0.35s" },
  progressLabel: { fontSize: 11, fontWeight: 700, transition: "color 0.3s" },
  progressLine: { position: "absolute", top: 17, left: "16%", right: "16%", height: 2, background: "rgba(255,255,255,0.08)", zIndex: 0 },
  wrapper: { maxWidth: 480, margin: "0 auto" },
  box: { background: "rgba(15,23,42,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", padding: "24px 20px", borderRadius: 22, border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 25px 60px rgba(0,0,0,0.4)" },
  stepLabel: { fontSize: 12, color: "#38bdf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 18px" },
  networkGrid: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 },
  networkCard: { padding: "16px 18px", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "transform 0.15s", position: "relative" },
  networkTag: { position: "absolute", top: 10, right: 42, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 50, letterSpacing: "0.5px", textTransform: "uppercase" },
  networkEmoji: { fontSize: 28, flexShrink: 0 },
  networkName: { fontWeight: 800, fontSize: 16, flex: 1 },
  networkArrow: { fontSize: 20, fontWeight: 900, flexShrink: 0 },
  infoRow: { display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 },
  infoChip: { fontSize: 11, color: "#475569", fontWeight: 700, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", padding: "4px 10px", borderRadius: 50 },
  trackBtn: { width: "100%", padding: "12px", borderRadius: 14, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)", color: "#38bdf8", fontWeight: 800, fontSize: 14, cursor: "pointer" },
  backBtn: { background: "rgba(255,255,255,0.06)", border: "none", color: "#38bdf8", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: "6px 14px", borderRadius: 50, marginBottom: 16, display: "inline-block" },
  networkPill: { display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 18px", borderRadius: 50, fontSize: 13, fontWeight: 900, marginBottom: 20 },
  bundleGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  bundleCard: { background: "rgba(2,6,23,0.7)", borderRadius: 16, padding: "18px 14px 14px", cursor: "pointer", textAlign: "center", transition: "transform 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  bundleSize: { fontWeight: 900, fontSize: 20, color: "#f1f5f9" },
  bundlePrice: { fontWeight: 900, fontSize: 17 },
  bundleCta: { fontSize: 11, fontWeight: 800, opacity: 0.7 },
  floatWrap: { position: "fixed", bottom: 24, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 },
  chatPopup: { background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 18, width: 270, boxShadow: "0 8px 40px rgba(0,0,0,0.5)" },
  chatHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  chatClose: { background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, fontWeight: 800 },
  chatMsg: { fontSize: 13, color: "#94a3b8", lineHeight: 1.55, margin: "0 0 12px" },
  chatOptions: { display: "flex", flexDirection: "column", gap: 8 },
  chatOption: { padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#e5e7eb", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "left" },
  floatBtn: { width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg, #25D366, #128C7E)", border: "none", color: "white", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 20px rgba(37,211,102,0.45)", display: "flex", alignItems: "center", justifyContent: "center" },
};

const modal = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 },
  box: { width: "100%", maxWidth: 480, background: "#0f172a", borderRadius: "24px 24px 0 0", padding: "22px 20px 36px", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", fontFamily: "ui-sans-serif, system-ui, Arial" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  headerLabel: { fontWeight: 900, fontSize: 16, color: "#f1f5f9" },
  closeBtn: { background: "rgba(255,255,255,0.08)", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer", padding: "6px 10px", borderRadius: 50, fontWeight: 800 },
  summary: { borderRadius: 16, padding: "10px 16px", marginBottom: 18 },
  summaryHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" },
  summaryRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  summaryLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },
  summaryValue: { fontSize: 14, fontWeight: 700, color: "#e5e7eb" },
  label: { display: "block", fontSize: 12, color: "#64748b", fontWeight: 800, marginBottom: 6 },
  input: { width: "100%", padding: "13px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.75)", color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 14, boxSizing: "border-box", outline: "none" },
  checkRow: { display: "flex", alignItems: "flex-start", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", padding: "12px 14px", borderRadius: 14, marginBottom: 18, cursor: "pointer" },
  checkText: { fontSize: 12, color: "#94a3b8", lineHeight: 1.55, fontWeight: 600 },
  buyBtn: { width: "100%", padding: 15, borderRadius: 16, border: "none", background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "white", fontWeight: 900, fontSize: 15, cursor: "pointer", boxShadow: "0 6px 24px rgba(34,197,94,0.3)", marginBottom: 10 },
  secureNote: { textAlign: "center", fontSize: 12, color: "#475569", margin: 0, fontWeight: 600 },
};
