import { useEffect, useState } from "react";

const API_BASE = "https://api.evosdata.xyz";

export default function Success() {
  const [status, setStatus] = useState("verifying");
  const [detail, setDetail] = useState({});

  const params    = new URLSearchParams(window.location.search);
  const reference = params.get("reference");
  const type      = params.get("type"); // "deposit" | undefined (order)

  useEffect(() => {
    const verify = async () => {
      if (!reference) {
        setStatus("error");
        setDetail({ message: "No payment reference found." });
        return;
      }

      try {
        if (type === "deposit") {
          // ── WALLET TOP-UP ──
          const res = await fetch(`${API_BASE}/agent/deposit/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference }),
          });
          const data = await res.json();

          if (data.status === "credited" || data.status === "already_credited") {
            setStatus("deposit_success");
            setDetail({
              credited: data.credited_amount,
              balance:  data.wallet_balance,
            });
          } else {
            setStatus("error");
            setDetail({ message: data.error || "Deposit verification failed." });
          }

        } else {
          // ── DATA BUNDLE ORDER ──
          const res = await fetch(`${API_BASE}/orders/sync/${reference}`);
          const data = await res.json();

          if (data.status === "success" || data.status === "processing") {
            setStatus("order_success");
            setDetail({ orderStatus: data.status });
          } else {
            setStatus("error");
            setDetail({ message: data.message || "Order verification failed." });
          }
        }
      } catch (err) {
        console.error(err);
        setStatus("error");
        setDetail({ message: "Network error. Please contact support." });
      }
    };

    verify();
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

            <div style={s.summaryBox}>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Amount Credited</span>
                <span style={{ ...s.summaryVal, color: "#22c55e", fontSize: 22, fontWeight: 900 }}>
                  GH₵ {Number(detail.credited || 0).toFixed(2)}
                </span>
              </div>
              <div style={{ ...s.summaryRow, borderBottom: "none" }}>
                <span style={s.summaryLabel}>New Wallet Balance</span>
                <span style={{ ...s.summaryVal, color: "#38bdf8", fontWeight: 800 }}>
                  GH₵ {Number(detail.balance || 0).toFixed(2)}
                </span>
              </div>
            </div>

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
            <p style={s.sub}>Your data bundle is being processed</p>

            <div style={s.summaryBox}>
              <div style={{ ...s.summaryRow, borderBottom: "none" }}>
                <span style={s.summaryLabel}>Status</span>
                <span style={{ ...s.summaryVal, color: "#22c55e", fontWeight: 800, textTransform: "capitalize" }}>
                  ✅ {detail.orderStatus || "Processing"}
                </span>
              </div>
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

        {/* ── ERROR ── */}
        {status === "error" && (
          <>
            <div style={{ ...s.iconCircle, background: "rgba(239,68,68,0.1)", border: "2px solid rgba(239,68,68,0.25)" }}>
              ❌
            </div>
            <h2 style={{ ...s.title, color: "#ef4444" }}>Something Went Wrong</h2>
            <p style={{ ...s.sub, color: "#f87171" }}>{detail.message}</p>
            <p style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>
              If you were charged, contact support with reference:<br />
              <strong style={{ color: "#94a3b8", fontFamily: "monospace" }}>{reference || "N/A"}</strong>
            </p>

            <div style={s.btnGroup}>
              <button style={s.primaryBtn} onClick={() => window.location.href = "/"}>
                🏠 Go Home
              </button>
              <button
                style={s.secondaryBtn}
                onClick={() => window.open("https://wa.me/233208718943", "_blank")}
              >
                💬 Contact Support
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
  title: {
    fontSize: 22, fontWeight: 900, color: "#f1f5f9",
    margin: "0 0 8px",
  },
  sub: {
    fontSize: 14, color: "#64748b", fontWeight: 600,
    margin: "0 0 20px", lineHeight: 1.5,
  },
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
