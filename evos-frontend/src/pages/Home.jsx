import { useEffect, useState } from "react";

export default function Home({ setPage, theme }) {
  const [supportOpen, setSupportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {}, []);

  const features = [
    {
      icon: "⚡",
      title: "Instant Delivery",
      desc: "Orders processed automatically after payment.",
      color: "#f59e0b",
      bg: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))",
      border: "rgba(245,158,11,0.3)",
    },
    {
      icon: "🔒",
      title: "Secure Payments",
      desc: "Trusted Paystack checkout for safe transactions.",
      color: "#22c55e",
      bg: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))",
      border: "rgba(34,197,94,0.3)",
    },
    {
      icon: "📡",
      title: "3 Networks",
      desc: "MTN, Telecel and AirtelTigo in one place.",
      color: "#38bdf8",
      bg: "linear-gradient(135deg, rgba(56,189,248,0.15), rgba(56,189,248,0.05))",
      border: "rgba(56,189,248,0.3)",
    },
    {
      icon: "📊",
      title: "Live Tracking",
      desc: "Track orders anytime using your reference.",
      color: "#a78bfa",
      bg: "linear-gradient(135deg, rgba(167,139,250,0.15), rgba(167,139,250,0.05))",
      border: "rgba(167,139,250,0.3)",
    },
  ];

  const rules = [
    "Please confirm phone number before payment.",
    "No refund for successful delivery to wrong numbers entered by customer.",
    "Refunds apply only to failed or undelivered orders after review.",
    "During network congestion, some orders may delay.",
  ];

  const quickNetworks = [
    {
      name: "MTN",
      label: "MTN",
      emoji: "🟡",
      color: "#FFC107",
      bg: "linear-gradient(135deg, rgba(255,193,7,0.22), rgba(255,193,7,0.07))",
      border: "rgba(255,193,7,0.5)",
      glow: "rgba(255,193,7,0.25)",
    },
    {
      name: "TELECEL",
      label: "Telecel",
      emoji: "🔴",
      color: "#ef4444",
      bg: "linear-gradient(135deg, rgba(239,68,68,0.22), rgba(239,68,68,0.07))",
      border: "rgba(239,68,68,0.5)",
      glow: "rgba(239,68,68,0.25)",
    },
    {
      name: "AIRTELTIGO",
      label: "AirtelTigo",
      emoji: "🔵",
      color: "#6366f1",
      bg: "linear-gradient(135deg, rgba(99,102,241,0.22), rgba(99,102,241,0.07))",
      border: "rgba(99,102,241,0.5)",
      glow: "rgba(99,102,241,0.25)",
    },
  ];

  const handleNetworkClick = (networkName) => {
    localStorage.setItem("selectedNetwork", networkName);
    setPage("shop");
  };

  return (
    <div style={styles.container}>

      {/* ===================== HERO ===================== */}
      <section style={styles.hero}>

        {/* BADGE */}
        <div style={styles.badge}>
          🇬🇭 Ghana's Fastest Data Platform
        </div>

        <h1 style={styles.title}>
          Buy Mobile Data
          <br />
          <span style={styles.highlight}>Instantly & Securely</span>
        </h1>

        <p style={styles.subtitle}>
          Fast, automated data delivery for MTN, Telecel & AirtelTigo —
          powered by EVOS Business HUB.
        </p>

        {/* ===== PLACE ORDER NOW — NETWORK CARDS ===== */}
        <div style={styles.orderNowBox}>
          <p style={styles.orderNowLabel}>⚡ Place Order Now — Pick your network</p>
          <div style={styles.orderNowGrid}>
            {quickNetworks.map((n) => (
              <div
                key={n.name}
                style={{
                  ...styles.orderNowCard,
                  background: n.bg,
                  border: `1.5px solid ${n.border}`,
                  boxShadow: `0 4px 20px ${n.glow}`,
                }}
                onClick={() => handleNetworkClick(n.name)}
              >
                <span style={styles.orderNowEmoji}>{n.emoji}</span>
                <span style={{ ...styles.orderNowName, color: n.color }}>
                  {n.label}
                </span>
                <span style={{ ...styles.orderNowArrow, color: n.color }}>→</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA BUTTONS */}
        <div style={styles.heroBtns}>
          <button style={styles.primaryBtn} onClick={() => setPage("shop")}>
            🛒 Buy Data Now
          </button>
          <button style={styles.ghostBtn} onClick={() => setPage("eta-track")}>
            📦 Track Order
          </button>
          <button style={styles.greenBtn} onClick={() => setSupportOpen(true)}>
            💬 Support
          </button>
        </div>

        {/* STATS ROW */}
        <div style={styles.statsRow}>
          {[
            { icon: "⚡", val: "Instant - 2hr", label: "Delivery Time" },
            { icon: "📶", val: "3 Networks", label: "Supported" },
            { icon: "🔁", val: "24/7", label: "Automation" },
            { icon: "🛡️", val: "100%", label: "Secure" },
          ].map((s, i) => (
            <div key={i} style={styles.statCard}>
              <div style={styles.statIcon}>{s.icon}</div>
              <div style={styles.statVal}>{s.val}</div>
              <div style={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== FEATURES ===================== */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTag}>Why EVOS?</span>
          <h2 style={styles.sectionTitle}>Everything you need, nothing you don't</h2>
        </div>

        <div style={styles.featureGrid}>
          {features.map((f, i) => (
            <div key={i} style={{
              ...styles.featureCard,
              background: f.bg,
              border: `1px solid ${f.border}`,
            }}>
              <div style={{ ...styles.featureIcon, background: f.color + "22", color: f.color }}>
                {f.icon}
              </div>
              <h3 style={{ ...styles.featureTitle, color: f.color }}>{f.title}</h3>
              <p style={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== HOW IT WORKS ===================== */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTag}>Simple</span>
          <h2 style={styles.sectionTitle}>Buy data in 3 easy steps</h2>
        </div>

        <div style={styles.stepsRow}>
          {[
            { step: "1", icon: "📱", title: "Pick a Bundle", desc: "Choose your network and data bundle size." },
            { step: "2", icon: "💳", title: "Pay Securely", desc: "Complete checkout via Paystack in seconds." },
            { step: "3", icon: "🚀", title: "Data Delivered", desc: "Bundle arrives on your phone automatically." },
          ].map((s, i) => (
            <div key={i} style={styles.stepCard}>
              <div style={styles.stepNum}>{s.step}</div>
              <div style={styles.stepIcon}>{s.icon}</div>
              <h3 style={styles.stepTitle}>{s.title}</h3>
              <p style={styles.stepDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== POLICY ===================== */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTag}>Policy</span>
          <h2 style={styles.sectionTitle}>Purchase Policy</h2>
        </div>

        <div style={styles.policyCard}>
          {rules.map((rule, i) => (
            <div key={i} style={styles.policyRow}>
              <span style={styles.policyDot}>•</span>
              <p style={styles.policyText}>{rule}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== AGENT ===================== */}
      <section style={styles.section}>
        <div style={styles.agentBanner}>
          <div style={styles.agentLeft}>
            <span style={styles.agentTag}>🤝 Become an Agent</span>
            <h2 style={styles.agentTitle}>Run your own data store & earn on every sale</h2>
            <p style={styles.agentDesc}>
              Set your own markup, get a personal store link, and earn profit automatically
              on every order your customers place. You need 3 - 5 successful orders to qualify.
            </p>
            <div style={styles.agentPoints}>
              {[
                "📦 Complete 3-5 successful orders daily to qualify",
                "⏳ Limited agent slots available — don't miss out",
                "💰 Set your own markup and earn automatically",
                "📩 Contact us via WhatsApp to get onboarded",
              ].map((p, i) => (
                <div key={i} style={styles.agentPoint}>
                  <span>{p}</span>
                </div>
              ))}
            </div>
            <div style={styles.agentBtns}>
              <button
                style={styles.agentWaBtn}
                onClick={() => window.open("https://wa.me/233208718943?text=Hi, I'd like to become an EVOS Data Service agent", "_blank")}
              >
                💬 WhatsApp Us
              </button>
              <button style={styles.agentShopBtn} onClick={() => setPage("shop")}>
                Start Buying →
              </button>
            </div>
          </div>

          <div style={styles.agentRight}>
            <div style={styles.agentEarnCard}>
              <p style={styles.agentEarnLabel}>Agents Earn</p>
              <p style={styles.agentEarnVal}>GH₵ 0.50 - 5.00</p>
              <p style={styles.agentEarnSub}>per bundle sold</p>
              <div style={styles.agentEarnDivider} />
              <p style={styles.agentEarnLabel}>Withdrawal</p>
              <p style={{ ...styles.agentEarnVal, fontSize: 20 }}>Instant via MoMo</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section style={styles.ctaSection}>
        <h2 style={styles.ctaTitle}>Ready to get started?</h2>
        <p style={styles.ctaDesc}>No stress. No delays. Just fast data delivery across Ghana.</p>
        <button style={styles.ctaBigBtn} onClick={() => setPage("shop")}>
          🛒 Buy Data Now
        </button>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer style={styles.footer}>
        <div style={styles.footerGrid}>
          <div>
            <h3 style={styles.footerBrand}>EVOS HUB</h3>
            <p style={styles.footerMuted}>Secure automated telecom services for Ghana.</p>
          </div>
          <div>
            <h3 style={styles.footerHead}>Other Products</h3>
            <p style={styles.footerLink} onClick={() => window.open("https://evosgpt.xyz", "_blank")}>EVOS GPT</p>
            <p style={styles.footerLink} onClick={() => window.open("https://evoshub.xyz", "_blank")}>EVOS BUSINESS HUB (PARENT)</p>
          </div>
          <div>
            <h3 style={styles.footerHead}>Legal</h3>
            <p style={styles.footerLink} onClick={() => setAboutOpen(true)}>About Us</p>
            <p style={styles.footerLink} onClick={() => setPrivacyOpen(true)}>Privacy Policy</p>
          </div>
          <div>
            <h3 style={styles.footerHead}>Support</h3>
            <p style={styles.footerMuted}>WhatsApp: 0208718943</p>
            <p style={styles.footerMuted}>support@evosdata.xyz</p>
          </div>
        </div>
        <div style={styles.footerCopy}>
          © 2026 EVOS Data Services
          <p>A Product of Evos Business Hub. Powered by Evoxera Technology</p>
        </div>
      </footer>

      {/* ===================== FLOATING SUPPORT ===================== */}
      <div style={styles.floatWrap}>
        {chatOpen && (
          <div style={styles.chatPopup}>
            <div style={styles.chatHeader}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#e5e7eb" }}>💬 EVOS Support</span>
              <button style={styles.chatClose} onClick={() => setChatOpen(false)}>✕</button>
            </div>
            <p style={styles.chatMsg}>Hi! How can we help you today? Choose an option below 👇</p>
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

      {/* ===================== MODALS ===================== */}
      {supportOpen && (
        <>
          <div style={styles.overlay} onClick={() => setSupportOpen(false)} />
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>Support Center</h2>
            {[
              { label: "💬 WhatsApp Support", url: "https://wa.me/233208718943" },
              { label: "👥 Community", url: "https://whatsapp.com/channel/0029VaTrnsZEgGfFXkIcjt1M" },
              { label: "📧 Email Support", mailto: "support@evosdata.xyz" },
            ].map((item, i) => (
              <div key={i} style={styles.helpCard}
                onClick={() => item.mailto
                  ? (window.location.href = `mailto:${item.mailto}`)
                  : window.open(item.url, "_blank")
                }>
                {item.label}
              </div>
            ))}
            <button style={styles.closeBtn} onClick={() => setSupportOpen(false)}>Close</button>
          </div>
        </>
      )}

      {aboutOpen && (
        <>
          <div style={styles.overlay} onClick={() => setAboutOpen(false)} />
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>About EVOSDATA</h2>
            <p style={styles.modalText}>EVOSDATA is a secure digital platform for automated mobile data purchases in Ghana.</p>
            <p style={styles.modalText}>Powered by EVOS Business HUB infrastructure.</p>
            <button style={styles.closeBtn} onClick={() => setAboutOpen(false)}>Close</button>
          </div>
        </>
      )}

      {privacyOpen && (
        <>
          <div style={styles.overlay} onClick={() => setPrivacyOpen(false)} />
          <div style={styles.modal}>
            <h2 style={styles.modalTitle}>Privacy Policy</h2>
            <p style={styles.modalText}>We only collect necessary data for order processing and support.</p>
            <p style={styles.modalText}>All payments are securely handled via Paystack.</p>
            <p style={styles.modalText}>We do not sell or share user data.</p>
            <button style={styles.closeBtn} onClick={() => setPrivacyOpen(false)}>Close</button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container: { fontFamily: "ui-sans-serif, system-ui, Arial", color: "#e5e7eb" },

  // HERO
  hero: {
    textAlign: "center",
    padding: "60px 20px 50px",
    borderRadius: 28,
    marginBottom: 40,
    background: "linear-gradient(160deg, rgba(56,189,248,0.12) 0%, rgba(167,139,250,0.08) 50%, rgba(34,197,94,0.08) 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    position: "relative",
    overflow: "hidden",
  },
  badge: {
    display: "inline-block",
    padding: "6px 16px",
    borderRadius: 50,
    background: "rgba(56,189,248,0.15)",
    border: "1px solid rgba(56,189,248,0.3)",
    color: "#38bdf8",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 20,
  },
  title: {
    fontSize: "clamp(30px, 5vw, 52px)",
    fontWeight: 900,
    lineHeight: 1.15,
    marginBottom: 16,
    color: "#f1f5f9",
  },
  highlight: {
    background: "linear-gradient(135deg, #38bdf8, #a78bfa, #22c55e)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subtitle: {
    fontSize: 16,
    color: "#94a3b8",
    maxWidth: 520,
    margin: "0 auto 28px",
    lineHeight: 1.65,
  },

  // PLACE ORDER NOW — network cards
  orderNowBox: {
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 20,
    padding: "18px 16px 20px",
    marginBottom: 28,
    maxWidth: 500,
    marginLeft: "auto",
    marginRight: "auto",
  },
  orderNowLabel: {
    fontSize: 13,
    fontWeight: 800,
    color: "#94a3b8",
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: "0.6px",
  },
  orderNowGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
  },
  orderNowCard: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "16px 10px",
    borderRadius: 16,
    cursor: "pointer",
    transition: "transform 0.15s, box-shadow 0.15s",
  },
  orderNowEmoji: {
    fontSize: 30,
    lineHeight: 1,
  },
  orderNowName: {
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: "0.3px",
  },
  orderNowArrow: {
    fontSize: 13,
    fontWeight: 900,
    opacity: 0.8,
  },

  heroBtns: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 36,
  },
  primaryBtn: {
    padding: "13px 22px",
    borderRadius: 14,
    border: "none",
    background: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
    color: "#000",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(56,189,248,0.35)",
  },
  ghostBtn: {
    padding: "13px 22px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)",
    color: "#e5e7eb",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
  },
  greenBtn: {
    padding: "13px 22px",
    borderRadius: 14,
    border: "none",
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(34,197,94,0.3)",
  },
  statsRow: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  statCard: {
    padding: "14px 20px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    textAlign: "center",
    minWidth: 110,
  },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statVal: { fontWeight: 800, fontSize: 15, color: "#f1f5f9" },
  statLabel: { fontSize: 12, color: "#64748b", marginTop: 2 },

  // SECTIONS
  section: { padding: "10px 0 44px" },
  sectionHeader: { textAlign: "center", marginBottom: 28 },
  sectionTag: {
    display: "inline-block",
    padding: "4px 14px",
    borderRadius: 50,
    background: "rgba(167,139,250,0.15)",
    border: "1px solid rgba(167,139,250,0.3)",
    color: "#a78bfa",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: "clamp(20px, 3vw, 28px)",
    fontWeight: 900,
    color: "#f1f5f9",
    margin: 0,
  },

  // FEATURES
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
  },
  featureCard: {
    padding: "22px 18px",
    borderRadius: 20,
    transition: "transform 0.2s",
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    marginBottom: 14,
  },
  featureTitle: { fontSize: 15, fontWeight: 800, marginBottom: 6 },
  featureDesc: { fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: 0 },

  // STEPS
  stepsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  stepCard: {
    padding: "24px 18px",
    borderRadius: 20,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    textAlign: "center",
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #38bdf8, #a78bfa)",
    color: "#000",
    fontWeight: 900,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 12px",
  },
  stepIcon: { fontSize: 28, marginBottom: 10 },
  stepTitle: { fontWeight: 800, fontSize: 15, marginBottom: 6, color: "#f1f5f9" },
  stepDesc: { fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: 0 },

  // POLICY
  policyCard: {
    background: "rgba(245,158,11,0.06)",
    border: "1px solid rgba(245,158,11,0.2)",
    borderRadius: 18,
    padding: "20px 22px",
  },
  policyRow: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 12,
  },
  policyDot: { color: "#f59e0b", fontWeight: 900, flexShrink: 0, marginTop: 1 },
  policyText: { fontSize: 14, color: "#cbd5e1", lineHeight: 1.65, margin: 0 },

  // AGENT BANNER
  agentBanner: {
    display: "flex",
    gap: 24,
    flexWrap: "wrap",
    background: "linear-gradient(135deg, rgba(56,189,248,0.08), rgba(167,139,250,0.06))",
    border: "1px solid rgba(56,189,248,0.2)",
    borderRadius: 24,
    padding: "30px 26px",
  },
  agentLeft: { flex: "1 1 300px" },
  agentTag: {
    display: "inline-block",
    padding: "5px 14px",
    borderRadius: 50,
    background: "rgba(34,197,94,0.15)",
    border: "1px solid rgba(34,197,94,0.3)",
    color: "#22c55e",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 12,
  },
  agentTitle: { fontSize: 22, fontWeight: 900, color: "#f1f5f9", marginBottom: 10 },
  agentDesc: { fontSize: 14, color: "#94a3b8", lineHeight: 1.65, marginBottom: 18 },
  agentPoints: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 },
  agentPoint: {
    fontSize: 14,
    color: "#cbd5e1",
    lineHeight: 1.6,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  agentBtns: { display: "flex", gap: 10, flexWrap: "wrap" },
  agentWaBtn: {
    padding: "12px 18px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #25D366, #128C7E)",
    color: "white",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  },
  agentShopBtn: {
    padding: "12px 18px",
    borderRadius: 12,
    border: "1px solid rgba(56,189,248,0.4)",
    background: "transparent",
    color: "#38bdf8",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
  },
  agentRight: { flex: "0 1 200px", display: "flex", alignItems: "center" },
  agentEarnCard: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 18,
    padding: "20px",
    textAlign: "center",
    width: "100%",
  },
  agentEarnLabel: { fontSize: 12, color: "#64748b", marginBottom: 4 },
  agentEarnVal: { fontSize: 26, fontWeight: 900, color: "#38bdf8", marginBottom: 2 },
  agentEarnSub: { fontSize: 12, color: "#94a3b8", marginBottom: 16 },
  agentEarnDivider: { height: 1, background: "rgba(255,255,255,0.07)", marginBottom: 14 },

  // CTA
  ctaSection: {
    textAlign: "center",
    padding: "60px 20px",
    borderRadius: 28,
    background: "linear-gradient(135deg, rgba(56,189,248,0.12), rgba(167,139,250,0.1), rgba(34,197,94,0.08))",
    border: "1px solid rgba(255,255,255,0.07)",
    marginBottom: 40,
  },
  ctaTitle: { fontSize: 30, fontWeight: 900, color: "#f1f5f9", marginBottom: 10 },
  ctaDesc: { fontSize: 15, color: "#94a3b8", marginBottom: 24 },
  ctaBigBtn: {
    padding: "15px 32px",
    borderRadius: 16,
    border: "none",
    background: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
    color: "#000",
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
    boxShadow: "0 6px 24px rgba(56,189,248,0.4)",
  },

  // FOOTER
  footer: {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    paddingTop: 36,
    paddingBottom: 20,
  },
  footerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 24,
    marginBottom: 24,
  },
  footerBrand: { fontSize: 18, fontWeight: 900, color: "#38bdf8", marginBottom: 8 },
  footerHead: { fontSize: 13, fontWeight: 800, color: "#e5e7eb", marginBottom: 10 },
  footerLink: { fontSize: 13, color: "#38bdf8", cursor: "pointer", marginBottom: 6 },
  footerMuted: { fontSize: 13, color: "#64748b", marginBottom: 6 },
  footerCopy: {
    textAlign: "center",
    fontSize: 12,
    color: "#475569",
    paddingTop: 16,
    borderTop: "1px solid rgba(255,255,255,0.04)",
  },

  // FLOATING SUPPORT
  floatWrap: {
    position: "fixed",
    bottom: 24,
    right: 20,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 10,
  },
  chatPopup: {
    background: "#0f172a",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 18,
    padding: 18,
    width: 270,
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  },
  chatHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  chatClose: {
    background: "none",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 14,
  },
  chatMsg: { fontSize: 13, color: "#94a3b8", lineHeight: 1.55, margin: "0 0 12px" },
  chatOptions: { display: "flex", flexDirection: "column", gap: 8 },
  chatOption: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
  },
  floatBtn: {
    width: 54,
    height: 54,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #25D366, #128C7E)",
    border: "none",
    color: "white",
    fontSize: 22,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(37,211,102,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  // MODALS
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 1000,
  },
  modal: {
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "92%",
    maxWidth: 420,
    background: "#0f172a",
    padding: 24,
    borderRadius: 22,
    zIndex: 1200,
    border: "1px solid rgba(255,255,255,0.08)",
  },
  modalTitle: { fontSize: 20, fontWeight: 900, color: "#f1f5f9", marginBottom: 16 },
  modalText: { fontSize: 14, color: "#94a3b8", lineHeight: 1.65, marginBottom: 10 },
  helpCard: {
    padding: 14,
    borderRadius: 14,
    marginTop: 10,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    cursor: "pointer",
    fontSize: 14,
    color: "#e5e7eb",
    fontWeight: 700,
  },
  closeBtn: {
    width: "100%",
    marginTop: 16,
    padding: 13,
    border: "none",
    borderRadius: 14,
    fontWeight: 900,
    cursor: "pointer",
    background: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
    color: "#000",
    fontSize: 14,
  },
};
