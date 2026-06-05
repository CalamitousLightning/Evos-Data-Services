import { useEffect, useState } from "react";

const API = "https://api.evosdata.xyz";

const NETWORK_CONFIG = {
  MTN: {
    label: "MTN", emoji: "🟡", color: "#FFC107",
    bg: "linear-gradient(135deg, rgba(255,193,7,0.18), rgba(255,193,7,0.06))",
    border: "rgba(255,193,7,0.4)",
    tag: "Most Popular", tagColor: "#f59e0b",
  },
  Telecel: {
    label: "Telecel (Vodafone)", emoji: "🔴", color: "#ef4444",
    bg: "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.06))",
    border: "rgba(239,68,68,0.4)",
    tag: "Reliable", tagColor: "#ef4444",
  },
  AirtelTigo: {
    label: "AirtelTigo", emoji: "🔵", color: "#6366f1",
    bg: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(99,102,241,0.06))",
    border: "rgba(99,102,241,0.4)",
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
// CONFIRM MODAL
// =========================
function ConfirmModal({ bundle, network, cfg, walletBalance, onClose, onConfirm, processing }) {
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);

  const cost = Number(bundle.cost_price);
  const hasFunds = walletBalance >= cost;
  const canSubmit = phone.trim().length >= 9 && accepted && !processing && hasFunds;

  return (
    <div style={modal.overlay}>
      <div style={modal.box}>

        <div style={modal.header}>
          <span style={modal.headerLabel}>🛒 Confirm Purchase</span>
          <button style={modal.closeBtn} onClick={onClose} disabled={processing}>✕</button>
        </div>

        {/* Order summary */}
        <div style={{
          ...modal.summary,
          background: cfg?.bg || "rgba(255,255,255,0.04)",
          border: `1px solid ${cfg?.border || "rgba(255,255,255,0.08)"}`,
        }}>
          <div style={modal.summaryHeader}>
            <span style={{ fontSize: 20 }}>{cfg?.emoji}</span>
            <span style={{ fontWeight: 900, fontSize: 14, color: cfg?.color }}>Order Summary</span>
          </div>
          {[
            { label: "Network", value: cfg?.label || network, color: cfg?.color },
            { label: "Bundle", value: bundle.bundle, color: "#f1f5f9" },
            { label: "Cost (base price)", value: `GH₵ ${cost.toFixed(2)}`, color: "#22c55e", big: true },
          ].map((row, i) => (
            <div key={i} style={{ ...modal.summaryRow, borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <span style={modal.summaryLabel}>{row.label}</span>
              <span style={{ ...modal.summaryValue, color: row.color, fontSize: row.big ? 20 : 14, fontWeight: row.big ? 900 : 700 }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* Wallet check */}
        <div style={{
          ...modal.walletRow,
          background: hasFunds ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${hasFunds ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.3)"}`,
        }}>
          <span style={{ fontSize: 13, color: hasFunds ? "#86efac" : "#fca5a5", fontWeight: 700 }}>
            {hasFunds ? "💰" : "⚠️"} Wallet Balance:
            <strong style={{ color: hasFunds ? "#22c55e" : "#ef4444", marginLeft: 6 }}>
              GH₵ {walletBalance.toFixed(2)}
            </strong>
          </span>
          {!hasFunds && (
            <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>
              Need GH₵ {(cost - walletBalance).toFixed(2)} more — please top up
            </span>
          )}
        </div>

        {/* Phone input */}
        <label style={modal.label}>📱 Recipient Phone Number</label>
        <input
          type="tel"
          placeholder="e.g. 0244000000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={modal.input}
          disabled={processing}
        />

        {/* Confirm checkbox */}
        <label style={modal.checkRow}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            disabled={processing}
            style={{ marginRight: 8, accentColor: "#38bdf8", width: 15, height: 15, flexShrink: 0, marginTop: 2 }}
          />
          <span style={modal.checkText}>
            I confirm this number is correct.{" "}
            <strong style={{ color: "#f87171" }}>Wrong numbers will NOT be refunded.</strong>
          </span>
        </label>

        <button
          onClick={() => onConfirm(phone.trim())}
          disabled={!canSubmit}
          style={{
            ...modal.buyBtn,
            opacity: canSubmit ? 1 : 0.4,
            cursor: canSubmit ? "pointer" : "not-allowed",
            background: hasFunds
              ? "linear-gradient(135deg, #22c55e, #16a34a)"
              : "linear-gradient(135deg, #ef4444, #b91c1c)",
          }}
        >
          {processing
            ? "⏳ Processing..."
            : !hasFunds
            ? "❌ Insufficient Balance"
            : `✅ Buy for GH₵ ${cost.toFixed(2)}`}
        </button>

        <p style={modal.note}>
          🔐 Amount deducted instantly from wallet · No Paystack fees
        </p>
      </div>
    </div>
  );
}

// =========================
// LOW BALANCE BANNER
// =========================
function LowBalanceBanner({ balance, onDeposit }) {
  if (balance >= 5) return null;
  return (
    <div style={banner.wrap}>
      <div style={banner.inner}>
        <span style={banner.icon}>⚠️</span>
        <div style={banner.text}>
          <span style={banner.title}>Low Wallet Balance</span>
          <span style={banner.sub}>GH₵ {balance.toFixed(2)} remaining — top up to keep buying</span>
        </div>
        <button style={banner.btn} onClick={onDeposit}>Top Up</button>
      </div>
    </div>
  );
}

// =========================
// MAIN PAGE
// =========================
export default function AgentBuyData({ user, setPage }) {
  const [step, setStep] = useState(1); // 1=network, 2=bundles
  const [network, setNetwork] = useState("");
  const [bundles, setBundles] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Redirect if not agent
  useEffect(() => {
    if (!user) { setPage("login"); return; }
    if (user.role !== "agent" || user.agent_status !== "approved") { setPage("dashboard"); }
  }, [user, setPage]);

  // Load base prices + wallet
  // Reuses /agent/pricing/{id} — same endpoint as AgentPricing,
  // which returns { prices: [{ network, bundle, base_price, markup }] }
  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [pricingRes, dashRes] = await Promise.all([
          fetch(`${API}/agent/pricing/${user.id}`),
          fetch(`${API}/agent/dashboard/${user.id}`),
        ]);
        const pricingData = await pricingRes.json();
        const dashData = await dashRes.json();

        // Normalise to { network, bundle, cost_price } for use in this page
        const normalized = (pricingData.prices || []).map((item) => ({
          network: item.network,
          bundle: item.bundle,
          cost_price: Number(item.base_price || 0),
        }));

        setBundles(normalized);
        setWalletBalance(Number(dashData.wallet_balance || 0));
      } catch (err) {
        console.error(err);
        setError("Failed to load data. Please refresh.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const availableNetworks = [...new Set(bundles.map((b) => b.network))];

  const networkBundles = bundles
    .filter((b) => b.network === network)
    .sort((a, b) => Number(a.cost_price) - Number(b.cost_price));

  const cfg = NETWORK_CONFIG[network] || {};

  // Place order via wallet deduction
  const placeOrder = async (phone) => {
    if (!selected || !user?.id) return;
    setProcessing(true);
    try {
      const res = await fetch(`${API}/agent/buy-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: user.id,
          network: selected.network,
          bundle: selected.bundle,
          phone_number: phone,
        }),
      });
      const data = await res.json();
      if (data.status === "success" || data.status === "created") {
        setSelected(null);
        setSuccessMsg(`✅ ${selected.bundle} sent to ${phone}!`);
        // Refresh wallet balance
        const dashRes = await fetch(`${API}/agent/dashboard/${user.id}`);
        const dashData = await dashRes.json();
        setWalletBalance(Number(dashData.wallet_balance || 0));
        setTimeout(() => setSuccessMsg(""), 5000);
      } else {
        alert(data.message || data.error || "Purchase failed. Please try again.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.backBtn} onClick={() => step === 2 ? setStep(1) : setPage("agent-dashboard")}>
            ←
          </button>
          <div>
            <div style={styles.brand}>📡 Buy Data</div>
            <div style={styles.brandSub}>Agent Purchase · Base Pricing</div>
          </div>
        </div>
        <div style={styles.walletChip}>
          <span style={styles.walletChipLabel}>Wallet</span>
          <span style={styles.walletChipVal}>GH₵ {walletBalance.toFixed(2)}</span>
        </div>
      </div>

      <div style={styles.main}>

        {/* LOW BALANCE BANNER */}
        <LowBalanceBanner balance={walletBalance} onDeposit={() => setPage("agent-deposit")} />

        {/* SUCCESS TOAST */}
        {successMsg && (
          <div style={styles.successToast}>{successMsg}</div>
        )}

        {error && (
          <div style={styles.errorBox}>⚠️ {error}</div>
        )}

        {loading ? (
          <div style={styles.loadingWrap}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <p style={styles.loadingText}>Loading bundles...</p>
          </div>
        ) : (
          <>
            {/* PROGRESS STEPS */}
            <div style={styles.progressWrap}>
              {["Network", "Bundle", "Confirm"].map((label, i) => {
                const active = step === i + 1;
                const done = step > i + 1;
                return (
                  <div key={i} style={styles.progressItem}>
                    <div style={{
                      ...styles.progressDot,
                      background: done ? "#22c55e" : active ? "#38bdf8" : "rgba(255,255,255,0.08)",
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

            {/* ====== STEP 1 — NETWORK ====== */}
            {step === 1 && (
              <div style={styles.card}>
                <p style={styles.stepLabel}>Select Network</p>

                <div style={styles.networkGrid}>
                  {availableNetworks.map((netKey) => {
                    const c = NETWORK_CONFIG[netKey] || {
                      label: netKey, emoji: "📡", color: "#64748b",
                      bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)",
                      tag: "", tagColor: "#64748b",
                    };
                    // Count bundles + cheapest price for this network
                    const netBundles = bundles.filter((b) => b.network === netKey);
                    const cheapest = Math.min(...netBundles.map((b) => Number(b.cost_price)));
                    return (
                      <div
                        key={netKey}
                        style={{ ...styles.networkCard, background: c.bg, border: `1px solid ${c.border}` }}
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
                        <div style={styles.networkInfo}>
                          <div style={{ ...styles.networkName, color: c.color }}>{c.label}</div>
                          <div style={styles.networkMeta}>
                            {netBundles.length} bundles · from GH₵ {cheapest.toFixed(2)}
                          </div>
                        </div>
                        <div style={{ ...styles.networkArrow, color: c.color }}>→</div>
                      </div>
                    );
                  })}
                </div>

                {/* Wallet reminder */}
                <div style={styles.balanceReminder}>
                  <span style={{ color: "#64748b", fontSize: 12, fontWeight: 600 }}>
                    💡 You're buying at base (cost) price — no markup
                  </span>
                </div>
              </div>
            )}

            {/* ====== STEP 2 — BUNDLES ====== */}
            {step === 2 && (
              <div style={styles.card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                  <div style={{
                    ...styles.networkPill,
                    background: cfg.bg,
                    border: `1px solid ${cfg.border}`,
                    color: cfg.color,
                  }}>
                    {cfg.emoji} {cfg.label || network}
                  </div>
                  <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>
                    {networkBundles.length} bundles available
                  </span>
                </div>

                <p style={styles.stepLabel}>Pick a Bundle</p>

                {networkBundles.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0" }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                    <p style={{ color: "#475569", fontSize: 14 }}>No bundles available.</p>
                  </div>
                ) : (
                  <div style={styles.bundleGrid}>
                    {networkBundles.map((item, i) => {
                      const accent = bundleAccents[i % bundleAccents.length];
                      const canAfford = walletBalance >= Number(item.cost_price);
                      return (
                        <div
                          key={i}
                          style={{
                            ...styles.bundleCard,
                            border: `1px solid ${canAfford ? accent.border : "rgba(239,68,68,0.2)"}`,
                            opacity: canAfford ? 1 : 0.55,
                            cursor: canAfford ? "pointer" : "not-allowed",
                          }}
                          onClick={() => canAfford && setSelected(item)}
                        >
                          <div style={styles.bundleSize}>{item.bundle}</div>
                          <div style={{ ...styles.bundlePrice, color: canAfford ? accent.price : "#ef4444" }}>
                            GH₵ {Number(item.cost_price).toFixed(2)}
                          </div>
                          {canAfford ? (
                            <div style={{ ...styles.bundleCta, color: accent.price }}>Select →</div>
                          ) : (
                            <div style={styles.bundleInsufficient}>Low balance</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Top up nudge */}
                <button style={styles.topUpBtn} onClick={() => setPage("agent-deposit")}>
                  ➕ Top Up Wallet · GH₵ {walletBalance.toFixed(2)} remaining
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* CONFIRM MODAL */}
      {selected && (
        <ConfirmModal
          bundle={selected}
          network={network}
          cfg={cfg}
          walletBalance={walletBalance}
          processing={processing}
          onClose={() => { if (!processing) setSelected(null); }}
          onConfirm={placeOrder}
        />
      )}
    </div>
  );
}

// =========================
// STYLES
// =========================
const styles = {
  container: { minHeight: "100vh", color: "#e5e7eb", fontFamily: "ui-sans-serif, system-ui, Arial" },

  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(15,23,42,0.9)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: 16, cursor: "pointer", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 16, fontWeight: 900, color: "#f1f5f9" },
  brandSub: { fontSize: 11, color: "#475569", fontWeight: 600, marginTop: 1 },
  walletChip: { display: "flex", flexDirection: "column", alignItems: "flex-end", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, padding: "6px 12px" },
  walletChipLabel: { fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" },
  walletChipVal: { fontSize: 15, fontWeight: 900, color: "#22c55e" },

  main: { maxWidth: 520, margin: "0 auto", padding: "20px 16px 80px" },

  successToast: { background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", color: "#86efac", padding: "13px 16px", borderRadius: 14, fontSize: 14, fontWeight: 700, marginBottom: 16, textAlign: "center" },
  errorBox: { background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", padding: "12px 16px", borderRadius: 12, fontSize: 14, marginBottom: 16 },
  loadingWrap: { textAlign: "center", padding: "60px 0" },
  loadingText: { fontSize: 15, color: "#64748b", fontWeight: 600 },

  progressWrap: { display: "flex", justifyContent: "center", alignItems: "center", position: "relative", maxWidth: 340, margin: "0 auto 22px" },
  progressItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, position: "relative", zIndex: 1 },
  progressDot: { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, transition: "all 0.3s" },
  progressLabel: { fontSize: 10, fontWeight: 700, transition: "color 0.3s" },
  progressLine: { position: "absolute", top: 16, left: "16%", right: "16%", height: 2, background: "rgba(255,255,255,0.06)", zIndex: 0 },

  card: { background: "rgba(15,23,42,0.9)", backdropFilter: "blur(20px)", borderRadius: 22, border: "1px solid rgba(255,255,255,0.07)", padding: "22px 18px", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" },
  stepLabel: { fontSize: 11, color: "#38bdf8", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 16px" },

  networkGrid: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 },
  networkCard: { padding: "14px 16px", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, position: "relative", transition: "transform 0.15s" },
  networkTag: { position: "absolute", top: 10, right: 40, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 50, letterSpacing: "0.5px", textTransform: "uppercase" },
  networkEmoji: { fontSize: 28, flexShrink: 0 },
  networkInfo: { flex: 1 },
  networkName: { fontWeight: 800, fontSize: 15 },
  networkMeta: { fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 2 },
  networkArrow: { fontSize: 18, fontWeight: 900, flexShrink: 0 },

  balanceReminder: { textAlign: "center", padding: "10px 0 2px" },

  networkPill: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 50, fontSize: 13, fontWeight: 900 },

  bundleGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 },
  bundleCard: { background: "rgba(2,6,23,0.7)", borderRadius: 16, padding: "16px 12px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, transition: "transform 0.15s" },
  bundleSize: { fontWeight: 900, fontSize: 18, color: "#f1f5f9" },
  bundlePrice: { fontWeight: 900, fontSize: 16 },
  bundleCta: { fontSize: 11, fontWeight: 800, opacity: 0.75 },
  bundleInsufficient: { fontSize: 10, fontWeight: 800, color: "#ef4444", opacity: 0.8 },

  topUpBtn: { width: "100%", padding: "11px", borderRadius: 14, border: "1px solid rgba(56,189,248,0.2)", background: "rgba(56,189,248,0.06)", color: "#38bdf8", fontWeight: 800, fontSize: 13, cursor: "pointer", textAlign: "center" },
};

const banner = {
  wrap: { marginBottom: 14 },
  inner: { display: "flex", alignItems: "center", gap: 12, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 14, padding: "12px 14px" },
  icon: { fontSize: 20, flexShrink: 0 },
  text: { flex: 1, display: "flex", flexDirection: "column", gap: 2 },
  title: { fontSize: 13, fontWeight: 800, color: "#fbbf24" },
  sub: { fontSize: 11, color: "#92400e", fontWeight: 600 },
  btn: { padding: "7px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#000", fontWeight: 900, fontSize: 12, cursor: "pointer", flexShrink: 0 },
};

const modal = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 },
  box: { width: "100%", maxWidth: 480, background: "#0f172a", borderRadius: "24px 24px 0 0", padding: "22px 20px 40px", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)", fontFamily: "ui-sans-serif, system-ui, Arial" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  headerLabel: { fontWeight: 900, fontSize: 16, color: "#f1f5f9" },
  closeBtn: { background: "rgba(255,255,255,0.08)", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer", padding: "6px 10px", borderRadius: 50, fontWeight: 800 },
  summary: { borderRadius: 16, padding: "10px 16px", marginBottom: 14 },
  summaryHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" },
  summaryRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" },
  summaryLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },
  summaryValue: { fontSize: 14, fontWeight: 700, color: "#e5e7eb" },
  walletRow: { borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 4 },
  label: { display: "block", fontSize: 12, color: "#64748b", fontWeight: 800, marginBottom: 6 },
  input: { width: "100%", padding: "13px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.75)", color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 14, boxSizing: "border-box", outline: "none" },
  checkRow: { display: "flex", alignItems: "flex-start", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", padding: "12px 14px", borderRadius: 14, marginBottom: 18, cursor: "pointer" },
  checkText: { fontSize: 12, color: "#94a3b8", lineHeight: 1.55, fontWeight: 600 },
  buyBtn: { width: "100%", padding: 15, borderRadius: 16, border: "none", color: "white", fontWeight: 900, fontSize: 15, cursor: "pointer", boxShadow: "0 6px 24px rgba(34,197,94,0.25)", marginBottom: 10, transition: "opacity 0.2s" },
  note: { textAlign: "center", fontSize: 11, color: "#475569", margin: 0, fontWeight: 600 },
};
