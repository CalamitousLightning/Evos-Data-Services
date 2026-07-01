import { useEffect, useState } from "react";

const API_BASE = "https://api.evosdata.xyz";
const NETWORKS = ["MTN", "TELECEL", "AIRTELTIGO"];
const NETWORK_LABELS = { MTN: "MTN", TELECEL: "Telecel", AIRTELTIGO: "AirtelTigo" };

export default function AgentWithdraw({ user, setPage }) {
  // ── step 1 = provider, 2 = amount, 3 = number+network, 4 = confirm ──
  const [step, setStep] = useState(1);

  const [provider, setProvider] = useState(""); // "paystack" | "moolre"
  const [amount, setAmount] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [network, setNetwork] = useState("");

  // resolved in step 4
  const [resolvedName, setResolvedName] = useState("");
  const [recipientCode, setRecipientCode] = useState(""); // returned by verify-account (Paystack)

  const [wallet, setWallet] = useState(0);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState({ text: "", ok: false });
  const [done, setDone] = useState(false);

  // ── load wallet ────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const token = sessionStorage.getItem("agentToken");
        const res = await fetch(`${API_BASE}/agent/dashboard/${user.id}`, {
          headers: { "X-Agent-Token": token },
        });
        const data = await res.json();
        setWallet(Number(data.wallet_balance || 0));
      } catch {
        /* silent */
      }
    })();
  }, [user]);

  const say = (text, ok = false) => setMessage({ text, ok });
  const clear = () => setMessage({ text: "", ok: false });

  // ── safe fetch helper: never throws on non-2xx, always returns parsed data ──
  const safeFetch = async (url, options = {}) => {
    const res = await fetch(url, options);
    const text = await res.text();
    try {
      return { ok: res.ok, status: res.status, data: JSON.parse(text) };
    } catch {
      // backend returned HTML (500 page) or empty body
      console.error("Non-JSON response from", url, "→", text.slice(0, 200));
      return {
        ok: false,
        status: res.status,
        data: { error: `Server error (${res.status}) — check Supabase migration & backend deploy.` },
      };
    }
  };

  // ── step validators ────────────────────────────────────────────────
  const validateStep1 = () => {
    if (!provider) { say("Choose a withdrawal method to continue."); return false; }
    return true;
  };

  const validateStep2 = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { say("Enter a valid amount."); return false; }
    if (amt < 5)          { say("Minimum withdrawal is GH₵ 5."); return false; }
    if (amt > wallet)     { say("Amount exceeds your available balance."); return false; }
    return true;
  };

  const validateStep3 = () => {
    const cleaned = mobileNumber.replace(/[\s\-()]/g, "");
    if (!network)              { say("Select your mobile money network."); return false; }
    if (cleaned.length < 9)    { say("Enter a valid mobile number."); return false; }
    return true;
  };

  // ── step 3 → 4: verify account name ───────────────────────────────
  const verifyAccount = async () => {
    if (!validateStep3()) return;

    // Moolre has no name-lookup — skip directly to confirm
    if (provider === "moolre") {
      setResolvedName("");
      setRecipientCode("");
      setStep(4);
      clear();
      return;
    }

    setVerifying(true);
    clear();
    try {
      const token = sessionStorage.getItem("agentToken");
      const { data } = await safeFetch(`${API_BASE}/agent/withdraw/verify-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Agent-Token": token },
        body: JSON.stringify({
          agent_id: user.id,
          mobile_number: mobileNumber.replace(/[\s\-()]/g, ""),
          network,
          provider,
        }),
      });

      if (data.status !== "success") {
        // If Paystack can't verify, still let agent proceed — they accepted the risk warning
        setResolvedName("");
        setRecipientCode("");
        setStep(4);
        say(data.message || "Account name could not be verified. Confirm only if you are sure the number is correct.");
      } else {
        setResolvedName(data.account_name || "");
        setRecipientCode(data.recipient_code || "");
        setStep(4);
        clear();
      }
    } catch (err) {
      console.error("verifyAccount error:", err);
      say("Could not reach the server. Check your connection and try again.");
    } finally {
      setVerifying(false);
    }
  };

  // ── final withdraw ─────────────────────────────────────────────────
  const withdraw = async () => {
    setLoading(true);
    clear();
    try {
      const token = sessionStorage.getItem("agentToken");
      const { ok, status, data } = await safeFetch(`${API_BASE}/agent/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Agent-Token": token },
        body: JSON.stringify({
          agent_id: user.id,
          amount: Number(amount),
          mobile_number: mobileNumber.replace(/[\s\-()]/g, ""),
          network,
          account_name: resolvedName,
          provider,
        }),
      });

      if (data.status === "success") {
        setWallet((p) => p - Number(amount));
        setDone(true);
        say(data.message || "Transfer initiated. Funds will arrive shortly.", true);
      } else {
        // Show the real error so the agent knows exactly what went wrong
        const errText = data.error || data.message || data.detail || `Request failed (HTTP ${status})`;
        say(errText);
        console.error("Withdraw API error:", status, data);
      }
    } catch (err) {
      console.error("Withdraw fetch error:", err);
      say("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1); setProvider(""); setAmount(""); setMobileNumber("");
    setNetwork(""); setResolvedName(""); setRecipientCode("");
    setDone(false); clear();
  };

  // ── shared styles ──────────────────────────────────────────────────
  const S = styles;

  // ── success screen ─────────────────────────────────────────────────
  if (done) {
    return (
      <div style={S.container}>
        <div style={S.successCard}>
          <div style={S.successIcon}>✅</div>
          <h2 style={S.successTitle}>Transfer Initiated</h2>
          <p style={S.successSub}>
            GH₵ {Number(amount).toFixed(2)} is on its way to {mobileNumber}.
            Funds typically arrive within a few minutes.
          </p>
          <div style={S.successMeta}>
            <span style={S.metaLabel}>Via</span>
            <span style={S.metaValue}>{provider === "paystack" ? "Paystack" : "Moolre"}</span>
          </div>
          {resolvedName ? (
            <div style={S.successMeta}>
              <span style={S.metaLabel}>Account</span>
              <span style={S.metaValue}>{resolvedName}</span>
            </div>
          ) : null}
          <div style={S.successMeta}>
            <span style={S.metaLabel}>New balance</span>
            <span style={S.metaValue}>GH₵ {wallet.toFixed(2)}</span>
          </div>
          <button onClick={reset} style={{ ...S.primaryBtn, marginTop: 20 }}>
            Make Another Withdrawal
          </button>
          <button onClick={() => setPage("agent-dashboard")} style={S.ghostBtn}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.container}>
      {/* header */}
      <div style={S.header}>
        <h2 style={S.title}>Withdraw Funds</h2>
        <div style={S.balancePill}>
          GH₵ {wallet.toFixed(2)} available
        </div>
      </div>

      {/* step tracker */}
      <div style={S.stepTrack}>
        {["Method", "Amount", "Details", "Confirm"].map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done_  = step > n;
          return (
            <div key={n} style={S.stepItem}>
              <div style={{
                ...S.stepDot,
                background: done_ ? "#22c55e" : active ? "#38bdf8" : "rgba(255,255,255,0.08)",
                color:      done_ || active ? "#000" : "#475569",
                border:     active ? "2px solid #38bdf8" : done_ ? "2px solid #22c55e" : "2px solid rgba(255,255,255,0.08)",
              }}>
                {done_ ? "✓" : n}
              </div>
              <span style={{ ...S.stepLabel, color: active ? "#e2e8f0" : "#475569" }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* message */}
      {message.text && (
        <div style={{
          ...S.msgBox,
          background: message.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border:     message.ok ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(239,68,68,0.35)",
          color:      message.ok ? "#4ade80" : "#f87171",
        }}>
          {message.text}
        </div>
      )}

{/* ── STEP 1: choose provider ─────────────────────────────────── */}
{step === 1 && (
  <div>
    <p style={S.stepHeading}>How would you like to withdraw?</p>
    <div style={S.providerGrid}>

      {/* PAYSTACK — shown but disabled until account is approved */}
      <div
        style={{
          ...S.providerCard,
          border: "2px solid rgba(255,255,255,0.05)",
          background: "rgba(15,23,42,0.4)",
          opacity: 0.45,
          cursor: "not-allowed",
          position: "relative",
        }}
      >
        <div style={S.providerIcon}>🏦</div>
        <div style={S.providerName}>Paystack</div>
        <div style={S.providerDesc}>
          Coming soon — account activation in progress
        </div>
        <div style={{
          position: "absolute", top: 10, right: 12,
          fontSize: 10, fontWeight: 800,
          color: "#f59e0b",
          background: "rgba(245,158,11,0.12)",
          border: "1px solid rgba(245,158,11,0.3)",
          padding: "2px 8px", borderRadius: 20,
        }}>
          PENDING
        </div>
      </div>

      {/* MOOLRE — active */}
      <div
        onClick={() => { setProvider("moolre"); clear(); }}
        style={{
          ...S.providerCard,
          border: provider === "moolre"
            ? "2px solid #a78bfa"
            : "2px solid rgba(255,255,255,0.07)",
          background: provider === "moolre"
            ? "rgba(167,139,250,0.08)"
            : "rgba(15,23,42,0.7)",
        }}
      >
        <div style={S.providerIcon}>📱</div>
        <div style={S.providerName}>Moolre</div>
        <div style={S.providerDesc}>
          Instant mobile money transfer · MTN, Telecel, AirtelTigo
        </div>
        {provider === "moolre" && (
          <div style={{ ...S.providerCheck, color: "#a78bfa" }}>✓</div>
        )}
      </div>

    </div>

    <button
      onClick={() => { if (validateStep1()) { clear(); setStep(2); } }}
      style={S.primaryBtn}
    >
      Continue →
    </button>
  </div>
)}

      {/* ── STEP 2: amount ─────────────────────────────────────────── */}
      {step === 2 && (
        <div>
          <p style={S.stepHeading}>How much do you want to withdraw?</p>

          <label style={S.label}>Amount (GH₵)</label>
          <input
            type="number"
            inputMode="decimal"
            placeholder="e.g. 50"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); clear(); }}
            style={S.input}
            autoFocus
          />

          {/* quick-pick */}
          <div style={S.quickRow}>
            {[10, 20, 50, 100].map((v) => (
              <div
                key={v}
                onClick={() => { setAmount(String(v)); clear(); }}
                style={{
                  ...S.quickChip,
                  background: Number(amount) === v ? "#38bdf8" : "rgba(255,255,255,0.05)",
                  color:      Number(amount) === v ? "#000" : "#94a3b8",
                  border:     Number(amount) === v ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                GH₵ {v}
              </div>
            ))}
          </div>

          <p style={S.hint}>Max: GH₵ {wallet.toFixed(2)} · Min: GH₵ 5</p>

          <div style={S.navRow}>
            <button onClick={() => { clear(); setStep(1); }} style={S.ghostBtn}>← Back</button>
            <button
              onClick={() => { if (validateStep2()) { clear(); setStep(3); } }}
              style={{ ...S.primaryBtn, flex: 1, marginLeft: 10, marginBottom: 0 }}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: network + number ────────────────────────────────── */}
      {step === 3 && (
        <div>
          <p style={S.stepHeading}>Where should we send it?</p>

          <label style={S.label}>Mobile Money Network</label>
          <div style={S.networkRow}>
            {NETWORKS.map((n) => (
              <div
                key={n}
                onClick={() => { setNetwork(n); clear(); }}
                style={{
                  ...S.networkBtn,
                  background: network === n ? "#38bdf8" : "rgba(255,255,255,0.05)",
                  color:      network === n ? "#000" : "#e5e7eb",
                  border:     network === n ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.08)",
                  fontWeight: network === n ? 800 : 500,
                }}
              >
                {NETWORK_LABELS[n]}
              </div>
            ))}
          </div>

          <label style={S.label}>Mobile Money Number</label>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="e.g. 0244000000"
            value={mobileNumber}
            onChange={(e) => { setMobileNumber(e.target.value); clear(); }}
            style={S.input}
            autoFocus
          />

          {provider === "paystack" && (
            <p style={S.hint}>
              We'll verify the account name before sending — you'll see it on the next screen.
            </p>
          )}
          {provider === "moolre" && (
            <p style={S.hint}>
              Double-check the number carefully — Moolre does not verify names. Wrong details cannot be reversed.
            </p>
          )}

          <div style={S.navRow}>
            <button onClick={() => { clear(); setStep(2); }} style={S.ghostBtn}>← Back</button>
            <button
              onClick={verifyAccount}
              disabled={verifying}
              style={{ ...S.primaryBtn, flex: 1, marginLeft: 10, marginBottom: 0, opacity: verifying ? 0.6 : 1 }}
            >
              {verifying ? "Verifying…" : "Verify Account →"}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: confirm ─────────────────────────────────────────── */}
      {step === 4 && (
        <div>
          <p style={S.stepHeading}>Confirm your withdrawal</p>

          <div style={S.confirmCard}>
            <ConfirmRow label="Amount"   value={`GH₵ ${Number(amount).toFixed(2)}`} highlight />
            <ConfirmRow label="To"       value={mobileNumber} />
            <ConfirmRow label="Network"  value={NETWORK_LABELS[network] || network} />
            <ConfirmRow label="Via"      value={provider === "paystack" ? "Paystack" : "Moolre"} />
            {resolvedName ? (
              <ConfirmRow label="Account name" value={resolvedName} verified />
            ) : (
              <ConfirmRow label="Account name" value="Not verified — double-check number" warn />
            )}
            <div style={S.confirmDivider} />
            <ConfirmRow label="Balance after" value={`GH₵ ${(wallet - Number(amount)).toFixed(2)}`} />
          </div>

          {resolvedName ? (
            <div style={S.verifiedBadge}>
              ✅ Account name verified — funds will go to <strong>{resolvedName}</strong>
            </div>
          ) : (
            <div style={S.warnBadge}>
              ⚠️ No name resolved. Make sure the number is correct before proceeding — transfers cannot be reversed.
            </div>
          )}

          <button
            onClick={withdraw}
            disabled={loading}
            style={{ ...S.primaryBtn, background: "linear-gradient(135deg,#22c55e,#16a34a)", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Sending…" : `Confirm & Send GH₵ ${Number(amount).toFixed(2)}`}
          </button>

          <div style={S.navRow}>
            <button onClick={() => { clear(); setStep(3); }} style={{ ...S.ghostBtn, flex: 1 }}>
              ← Edit Details
            </button>
          </div>
        </div>
      )}

      {/* back to dashboard always visible */}
      {!done && (
        <button onClick={() => setPage("agent-dashboard")} style={{ ...S.ghostBtn, marginTop: 8 }}>
          Back to Dashboard
        </button>
      )}
    </div>
  );
}

// ── small confirm row component ─────────────────────────────────────
function ConfirmRow({ label, value, highlight, verified, warn }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "9px 0",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>{label}</span>
      <span style={{
        fontSize: highlight ? 16 : 13,
        fontWeight: highlight ? 900 : 600,
        color: highlight ? "#38bdf8" : verified ? "#4ade80" : warn ? "#f87171" : "#e2e8f0",
      }}>
        {value}
      </span>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────
const styles = {
  container: {
    maxWidth: 480,
    margin: "0 auto",
    padding: "20px 18px 40px",
    color: "#e5e7eb",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    margin: 0,
  },
  balancePill: {
    fontSize: 12,
    fontWeight: 700,
    color: "#38bdf8",
    background: "rgba(56,189,248,0.1)",
    border: "1px solid rgba(56,189,248,0.25)",
    padding: "5px 12px",
    borderRadius: 20,
  },

  // step tracker
  stepTrack: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 24,
    position: "relative",
  },
  stepItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    flex: 1,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 800,
    transition: "0.2s",
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  msgBox: {
    padding: "12px 14px",
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 1.5,
  },

  stepHeading: {
    fontSize: 15,
    fontWeight: 700,
    color: "#cbd5e1",
    marginBottom: 18,
    marginTop: 4,
  },

  // provider cards
  providerGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 20,
  },
  providerCard: {
    padding: "16px 18px",
    borderRadius: 14,
    cursor: "pointer",
    position: "relative",
    transition: "0.15s",
  },
  providerIcon: { fontSize: 22, marginBottom: 6 },
  providerName: { fontSize: 15, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 },
  providerDesc: { fontSize: 12, color: "#64748b", lineHeight: 1.5 },
  providerCheck: {
    position: "absolute",
    top: 14,
    right: 16,
    fontSize: 16,
    fontWeight: 900,
    color: "#38bdf8",
  },

  // amount quick picks
  quickRow: {
    display: "flex",
    gap: 8,
    marginBottom: 10,
  },
  quickChip: {
    flex: 1,
    padding: "8px 0",
    borderRadius: 8,
    textAlign: "center",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    transition: "0.15s",
  },
  hint: {
    fontSize: 11,
    color: "#475569",
    marginBottom: 18,
    lineHeight: 1.5,
    margin: "0 0 16px",
  },

  // network buttons
  networkRow: {
    display: "flex",
    gap: 10,
    marginBottom: 16,
  },
  networkBtn: {
    flex: 1,
    padding: "10px 0",
    borderRadius: 10,
    textAlign: "center",
    cursor: "pointer",
    fontSize: 13,
    transition: "0.15s",
  },

  // confirm card
  confirmCard: {
    background: "rgba(15,23,42,0.9)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 14,
    padding: "4px 16px 8px",
    marginBottom: 14,
  },
  confirmDivider: {
    height: 1,
    background: "rgba(255,255,255,0.07)",
    margin: "4px 0",
  },

  verifiedBadge: {
    background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.3)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 12,
    color: "#4ade80",
    marginBottom: 16,
    lineHeight: 1.5,
  },
  warnBadge: {
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 12,
    color: "#f87171",
    marginBottom: 16,
    lineHeight: 1.5,
  },

  // buttons
  primaryBtn: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg,#38bdf8,#0ea5e9)",
    color: "#000",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 15,
    marginBottom: 10,
    transition: "0.15s",
  },
  ghostBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.04)",
    color: "#94a3b8",
    border: "1px solid rgba(255,255,255,0.07)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 0,
    width: "100%",
  },
  navRow: {
    display: "flex",
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },

  // success screen
  successCard: {
    marginTop: 40,
    textAlign: "center",
    padding: "0 10px",
  },
  successIcon: { fontSize: 52, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: 900, marginBottom: 10 },
  successSub: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 1.6,
    marginBottom: 24,
  },
  successMeta: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 16px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    marginBottom: 8,
  },
  metaLabel: { fontSize: 12, color: "#475569" },
  metaValue: { fontSize: 13, fontWeight: 700, color: "#e2e8f0" },

  label: {
    display: "block",
    fontSize: 12,
    color: "#64748b",
    fontWeight: 600,
    marginBottom: 7,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    width: "100%",
    padding: "13px 14px",
    marginBottom: 16,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.09)",
    background: "rgba(2,6,23,0.8)",
    color: "white",
    fontSize: 15,
    boxSizing: "border-box",
    outline: "none",
  },
};
