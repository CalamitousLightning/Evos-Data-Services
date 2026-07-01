import { useEffect, useState } from "react";

const API_BASE = "https://api.evosdata.xyz";

export default function Success() {
  const [status, setStatus] = useState("verifying");

  const params    = new URLSearchParams(window.location.search);
  const reference = params.get("reference");
  const type      = params.get("type");

  useEffect(() => {
    if (!reference) {
      setStatus("order_success"); // Paystack sent them here = paid
      return;
    }

    if (type === "deposit") {
      // fire-and-forget
      fetch(`${API_BASE}/agent/deposit/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      }).catch(console.error);

      setStatus("deposit_success");
    } else {
      // fire-and-forget
      fetch(`${API_BASE}/orders/sync/${reference}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(console.error);

      setStatus("order_success");
    }
  }, [reference, type]);

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* ── VERIFYING ── */}
        {status === "verifying" && (
          <>
            <div style={s.spinner}>⏳</div>
            <h2 style={s.title}>Verifying Payment</h2>
            <p style={s.sub}>Please wait, this takes a few seconds...</p>
          </>
        )}

        {/* ── DEPOSIT SUCCESS ── */}
        {status === "deposit_success" && (
          <>
            <div style={{ ...s.iconCircle, background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.3)" }}>
              💰
            </div>
            <h2 style={{ ...s.title, color: "#22c55e" }}>Wallet Topped Up!</h2>
            <p style={s.sub}>Your payment was successful</p>

            <div style={s.btnGroup}>
              <button style={s.primaryBtn} onClick={() => window.location.href = "/agent-buy-data"}>
                📡 Buy Data Now
              </button>
              <button style={s.secondaryBtn} onClick={() => window.location.href = "/agent-dashboard"}>
                🏠 Dashboard
              </button>
            </div>
          </>
        )}

        {/* ── ORDER SUCCESS ── */}
        {status === "order_success" && (
          <>
            <div style={{ ...s.iconCircle, background: "rgba(56,189,248,0.15)", border: "2px solid rgba(56,189,248,0.3)" }}>
              📦
            </div>
            <h2 style={{ ...s.title, color: "#38bdf8" }}>Order Placed!</h2>
            <p style={s.sub}>Your data bundle is being processed ✅</p>

            <div style={s.summaryBox}>
              <div style={{ ...s.summaryRow, borderBottom: "none" }}>
                <span style={s.summaryLabel}>Status</span>
                <span style={{ ...s.summaryVal, color: "#22c55e", fontWeight: 800 }}>
                  ✅ Processing
                </span>
              </div>
            </div>

            {/* ── EVOSGPT PROMO BLOCK ── */}
            <div style={s.promoBox}>
              <div style={s.promoBadge}>🚀 Bonus Unlocked</div>
              <p style={s.promoHeadline}>
                Your EvosData account unlocks more than data.
              </p>
              <p style={s.promoBody}>
                Need help with CVs, business plans, school work, coding, or ideas?
                Meet <strong style={{ color: "#f1f5f9" }}>EVOSGPT</strong> — your AI assistant.
              </p>
              <p style={s.promoSub}>
                Login with your EvosData details and start for free.
              </p>
              <a href="https://evosgpt.xyz" style={s.promoBtn}>
                Try EVOSGPT →
              </a>
            </div>

            <div style={s.btnGroup}>
              <button style={s.primaryBtn} onClick={() => window.location.href = "/eta-track"}>
                📍 Track Order
              </button>
              <button style={s.secondaryBtn} onClick={() => window.location.href = "/"}>
                🏠 Go Home
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

const s = {
  page: {
    display: "flex", justifyContent: "center", alignItems: "center",
    minHeight: "80vh", padding: "20px 16px",
    fontFamily: "ui-sans-serif, system-ui, Arial",
    color: "#e5e7eb",
  },
  card: {
    width: "100%", maxWidth: 400,
    background: "rgba(15,23,42,0.95)",
    backdropFilter: "blur(20px)",
    borderRadius: 24, padding: "32px 24px",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
    textAlign: "center",
  },
  spinner: { fontSize: 48, marginBottom: 16, display: "block" },
  iconCircle: {
    width: 72, height: 72, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 32, margin: "0 auto 18px",
  },
  title: { fontSize: 22, fontWeight: 900, color: "#f1f5f9", margin: "0 0 8px" },
  sub: { fontSize: 14, color: "#64748b", fontWeight: 600, margin: "0 0 20px", lineHeight: 1.5 },
  summaryBox: {
    background: "rgba(2,6,23,0.5)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16, padding: "4px 16px", marginBottom: 22,
  },
  summaryRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  summaryLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  summaryVal: { fontSize: 15, fontWeight: 700, color: "#e5e7eb" },

  /* ── EVOSGPT PROMO BLOCK STYLES ── */
  promoBox: {
    background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(56,189,248,0.1))",
    border: "1px solid rgba(124,58,237,0.3)",
    borderRadius: 18,
    padding: "20px 18px",
    marginBottom: 22,
    textAlign: "center",
  },
  promoBadge: {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.5,
    color: "#c4b5fd",
    background: "rgba(124,58,237,0.15)",
    border: "1px solid rgba(124,58,237,0.35)",
    borderRadius: 999,
    padding: "4px 12px",
    marginBottom: 12,
  },
  promoHeadline: {
    fontSize: 15,
    fontWeight: 800,
    color: "#f1f5f9",
    margin: "0 0 8px",
    lineHeight: 1.4,
  },
  promoBody: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "#cbd5e1",
    margin: "0 0 6px",
    lineHeight: 1.5,
  },
  promoSub: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "#64748b",
    margin: "0 0 16px",
    lineHeight: 1.4,
  },
  promoBtn: {
    display: "inline-block",
    width: "100%",
    boxSizing: "border-box",
    padding: "13px",
    borderRadius: 14,
    border: "none",
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    color: "white",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(124,58,237,0.35)",
    textDecoration: "none",
    fontFamily: "inherit",
  },

  btnGroup: { display: "flex", flexDirection: "column", gap: 10 },
  primaryBtn: {
    width: "100%", padding: "13px", borderRadius: 14, border: "none",
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "white", fontWeight: 900, fontSize: 14, cursor: "pointer",
    boxShadow: "0 4px 16px rgba(34,197,94,0.3)",
    fontFamily: "inherit",
  },
  secondaryBtn: {
    width: "100%", padding: "13px", borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)",
    color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer",
    fontFamily: "inherit",
  },
};
