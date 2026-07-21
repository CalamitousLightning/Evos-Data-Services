import { useEffect, useMemo, useState } from "react";

// =========================================================================
// DESIGN TOKENS — now a palette map instead of a single fixed theme.
// A deliberate break from the app's default dark-navy/sky-blue look, scoped
// to this landing page. Each palette keeps the same network accent colors
// (gold = MTN, red = Telecel, green = AirtelTigo) so the cards stay
// recognizable, but changes the overall mood (background/surface/text).
// The chosen palette is picked at runtime in the Home component below and
// persisted to localStorage under "evosTheme".
// =========================================================================
const FONTS = {
  display: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
  body: "'Inter', ui-sans-serif, system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
};

const THEMES = {
  forest: {
    name: "Forest",
    swatch: "#17A76A",
    bg: "#0A100D", surface: "#121C16", surfaceAlt: "#0E1712",
    line: "rgba(255,201,51,0.16)", lineSoft: "rgba(244,242,232,0.09)", overlay: "244,242,232",
    gold: "#FFC933", red: "#E8495A", green: "#17A76A",
    text: "#F4F2E8", muted: "#9BAA9F", faint: "#5D6B61",
    ...FONTS,
  },
  ocean: {
    name: "Ocean",
    swatch: "#38BDF8",
    bg: "#070C14", surface: "#101B2C", surfaceAlt: "#0B1622",
    line: "rgba(56,189,248,0.18)", lineSoft: "rgba(234,242,250,0.09)", overlay: "234,242,250",
    gold: "#FFC933", red: "#E8495A", green: "#38BDF8",
    text: "#EAF2FA", muted: "#8DA3B8", faint: "#4C5F72",
    ...FONTS,
  },
  sunset: {
    name: "Sunset",
    swatch: "#F97350",
    bg: "#150A0A", surface: "#231212", surfaceAlt: "#1A0E0E",
    line: "rgba(249,115,80,0.18)", lineSoft: "rgba(247,236,236,0.09)", overlay: "247,236,236",
    gold: "#FFC933", red: "#F97350", green: "#2FBF8F",
    text: "#F7ECEC", muted: "#B49A97", faint: "#6B5450",
    ...FONTS,
  },
  grape: {
    name: "Grape",
    swatch: "#A78BFA",
    bg: "#0E0B16", surface: "#191325", surfaceAlt: "#130F1D",
    line: "rgba(167,139,250,0.2)", lineSoft: "rgba(240,237,250,0.09)", overlay: "240,237,250",
    gold: "#FFC933", red: "#E8495A", green: "#34D399",
    text: "#F0EDFA", muted: "#A79DBE", faint: "#5F5674",
    ...FONTS,
  },
  slate: {
    name: "Slate",
    swatch: "#94A3B8",
    bg: "#0D0F12", surface: "#171B21", surfaceAlt: "#12151A",
    line: "rgba(148,163,184,0.18)", lineSoft: "rgba(241,243,245,0.09)", overlay: "241,243,245",
    gold: "#FFC933", red: "#E8495A", green: "#17A76A",
    text: "#F1F3F5", muted: "#9AA3AC", faint: "#565C64",
    ...FONTS,
  },
};

const THEME_LIST = Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name, swatch: t.swatch }));

const GHANA_REGIONS = [
  "Greater Accra", "Ashanti", "Western", "Central", "Eastern", "Volta",
  "Northern", "Upper East", "Upper West", "Bono", "Bono East", "Ahafo",
  "Western North", "Oti", "North East", "Savannah",
];

// Signature device: signal bars. This is a data-delivery platform, so
// "strength" is a real, legible metric here — used as step markers below
// instead of generic 01/02/03 numbering, and as a coverage indicator in
// the region ticker.
function SignalBars({ level = 4, size = 18, color = "#FFC933", dim = "rgba(244,242,232,0.14)" }) {
  const heights = [0.32, 0.55, 0.78, 1];
  return (
    <div style={{ display: "inline-flex", alignItems: "flex-end", gap: Math.max(2, size * 0.13), height: size, flexShrink: 0 }}>
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: Math.max(2, size * 0.19),
            height: size * h,
            borderRadius: 2,
            background: i < level ? color : dim,
          }}
        />
      ))}
    </div>
  );
}

