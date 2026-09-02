import { useEffect, useMemo, useState } from "react";

const DISMISS_KEY = "budgetkazpei:pwa-install-dismissed-until";
const ONE_DAY = 24 * 60 * 60 * 1000;

function isStandaloneMode() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isSafariBrowser() {
  const ua = window.navigator.userAgent;
  return /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  const ios = useMemo(() => isIosDevice(), []);
  const safari = useMemo(() => isSafariBrowser(), []);

  useEffect(() => {
    if (isStandaloneMode()) {
      setInstalled(true);
      return;
    }

    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const canShow = Date.now() >= dismissedUntil;

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      if (canShow) setVisible(true);
    };

    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      setShowHelp(false);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    let fallbackTimer;
    if (canShow && ios && safari) {
      fallbackTimer = window.setTimeout(() => setVisible(true), 900);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, [ios, safari]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + ONE_DAY));
    setVisible(false);
    setShowHelp(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } finally {
        setDeferredPrompt(null);
      }
      return;
    }

    setShowHelp(true);
  };

  if (installed || !visible) return null;

  return (
    <>
      <section
        role="dialog"
        aria-label="Installer BudgetKazPei"
        style={styles.banner}
      >
        <div style={styles.icon} aria-hidden="true"><img src="/budgetkazpei-pwa-logo.png" alt="" style={styles.logoImage} /></div>

        <div style={styles.content}>
          <div style={styles.title}>Installer BudgetKazPei</div>
          <div style={styles.text}>
            Accédez plus rapidement à votre budget depuis l’écran d’accueil.
          </div>
        </div>

        <div style={styles.actions}>
          <button type="button" onClick={install} style={styles.installButton}>
            Installer
          </button>
          <button type="button" onClick={dismiss} style={styles.laterButton}>
            Plus tard
          </button>
        </div>
      </section>

      {showHelp && (
        <div style={styles.overlay} onClick={() => setShowHelp(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Comment installer BudgetKazPei"
            style={styles.modal}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.modalTitle}>Ajouter BudgetKazPei à votre téléphone</div>

            {ios ? (
              <div style={styles.modalText}>
                Sur iPhone/iPad : ouvrez BudgetKazPei dans <strong>Safari</strong>,
                touchez <strong>Partager</strong>, puis
                <strong> « Sur l’écran d’accueil »</strong>.
              </div>
            ) : (
              <div style={styles.modalText}>
                Ouvrez le menu de votre navigateur puis choisissez
                <strong> « Installer l’application »</strong> ou
                <strong> « Ajouter à l’écran d’accueil »</strong>.
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowHelp(false)}
              style={styles.closeButton}
            >
              J’ai compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  banner: {
    position: "fixed",
    left: "max(12px, env(safe-area-inset-left))",
    right: "max(12px, env(safe-area-inset-right))",
    bottom: "calc(12px + env(safe-area-inset-bottom))",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 12px 12px 14px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.98)",
    color: "#18221c",
    boxShadow: "0 12px 36px rgba(0,0,0,0.18)",
    border: "1px solid rgba(24,34,28,0.08)",
    fontFamily: "inherit",
    maxWidth: 720,
    margin: "0 auto",
    boxSizing: "border-box",
  },
  icon: {
    width: 46,
    height: 46,
    minWidth: 46,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  content: {
    flex: "1 1 auto",
    minWidth: 0,
  },
  title: {
    fontWeight: 800,
    fontSize: 15,
    lineHeight: 1.2,
    marginBottom: 3,
  },
  text: {
    fontSize: 12.5,
    lineHeight: 1.35,
    opacity: 0.78,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  installButton: {
    border: 0,
    borderRadius: 12,
    padding: "10px 14px",
    background: "#1f7a4d",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  laterButton: {
    border: 0,
    borderRadius: 12,
    padding: "9px 8px",
    background: "transparent",
    color: "#4e5b53",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "rgba(0,0,0,0.42)",
  },
  modal: {
    width: "min(100%, 430px)",
    borderRadius: 22,
    background: "#fff",
    color: "#18221c",
    padding: 22,
    boxShadow: "0 18px 55px rgba(0,0,0,0.24)",
    fontFamily: "inherit",
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: 800,
    marginBottom: 10,
  },
  modalText: {
    fontSize: 15,
    lineHeight: 1.55,
    opacity: 0.86,
  },
  closeButton: {
    width: "100%",
    marginTop: 18,
    border: 0,
    borderRadius: 14,
    padding: "12px 16px",
    background: "#1f7a4d",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};

