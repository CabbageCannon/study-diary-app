import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallRequestResult = "prompted" | "ios-guide" | "unsupported";

interface PwaInstallContextValue {
  canOfferInstall: boolean;
  isIosInstallAvailable: boolean;
  isIosGuideOpen: boolean;
  requestInstall: () => Promise<InstallRequestResult>;
  closeIosGuide: () => void;
  dismissIosGuide: () => void;
}

const IOS_GUIDE_DISMISSED_UNTIL_KEY = "study-diary:pwa-ios-guide-dismissed-until";
const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isGuideDismissed() {
  const until = Number(window.localStorage.getItem(IOS_GUIDE_DISMISSED_UNTIL_KEY));
  return Number.isFinite(until) && until > Date.now();
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const [iosGuideDismissed, setIosGuideDismissed] = useState(() => isGuideDismissed());
  const isIosInstallAvailable = isIosBrowser() && !isStandaloneDisplay() && !iosGuideDismissed;

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  async function requestInstall(): Promise<InstallRequestResult> {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      setDeferredPrompt(null);
      await prompt.prompt();
      await prompt.userChoice;
      return "prompted";
    }
    if (isIosInstallAvailable) {
      setIosGuideOpen(true);
      return "ios-guide";
    }
    return "unsupported";
  }

  function dismissIosGuide() {
    window.localStorage.setItem(IOS_GUIDE_DISMISSED_UNTIL_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setIosGuideDismissed(true);
    setIosGuideOpen(false);
  }

  const value = useMemo<PwaInstallContextValue>(() => ({
    canOfferInstall: Boolean(deferredPrompt) || isIosInstallAvailable,
    isIosInstallAvailable,
    isIosGuideOpen: iosGuideOpen,
    requestInstall,
    closeIosGuide: () => setIosGuideOpen(false),
    dismissIosGuide,
  }), [deferredPrompt, iosGuideOpen, isIosInstallAvailable]);

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall() {
  const value = useContext(PwaInstallContext);
  if (!value) {
    throw new Error("usePwaInstall must be used within PwaInstallProvider");
  }
  return value;
}