export default function Home({ setPage, theme }) {
  const [supportOpen, setSupportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [promoVisible, setPromoVisible] = useState(false);
  const [activePromo, setActivePromo] = useState(null);
  const [imgErrors, setImgErrors] = useState({});

  // ===== Site theme (color scheme) picker =====
  // Defaults to "forest" (the original look), remembers the visitor's
  // choice across visits via localStorage.
  const [themeKey, setThemeKey] = useState(() => {
    try {
      const saved = localStorage.getItem("evosSiteTheme");
      return saved && THEMES[saved] ? saved : "forest";
    } catch {
      return "forest";
    }
  });
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const T = THEMES[themeKey] || THEMES.forest;
  const styles = useMemo(() => buildStyles(T), [themeKey]);

  useEffect(() => {
    try { localStorage.setItem("evosSiteTheme", themeKey); } catch { /* ignore */ }
  }, [themeKey]);

  // Two cross-promo notifications from the Evoxera Technology family.
  // Only one is shown per session — picked at random — so the popup
  // never feels repetitive across visits.
  const promos = {
    evosgpt: {
      key: "evosgpt",
      badge: "🚀 From Evoxera Technology",
      accent: T.gold,
      title: <>Meet <span style={{ color: T.gold }}>EVOSGPT</span> — Your AI Assistant</>,
      body: "Need help with CVs, business plans, school work, coding, or ideas? EVOSGPT is part of the EVOS Business HUB family — and your EvosData account already unlocks it.",
      ctaText: "Try EVOSGPT Free →",
      ctaHref: "https://evosgpt.xyz",
      footer: <>EvosData · EVOSGPT · EVOS Business HUB — all under{" "}<span style={{ color: T.gold }}>Evoxera Technology</span></>,
    },
    evoshub: {
      key: "evoshub",
      badge: "🌐 From Evoxera Technology",
      accent: T.green,
      title: <>Need a website? <span style={{ color: T.green }}>EVOS Business HUB</span> builds it</>,
      body: "EVOS Business HUB is the main platform behind EvosData — request a professional website for your business, brand, or side hustle, built and hosted for you.",
      ctaText: "Get your website →",
      ctaHref: "https://evoshub.xyz",
      footer: <>EvosData · EVOSGPT · EVOS Business HUB — all under{" "}<span style={{ color: T.green }}>Evoxera Technology</span></>,
    },
  };

  // Show one promo notification after 2s, only once per session
  useEffect(() => {
    const dismissed = sessionStorage.getItem("evosPromoDismissed");
    if (dismissed) return;
    const choice = Math.random() < 0.5 ? "evosgpt" : "evoshub";
    setActivePromo(promos[choice]);
    const timer = setTimeout(() => setPromoVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const dismissPromo = () => {
    setPromoVisible(false);
    sessionStorage.setItem("evosPromoDismissed", "1");
  };

  const features = [
    { icon: "⚡", title: "Instant delivery", desc: "Bundles land the moment payment clears — nobody has to press a button.", color: T.gold },
    { icon: "🔒", title: "Secure checkout", desc: "Every payment runs through Paystack's encrypted checkout.", color: T.green },
    { icon: "📶", title: "3 networks, 1 store", desc: "MTN, Telecel and AirtelTigo bundles, side by side.", color: T.red },
    { icon: "📍", title: "Live order tracking", desc: "Follow any order from paid to delivered with your reference.", color: T.gold },
  ];

  const rules = [
    "Please confirm phone number before payment.",
    "No refund for successful delivery to wrong numbers entered by customer.",
    "Refunds apply only to failed or undelivered orders after review.",
    "During network congestion, some orders may delay.",
    "If order is not delivered within 30 minutes contact support.",
  ];

  // ===== Network cards: image with emoji fallback =====
  // Drop image files into public/images/ as mtn.png, telecel.png, airteltigo.png
  // (update the extension below if you use .jpg / .jpeg instead).
  // If an image is missing or fails to load, the emoji design is used automatically.
  const quickNetworks = [
    { name: "MTN", label: "MTN", emoji: "🟡", image: "/images/mtn.png", color: T.gold, outOfStock: false },
    { name: "TELECEL", label: "Telecel", emoji: "🔴", image: "/images/telecel.png", color: T.red, outOfStock: false },
    { name: "AIRTELTIGO", label: "AirtelTigo", emoji: "🔵", image: "/images/airteltigo.png", color: T.green, outOfStock: false },
  ];

  const steps = [
    { level: 2, icon: "📱", title: "Pick a bundle", desc: "Choose your network and data size." },
    { level: 3, icon: "💳", title: "Pay securely", desc: "Checkout with Paystack in seconds." },
    { level: 4, icon: "🚀", title: "Full bars", desc: "Bundle lands on your phone automatically." },
  ];

  const handleNetworkClick = (network) => {
    if (network.outOfStock) return;
    localStorage.setItem("selectedNetwork", network.name);
    setPage("shop");
  };

  const handleImgError = (name) => {
    setImgErrors((prev) => ({ ...prev, [name]: true }));
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes evosMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes evosRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes evosPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .evos-rise { animation: evosRise 0.6s ease both; }
        .evos-rise-1 { animation-delay: 0.02s; }
        .evos-rise-2 { animation-delay: 0.12s; }
        .evos-rise-3 { animation-delay: 0.22s; }
        .evos-rise-4 { animation-delay: 0.32s; }
        .evos-marquee-track { animation: evosMarquee 26s linear infinite; }
        .evos-live-dot { animation: evosPulse 1.8s ease-in-out infinite; }
        .evos-net-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .evos-net-card:hover { transform: translateY(-3px); }
        .evos-feature-card, .evos-step-card { transition: transform 0.18s ease, border-color 0.18s ease; }
        .evos-feature-card:hover, .evos-step-card:hover { transform: translateY(-4px); }
        .evos-focusable:focus-visible { outline: 2px solid ${T.gold}; outline-offset: 3px; border-radius: 8px; }
        @media (prefers-reduced-motion: reduce) {
          .evos-rise, .evos-marquee-track, .evos-live-dot { animation: none !important; }
        }
      `}</style>

      {/* ===================== CROSS-PROMO NOTIFICATION ===================== */}
      {activePromo && (
        <div style={{
          ...styles.promoNotif,
          borderColor: activePromo.accent + "4d",
          opacity: promoVisible ? 1 : 0,
          transform: promoVisible ? "translateY(0)" : "translateY(20px)",
          pointerEvents: promoVisible ? "auto" : "none",
        }}>
          <div style={styles.promoNotifHeader}>
            <div style={{ ...styles.promoNotifBadge, color: activePromo.accent, background: activePromo.accent + "22", border: `1px solid ${activePromo.accent}59` }}>
              {activePromo.badge}
            </div>
            <button style={styles.promoNotifClose} onClick={dismissPromo}>✕</button>
          </div>

          <p style={styles.promoNotifTitle}>{activePromo.title}</p>
          <p style={styles.promoNotifBody}>{activePromo.body}</p>

          <div style={styles.promoNotifBtns}>
            <a
              href={activePromo.ctaHref}
              target="_blank"
              rel="noreferrer"
              style={{ ...styles.promoNotifCta, background: activePromo.accent, boxShadow: `0 3px 12px ${activePromo.accent}59` }}
            >
              {activePromo.ctaText}
            </a>
            <button style={styles.promoNotifSkip} onClick={dismissPromo}>
              Maybe later
            </button>
          </div>

          <p style={styles.promoNotifFooter}>{activePromo.footer}</p>
        </div>
      )}

      {/* ===================== HERO ===================== */}
      <section style={styles.hero}>
        <div style={styles.heroTexture} aria-hidden="true" />

        <div className="evos-rise evos-rise-1" style={styles.badge}>
          <span className="evos-live-dot" style={styles.badgeDot} />
          Live · delivering to all 16 regions
        </div>

        <h1 className="evos-rise evos-rise-2" style={styles.title}>
          Full bars,
          <br />
          <span style={styles.highlight}>in seconds.</span>
        </h1>

        <p className="evos-rise evos-rise-3" style={styles.subtitle}>
          Buy MTN, Telecel and AirtelTigo data bundles online — paid and delivered
          before your screen even locks.
        </p>

        {/* ===== PLACE ORDER NOW — NETWORK CARDS ===== */}
        <div className="evos-rise evos-rise-4" style={styles.orderNowBox}>
          <div style={styles.orderNowLabelRow}>
            <p style={styles.orderNowLabel}>Order now</p>
            <SignalBars level={4} size={13} color={T.gold} />
          </div>
          <div style={styles.orderNowGrid}>
            {quickNetworks.map((n) => (
              <div
                key={n.name}
                className="evos-net-card evos-focusable"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleNetworkClick(n); }}
                style={{
                  ...styles.orderNowCard,
                  ...(n.outOfStock
                    ? styles.orderNowCardDisabled
                    : {
                        background: n.color + "14",
                        border: `1.5px solid ${n.color}4d`,
                        boxShadow: `0 4px 20px ${n.color}22`,
                      }),
                }}
                onClick={() => handleNetworkClick(n)}
              >
                {n.outOfStock && <span style={styles.outOfStockBadge}>Out of Stock</span>}

                {n.image && !imgErrors[n.name] ? (
                  <img
                    src={n.image}
                    alt={n.label}
                    style={{ ...styles.orderNowImg, opacity: n.outOfStock ? 0.35 : 1 }}
                    onError={() => handleImgError(n.name)}
                  />
                ) : (
                  <span style={{ ...styles.orderNowEmoji, opacity: n.outOfStock ? 0.35 : 1 }}>
                    {n.emoji}
                  </span>
                )}

                <span style={{ ...styles.orderNowName, color: n.outOfStock ? T.faint : n.color }}>
                  {n.label}
                </span>
                {n.outOfStock ? (
                  <span style={styles.outOfStockText}>Unavailable</span>
                ) : (
                  <span style={{ ...styles.orderNowArrow, color: n.color }}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA BUTTONS */}
        <div style={styles.heroBtns}>
          <button className="evos-focusable" style={styles.primaryBtn} onClick={() => setPage("shop")}>
            Buy data now
          </button>
          <button className="evos-focusable" style={styles.ghostBtn} onClick={() => setPage("eta-track")}>
            Track order
          </button>
          <button className="evos-focusable" style={styles.greenBtn} onClick={() => setSupportOpen(true)}>
            Support
          </button>
        </div>

        {/* COVERAGE TICKER — signature element, encodes a real claim (nationwide
            delivery) rather than decorating the hero with something generic. */}
        <div style={styles.tickerWrap} aria-hidden="true">
          <div style={styles.tickerFadeL} />
          <div style={styles.tickerFadeR} />
          <div className="evos-marquee-track" style={styles.tickerTrack}>
            {[...GHANA_REGIONS, ...GHANA_REGIONS].map((r, i) => (
              <span key={i} style={styles.tickerItem}>
                <SignalBars level={4} size={11} color={T.gold} />
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* STATS ROW */}
        <div style={styles.statsRow}>
          {[
            { val: "< 2 min", label: "Typical delivery" },
            { val: "3", label: "Networks live" },
            { val: "24/7", label: "Automated" },
          ].map((s, i) => (
            <div key={i} style={styles.statCard}>
              <div style={styles.statVal}>{s.val}</div>
              <div style={styles.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== FEATURES ===================== */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTag}>Why EVOS</span>
          <h2 style={styles.sectionTitle}>Nothing between you and your bundle</h2>
        </div>

        <div style={styles.featureGrid}>
          {features.map((f, i) => (
            <div
              key={i}
              className="evos-feature-card"
              style={{ ...styles.featureCard, background: f.color + "0d", border: `1px solid ${f.color}33` }}
            >
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
          <h2 style={styles.sectionTitle}>From zero bars to delivered</h2>
        </div>

        <div style={styles.stepsRow}>
          {steps.map((s, i) => (
            <div key={i} className="evos-step-card" style={styles.stepCard}>
              <div style={styles.stepBars}><SignalBars level={s.level} size={24} color={T.gold} /></div>
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
          Buy data now
        </button>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer style={styles.footer}>
        <div style={styles.footerGrid}>
          <div>
            <h3 style={styles.footerBrand}>EVOS HUB</h3>
            <p style={styles.footerMuted}>Secure automated telecom services for Ghana.</p>
            <p style={{ ...styles.footerMuted, marginTop: 6, fontSize: 11 }}>
              A product of EVOS Business HUB · Powered by Evoxera Technology
            </p>
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

      {/* ===================== THEME SWITCHER ===================== */}
      <div style={styles.themeFloatWrap}>
        {themePanelOpen && (
          <div style={styles.themePanel}>
            <div style={styles.themePanelHeader}>
              <span style={styles.themePanelTitle}>🎨 Site color</span>
              <button style={styles.themePanelClose} onClick={() => setThemePanelOpen(false)}>✕</button>
            </div>
            <div style={styles.themeGrid}>
              {THEME_LIST.map((opt) => (
                <button
                  key={opt.key}
                  style={styles.themeOption(opt.key === themeKey)}
                  onClick={() => setThemeKey(opt.key)}
                >
                  <span style={{ ...styles.themeSwatch, background: opt.swatch }} />
                  {opt.name}
                  {opt.key === themeKey && <span style={styles.themeCheck}>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          style={styles.themeFloatBtn}
          onClick={() => setThemePanelOpen(!themePanelOpen)}
          aria-label="Change site color"
        >
          {themePanelOpen ? "✕" : "🎨"}
        </button>
      </div>

      {/* ===================== FLOATING SUPPORT ===================== */}
      <div style={styles.floatWrap}>
        {chatOpen && (
          <div style={styles.chatPopup}>
            <div style={styles.chatHeader}>
              <span style={{ fontWeight: 800, fontSize: 14, color: T.text }}>💬 EVOS Support</span>
              <button style={styles.chatClose} onClick={() => setChatOpen(false)}>✕</button>
            </div>
            <p style={styles.chatMsg}>Hi! How can we help you today? Choose an option below 👇</p>
            <div style={styles.chatOptions}>
              <button style={styles.chatOption} onClick={() => window.open("https://wa.me/233208718943", "_blank")}>
                💬 WhatsApp Chat
              </button>
              <button style={styles.chatOption} onClick={() => window.open("https://chat.whatsapp.com/CYSA7PRIlK0JklgVtQfhnR", "_blank")}>
                👥 Community
              </button>
              <button style={styles.chatOption} onClick={() => window.location.href = "mailto:support@evosdata.xyz"}>
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
              <div
                key={i}
                style={styles.helpCard}
                onClick={() => item.mailto
                  ? (window.location.href = `mailto:${item.mailto}`)
                  : window.open(item.url, "_blank")
                }
              >
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
            <p style={styles.modalText}>Powered by EVOS Business HUB infrastructure and built by Evoxera Technology.</p>
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

function buildStyles(T) {
  return {
  container: { fontFamily: T.body, color: T.text, background: T.bg, borderRadius: 24 },

  // ===================== EVOSGPT PROMO NOTIFICATION =====================
  promoNotif: {
    position: "fixed",
    bottom: 90,
    right: 20,
    zIndex: 9998,
    width: 300,
    background: `linear-gradient(145deg, ${T.surfaceAlt}, #1a1408)`,
    border: `1px solid ${T.gold}4d`,
    borderRadius: 20,
    padding: "18px 16px 14px",
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
    transition: "opacity 0.4s ease, transform 0.4s ease",
    fontFamily: T.body,
  },
  promoNotifHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  promoNotifBadge: {
    fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: T.gold,
    background: T.gold + "22", border: `1px solid ${T.gold}59`, borderRadius: 999, padding: "3px 10px",
  },
  promoNotifClose: { background: "none", border: "none", color: T.faint, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 2 },
  promoNotifTitle: { fontSize: 14, fontWeight: 900, color: T.text, margin: "0 0 7px", lineHeight: 1.4, fontFamily: T.display },
  promoNotifBrand: { color: T.gold },
  promoNotifBody: { fontSize: 12.5, color: T.muted, lineHeight: 1.55, margin: "0 0 14px" },
  promoNotifBtns: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12 },
  promoNotifCta: {
    flex: 1, display: "inline-block", padding: "9px 0", borderRadius: 10,
    background: T.gold, color: "#161005", fontWeight: 900, fontSize: 12, textAlign: "center",
    textDecoration: "none", boxShadow: `0 3px 12px ${T.gold}59`, fontFamily: "inherit",
  },
  promoNotifSkip: { background: "none", border: "none", color: T.faint, fontSize: 12, cursor: "pointer", padding: "9px 4px", fontFamily: "inherit" },
  promoNotifFooter: { fontSize: 10.5, color: T.faint, margin: 0, textAlign: "center", lineHeight: 1.4 },

  // HERO
  hero: {
    textAlign: "center",
    padding: "64px 20px 44px",
    borderRadius: 28,
    marginBottom: 40,
    background: `radial-gradient(120% 100% at 50% 0%, ${T.surface} 0%, ${T.bg} 60%)`,
    border: `1px solid ${T.lineSoft}`,
    position: "relative",
    overflow: "hidden",
  },
  heroTexture: {
    position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none",
    backgroundImage: `radial-gradient(${T.gold}22 1px, transparent 1px)`,
    backgroundSize: "22px 22px",
    maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent)",
  },
  badge: {
    position: "relative",
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "6px 16px 6px 12px", borderRadius: 50,
    background: T.green + "1f", border: `1px solid ${T.green}4d`,
    color: T.green, fontSize: 12.5, fontWeight: 700, marginBottom: 22,
    fontFamily: T.mono, letterSpacing: 0.2,
  },
  badgeDot: { width: 7, height: 7, borderRadius: "50%", background: T.green, display: "inline-block" },
  title: {
    position: "relative",
    fontFamily: T.display,
    fontSize: "clamp(36px, 6.4vw, 62px)",
    fontWeight: 700,
    lineHeight: 1.06,
    letterSpacing: "-0.01em",
    marginBottom: 16,
    color: T.text,
  },
  highlight: { color: T.gold },
  subtitle: {
    position: "relative",
    fontSize: 16.5, color: T.muted, maxWidth: 480,
    margin: "0 auto 30px", lineHeight: 1.65,
  },

  // PLACE ORDER NOW
  orderNowBox: {
    position: "relative",
    background: "rgba(0,0,0,0.28)",
    border: `1px solid ${T.lineSoft}`,
    borderRadius: 20, padding: "16px 16px 20px", marginBottom: 26,
    maxWidth: 500, marginLeft: "auto", marginRight: "auto",
  },
  orderNowLabelRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "0 2px" },
  orderNowLabel: { fontSize: 12.5, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.7px", margin: 0 },
  orderNowGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  orderNowCard: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    padding: "16px 10px", borderRadius: 16, cursor: "pointer", position: "relative", outline: "none",
  },
  orderNowCardDisabled: {
    background: `rgba(${T.overlay},0.03)`, border: `1.5px solid ${T.lineSoft}`,
    boxShadow: "none", cursor: "not-allowed", opacity: 0.6, position: "relative",
  },
  outOfStockBadge: {
    position: "absolute", top: 6, right: 6, background: T.red + "2e", border: `1px solid ${T.red}66`,
    color: T.red, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 50,
    textTransform: "uppercase", letterSpacing: "0.4px",
  },
  outOfStockText: { fontSize: 11, fontWeight: 700, color: T.faint, letterSpacing: "0.3px" },
  orderNowEmoji: { fontSize: 30, lineHeight: 1 },
  orderNowImg: { width: 36, height: 36, objectFit: "contain", borderRadius: 8, marginBottom: 2 },
  orderNowName: { fontSize: 13, fontWeight: 800, letterSpacing: "0.2px", fontFamily: T.display },
  orderNowArrow: { fontSize: 13, fontWeight: 900, opacity: 0.85 },

  heroBtns: { position: "relative", display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 34 },
  primaryBtn: {
    padding: "13px 24px", borderRadius: 14, border: "none",
    background: T.gold, color: "#161005", fontWeight: 800, fontSize: 15,
    cursor: "pointer", boxShadow: `0 6px 22px ${T.gold}4d`, fontFamily: T.display,
  },
  ghostBtn: {
    padding: "13px 22px", borderRadius: 14, border: `1px solid ${T.lineSoft}`,
    background: `rgba(${T.overlay},0.05)`, color: T.text, fontWeight: 700, fontSize: 15,
    cursor: "pointer", fontFamily: T.display,
  },
  greenBtn: {
    padding: "13px 22px", borderRadius: 14, border: "none",
    background: T.green, color: "#04140d", fontWeight: 800, fontSize: 15,
    cursor: "pointer", boxShadow: `0 6px 22px ${T.green}4d`, fontFamily: T.display,
  },

  // COVERAGE TICKER
  tickerWrap: {
    position: "relative", overflow: "hidden", marginBottom: 30,
    maxWidth: 640, marginLeft: "auto", marginRight: "auto",
    borderTop: `1px solid ${T.lineSoft}`, borderBottom: `1px solid ${T.lineSoft}`, padding: "12px 0",
  },
  tickerFadeL: { position: "absolute", left: 0, top: 0, bottom: 0, width: 60, background: `linear-gradient(90deg, ${T.bg}, transparent)`, zIndex: 2 },
  tickerFadeR: { position: "absolute", right: 0, top: 0, bottom: 0, width: 60, background: `linear-gradient(270deg, ${T.bg}, transparent)`, zIndex: 2 },
  tickerTrack: { display: "flex", width: "max-content" },
  tickerItem: {
    display: "inline-flex", alignItems: "center", gap: 8,
    fontSize: 12.5, fontFamily: T.mono, color: T.muted,
    padding: "0 20px", borderRight: `1px solid ${T.lineSoft}`, whiteSpace: "nowrap",
  },

  statsRow: { position: "relative", display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" },
  statCard: {
    padding: "14px 22px", borderRadius: 16, background: `rgba(${T.overlay},0.04)`,
    border: `1px solid ${T.lineSoft}`, textAlign: "center", minWidth: 110,
  },
  statVal: { fontWeight: 700, fontSize: 18, color: T.gold, fontFamily: T.mono },
  statLabel: { fontSize: 12, color: T.muted, marginTop: 3 },

  // SECTIONS
  section: { padding: "10px 0 44px" },
  sectionHeader: { textAlign: "center", marginBottom: 30 },
  sectionTag: {
    display: "inline-block", padding: "4px 14px", borderRadius: 50,
    background: T.gold + "1f", border: `1px solid ${T.gold}4d`, color: T.gold,
    fontSize: 12, fontWeight: 700, marginBottom: 12, fontFamily: T.mono, letterSpacing: 0.3,
  },
  sectionTitle: { fontFamily: T.display, fontSize: "clamp(22px, 3.2vw, 30px)", fontWeight: 700, color: T.text, margin: 0, letterSpacing: "-0.01em" },

  // FEATURES
  featureGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 },
  featureCard: { padding: "22px 18px", borderRadius: 20 },
  featureIcon: { width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, marginBottom: 14 },
  featureTitle: { fontSize: 15.5, fontWeight: 700, marginBottom: 6, fontFamily: T.display },
  featureDesc: { fontSize: 13.5, color: T.muted, lineHeight: 1.6, margin: 0 },

  // STEPS
  stepsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 },
  stepCard: {
    padding: "26px 18px", borderRadius: 20,
    background: `rgba(${T.overlay},0.035)`, border: `1px solid ${T.lineSoft}`, textAlign: "center",
  },
  stepBars: { display: "flex", justifyContent: "center", marginBottom: 14 },
  stepIcon: { fontSize: 26, marginBottom: 10 },
  stepTitle: { fontWeight: 700, fontSize: 15.5, marginBottom: 6, color: T.text, fontFamily: T.display },
  stepDesc: { fontSize: 13, color: T.muted, lineHeight: 1.6, margin: 0 },

  // POLICY
  policyCard: { background: T.gold + "0d", border: `1px solid ${T.gold}33`, borderRadius: 18, padding: "20px 22px" },
  policyRow: { display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 },
  policyDot: { color: T.gold, fontWeight: 900, flexShrink: 0, marginTop: 1 },
  policyText: { fontSize: 14, color: T.text, opacity: 0.85, lineHeight: 1.65, margin: 0 },

  // AGENT BANNER
  agentBanner: {
    display: "flex", gap: 24, flexWrap: "wrap",
    background: `linear-gradient(135deg, ${T.gold}14, ${T.green}0f)`,
    border: `1px solid ${T.lineSoft}`, borderRadius: 24, padding: "30px 26px",
  },
  agentLeft: { flex: "1 1 300px" },
  agentTag: {
    display: "inline-block", padding: "5px 14px", borderRadius: 50,
    background: T.green + "22", border: `1px solid ${T.green}4d`, color: T.green,
    fontSize: 12, fontWeight: 700, marginBottom: 12, fontFamily: T.mono,
  },
  agentTitle: { fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 10, fontFamily: T.display },
  agentDesc: { fontSize: 14, color: T.muted, lineHeight: 1.65, marginBottom: 18 },
  agentPoints: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 },
  agentPoint: {
    fontSize: 14, color: T.text, opacity: 0.9, lineHeight: 1.6, padding: "8px 12px",
    background: `rgba(${T.overlay},0.04)`, borderRadius: 10, border: `1px solid ${T.lineSoft}`,
  },
  agentBtns: { display: "flex", gap: 10, flexWrap: "wrap" },
  agentWaBtn: {
    padding: "12px 18px", borderRadius: 12, border: "none",
    background: "linear-gradient(135deg, #25D366, #128C7E)", color: "white",
    fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: T.display,
  },
  agentShopBtn: {
    padding: "12px 18px", borderRadius: 12, border: `1px solid ${T.gold}66`,
    background: "transparent", color: T.gold, fontWeight: 800, fontSize: 14,
    cursor: "pointer", fontFamily: T.display,
  },
  agentRight: { flex: "0 1 200px", display: "flex", alignItems: "center" },
  agentEarnCard: {
    background: `rgba(${T.overlay},0.05)`, border: `1px solid ${T.lineSoft}`,
    borderRadius: 18, padding: 20, textAlign: "center", width: "100%",
  },
  agentEarnLabel: { fontSize: 12, color: T.muted, marginBottom: 4 },
  agentEarnVal: { fontSize: 24, fontWeight: 700, color: T.gold, marginBottom: 2, fontFamily: T.mono },
  agentEarnSub: { fontSize: 12, color: T.muted, marginBottom: 16 },
  agentEarnDivider: { height: 1, background: T.lineSoft, marginBottom: 14 },

  // CTA
  ctaSection: {
    textAlign: "center", padding: "60px 20px", borderRadius: 28,
    background: `linear-gradient(135deg, ${T.gold}1a, ${T.green}12)`,
    border: `1px solid ${T.lineSoft}`, marginBottom: 40,
  },
  ctaTitle: { fontSize: 30, fontWeight: 700, color: T.text, marginBottom: 10, fontFamily: T.display },
  ctaDesc: { fontSize: 15, color: T.muted, marginBottom: 24 },
  ctaBigBtn: {
    padding: "15px 34px", borderRadius: 16, border: "none",
    background: T.gold, color: "#161005", fontWeight: 800, fontSize: 16,
    cursor: "pointer", boxShadow: `0 8px 28px ${T.gold}59`, fontFamily: T.display,
  },

  // FOOTER
  footer: { borderTop: `1px solid ${T.lineSoft}`, paddingTop: 36, paddingBottom: 20 },
  footerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 24, marginBottom: 24 },
  footerBrand: { fontSize: 18, fontWeight: 700, color: T.gold, marginBottom: 8, fontFamily: T.display },
  footerHead: { fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 10 },
  footerLink: { fontSize: 13, color: T.gold, cursor: "pointer", marginBottom: 6 },
  footerMuted: { fontSize: 13, color: T.muted, marginBottom: 6 },
  footerCopy: { textAlign: "center", fontSize: 12, color: T.faint, paddingTop: 16, borderTop: `1px solid ${T.lineSoft}` },

  // FLOATING SUPPORT
  floatWrap: { position: "fixed", bottom: 24, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 },
  chatPopup: {
    background: T.surfaceAlt, border: `1px solid ${T.lineSoft}`, borderRadius: 18,
    padding: 18, width: 270, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", fontFamily: T.body,
  },
  chatHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  chatClose: { background: "none", border: "none", color: T.faint, cursor: "pointer", fontSize: 14 },
  chatMsg: { fontSize: 13, color: T.muted, lineHeight: 1.55, margin: "0 0 12px" },
  chatOptions: { display: "flex", flexDirection: "column", gap: 8 },
  chatOption: {
    padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.lineSoft}`,
    background: `rgba(${T.overlay},0.04)`, color: T.text, fontSize: 13, fontWeight: 700,
    cursor: "pointer", textAlign: "left",
  },
  floatBtn: {
    width: 54, height: 54, borderRadius: "50%",
    background: "linear-gradient(135deg, #25D366, #128C7E)", border: "none",
    color: "white", fontSize: 22, cursor: "pointer", boxShadow: "0 4px 20px rgba(37,211,102,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },

  // MODALS
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000 },
  modal: {
    position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
    width: "92%", maxWidth: 420, background: T.surfaceAlt, padding: 24, borderRadius: 22,
    zIndex: 1200, border: `1px solid ${T.lineSoft}`, fontFamily: T.body,
  },
  modalTitle: { fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 16, fontFamily: T.display },
  modalText: { fontSize: 14, color: T.muted, lineHeight: 1.65, marginBottom: 10 },
  helpCard: {
    padding: 14, borderRadius: 14, marginTop: 10, background: `rgba(${T.overlay},0.04)`,
    border: `1px solid ${T.lineSoft}`, cursor: "pointer", fontSize: 14, color: T.text, fontWeight: 700,
  },
  closeBtn: {
    width: "100%", marginTop: 16, padding: 13, border: "none", borderRadius: 14,
    fontWeight: 800, cursor: "pointer", background: T.gold, color: "#161005", fontSize: 14, fontFamily: T.display,
  },

  // THEME SWITCHER
  themeFloatWrap: { position: "fixed", bottom: 24, left: 20, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 },
  themeFloatBtn: {
    width: 46, height: 46, borderRadius: "50%", border: `1px solid ${T.lineSoft}`,
    background: T.surfaceAlt, color: T.text, fontSize: 19, cursor: "pointer",
    boxShadow: "0 4px 18px rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
  },
  themePanel: {
    background: T.surfaceAlt, border: `1px solid ${T.lineSoft}`, borderRadius: 18,
    padding: 16, width: 220, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", fontFamily: T.body,
  },
  themePanelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  themePanelTitle: { fontSize: 13, fontWeight: 800, color: T.text, fontFamily: T.display, letterSpacing: 0.2 },
  themePanelClose: { background: "none", border: "none", color: T.faint, cursor: "pointer", fontSize: 14 },
  themeGrid: { display: "flex", flexDirection: "column", gap: 6 },
  themeOption: (active) => ({
    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10,
    border: active ? `1.5px solid ${T.gold}` : `1px solid ${T.lineSoft}`,
    background: active ? T.gold + "14" : `rgba(${T.overlay},0.03)`,
    cursor: "pointer", fontSize: 13, fontWeight: 700, color: T.text, textAlign: "left", width: "100%",
  }),
  themeSwatch: { width: 18, height: 18, borderRadius: "50%", flexShrink: 0, border: "1px solid rgba(0,0,0,0.25)" },
  themeCheck: { marginLeft: "auto", color: T.gold, fontWeight: 900, fontSize: 13 },
  };
}
