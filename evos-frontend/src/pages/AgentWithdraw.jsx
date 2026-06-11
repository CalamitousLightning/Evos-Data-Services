import { useEffect, useState } from "react";

const API_BASE = "https://api.evosdata.xyz";

const NETWORKS = ["MTN", "Telecel", "AirtelTigo"];

export default function AgentWithdraw({ user, setPage }) {
  const [amount, setAmount] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [network, setNetwork] = useState("");
  const [accountName, setAccountName] = useState("");

  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState(0);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  // =========================
  // LOAD WALLET
  // =========================
  useEffect(() => {
    if (!user?.id) return;
    const loadWallet = async () => {
      try {
        const agentToken = sessionStorage.getItem("agentToken");
        const res = await fetch(`${API_BASE}/agent/dashboard/${user.id}`, {
          headers: { "X-Agent-Token": agentToken },
        });
        const data = await res.json();
        setWallet(Number(data.wallet_balance || 0));
      } catch (err) {
        console.log("Wallet load error:", err);
      }
    };
    loadWallet();
  }, [user]);

  // =========================
  // WITHDRAW
  // =========================
  const withdraw = async () => {
    setMessage("");
    setSuccess(false);

    const amt = Number(amount);

    if (!amt || amt <= 0) return setMessage("Enter a valid amount");
    if (amt < 5) return setMessage("Minimum withdrawal is GH₵5");
    if (amt > wallet) return setMessage("Insufficient balance");
    if (!mobileNumber || mobileNumber.length < 9) return setMessage("Enter a valid mobile number");
    if (!network) return setMessage("Select your mobile money network");

    setLoading(true);

    try {
      const agentToken = sessionStorage.getItem("agentToken");
      const res = await fetch(`${API_BASE}/agent/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Token": agentToken,
        },
        body: JSON.stringify({
          agent_id: user.id,
          amount: amt,
          mobile_number: mobileNumber,
          network: network,
          account_name: accountName,
        }),
      });

      const data = await res.json();

      if (data.status === "success") {
        setSuccess(true);
        setMessage(data.message || "Transfer initiated. Funds will arrive shortly.");
        setWallet((prev) => prev - amt);
        setAmount("");
        setMobileNumber("");
        setNetwork("");
        setAccountName("");
      } else {
        setMessage(data.error || "Withdrawal failed");
      }
    } catch (err) {
      console.log(err);
      setMessage("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Withdraw Funds</h2>

      {/* WALLET BALANCE */}
      <div style={styles.balanceCard}>
        <p style={styles.balanceLabel}>Available Balance</p>
        <h1 style={styles.balanceAmount}>GH₵ {wallet.toFixed(2)}</h1>
      </div>

      {/* MESSAGE */}
      {message && (
        <div style={{
          ...styles.messageBox,
          background: success ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          border: success ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(239,68,68,0.4)",
          color: success ? "#4ade80" : "#f87171",
        }}>
          {message}
        </div>
      )}

      {/* AMOUNT */}
      <label style={styles.label}>Amount (GH₵)</label>
      <input
        type="number"
        placeholder="e.g. 50"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={styles.input}
      />

      {/* NETWORK SELECT */}
      <label style={styles.label}>Mobile Money Network</label>
      <div style={styles.networkRow}>
        {NETWORKS.map((n) => (
          <div
            key={n}
            onClick={() => setNetwork(n)}
            style={{
              ...styles.networkBtn,
              background: network === n ? "#38bdf8" : "rgba(255,255,255,0.05)",
              color: network === n ? "#000" : "#e5e7eb",
              border: network === n ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
              fontWeight: network === n ? 800 : 500,
            }}
          >
            {n}
          </div>
        ))}
      </div>

      {/* MOBILE NUMBER */}
      <label style={styles.label}>Mobile Money Number</label>
      <input
        type="tel"
        placeholder="e.g. 0244000000"
        value={mobileNumber}
        onChange={(e) => setMobileNumber(e.target.value)}
        style={styles.input}
      />

      {/* ACCOUNT NAME (optional) */}
      <label style={styles.label}>Account Name (optional)</label>
      <input
        type="text"
        placeholder="Name on the account"
        value={accountName}
        onChange={(e) => setAccountName(e.target.value)}
        style={styles.input}
      />

      {/* NOTICE */}
      <div style={styles.notice}>
        <p style={{ ...styles.noticeText, color: "#f87171", fontWeight: 800, marginBottom: 6 }}>
          ⚠️ THE WITHDRAWAL SYSTEM IS UNDER REPAIRS. PLEASE TRY AGAIN LATER
        </p>
        <p style={styles.noticeText}>
          Funds are sent automatically via Moolre. Ensure your mobile money number and network are correct — wrong details cannot be reversed.
        </p>
      </div>

      {/* WITHDRAW BUTTON */}
      <button
        onClick={withdraw}
        disabled={loading}
        style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}
      >
        {loading ? "Processing..." : `Withdraw GH₵ ${amount || "0"}`}
      </button>

      <button onClick={() => setPage("agent-dashboard")} style={styles.back}>
        Back to Dashboard
      </button>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: 480,
    margin: "0 auto",
    padding: 20,
    color: "#e5e7eb",
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    marginBottom: 20,
  },
  balanceCard: {
    background: "rgba(15,23,42,0.88)",
    border: "1px solid rgba(255,255,255,0.07)",
    padding: "18px 20px",
    borderRadius: 16,
    marginBottom: 20,
    textAlign: "center",
  },
  balanceLabel: {
    color: "#94a3b8",
    fontSize: 13,
    margin: "0 0 6px",
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 900,
    color: "#38bdf8",
    margin: 0,
  },
  messageBox: {
    padding: "12px 14px",
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 1.5,
  },
  label: {
    display: "block",
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    marginBottom: 16,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "#020617",
    color: "white",
    fontSize: 14,
    boxSizing: "border-box",
    outline: "none",
  },
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
  notice: {
    background: "rgba(245,158,11,0.08)",
    border: "1px solid rgba(245,158,11,0.25)",
    borderRadius: 10,
    padding: "10px 14px",
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 12,
    color: "#94a3b8",
    margin: 0,
    lineHeight: 1.55,
  },
  button: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg,#22c55e,#16a34a)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    fontSize: 15,
    marginBottom: 10,
  },
  back: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    background: "#1e293b",
    color: "white",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
  },
};
