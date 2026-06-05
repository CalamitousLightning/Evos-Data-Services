import { useEffect, useState } from "react";

const API_BASE = "https://api.evosdata.xyz";

export default function Success() {
  const [status, setStatus] = useState("verifying");
  const [detail, setDetail] = useState({});

  const params = new URLSearchParams(window.location.search);
  const rawRef    = params.get("reference") || "";
  const trxref    = params.get("trxref") || "";
  const reference = rawRef.startsWith("EVOS-") ? rawRef : trxref || rawRef;
  const type      = params.get("type");

  useEffect(() => {
    const verify = async () => {
      if (!reference) {
        setStatus("error");
        setDetail({ message: "No payment reference found." });
        return;
      }
      try {
        if (type === "deposit" || reference.startsWith("EVOS-DEP-")) {
          const res = await fetch(`${API_BASE}/agent/deposit/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference }),
          });
          const data = await res.json();

          if (data.status === "credited" || data.status === "already_credited") {
            setStatus("deposit_success");
            setDetail({ credited: data.credited_amount, balance: data.wallet_balance });
          } else {
            setStatus("error");
            setDetail({ message: data.error || "Deposit verification failed." });
          }
        } else {
          const res = await fetch(`${API_BASE}/orders/sync/${reference}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const data = await res.json();

          if (
            data.status === "success" ||
            data.status === "processing" ||
            data.status === "successful"
          ) {
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
    <div style={styles.container}>
      <div style={styles.card}>
        <h2>Payment Status</h2>

        {status === "verifying" && (
          <p style={styles.info}>🔄 Verifying your payment...</p>
        )}

        {/* ── covers both order and deposit success ── */}
        {(status === "order_success" || status === "deposit_success") && (
          <p style={styles.success}>
            ✅ Payment successful! Your order is being processed.
          </p>
        )}

        {status === "error" && (
          <p style={styles.error}>
            ❌ {detail.message}  {/* ← was `message`, now `detail.message` */}
          </p>
        )}

        <button
          style={styles.button}
          onClick={() => (window.location.href = "/")}
        >
          Go Home
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "80vh",
  },
  card: {
    padding: "30px",
    borderRadius: "15px",
    background: "white",
    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
    textAlign: "center",
    width: "90%",
    maxWidth: "400px",
  },
  info:    { color: "#3b82f6" },
  success: { color: "#10b981", fontWeight: "bold" },
  error:   { color: "#ef4444", fontWeight: "bold" },
  button: {
    marginTop: "20px",
    padding: "10px 20px",
    borderRadius: "8px",
    border: "none",
    background: "#0f172a",
    color: "white",
    cursor: "pointer",
  },
};
