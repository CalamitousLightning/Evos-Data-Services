import { useEffect, useState } from "react";
import API from "../api";

export default function Success() {
  const [status, setStatus] = useState("verifying");
  const [message, setMessage] = useState("");

  // 🔥 GET REFERENCE FROM URL
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference");

  useEffect(() => {
    const verify = async () => {
      if (!reference) {
        setStatus("error");
        setMessage("No payment reference found.");
        return;
      }

      try {
        // 🔥 CALL BACKEND SYNC
        const res = await API.post(`/orders/sync/${reference}`);

        setStatus("success");
        setMessage(res.data.status || "Payment verified");

      } catch (err) {
        setStatus("error");
        setMessage("Failed to verify payment");
      }
    };

    verify();
  }, [reference]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2>Payment Status</h2>

        {status === "verifying" && (
          <p style={styles.info}>🔄 Verifying your payment...</p>
        )}

        {status === "success" && (
          <p style={styles.success}>
            ✅ Payment successful! Your order is being processed.
          </p>
        )}

        {status === "error" && (
          <p style={styles.error}>
            ❌ {message}
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
  info: {
    color: "#3b82f6",
  },
  success: {
    color: "#10b981",
    fontWeight: "bold",
  },
  error: {
    color: "#ef4444",
    fontWeight: "bold",
  },
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
