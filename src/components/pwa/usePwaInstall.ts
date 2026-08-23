"use client";

import { useState, useEffect, useCallback } from "react";

const DISMISS_STORAGE_KEY = "bf_pwa_prompt_dismissed_time";
const SNOOZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days snooze

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(true); // start true until checked
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Detect Standalone / Already Installed mode
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia(
        "(display-mode: standalone)",
      ).matches;
      // @ts-expect-error - iOS navigator.standalone is non-standard
      const isIosStandalone = Boolean(window.navigator.standalone);
      const standalone = isStandaloneMedia || isIosStandalone;
      setIsStandalone(standalone);
      if (standalone) {
        setIsInstalled(true);
      }
    };

    checkStandalone();

    // 2. Detect Mobile & Tablet
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isTouchDevice =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-expect-error - legacy msMaxTouchPoints
      Boolean(navigator.msMaxTouchPoints);

    const isMobileUa =
      /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
        userAgent,
      );
    const isSmallScreen = window.innerWidth <= 1024;
    const mobileOrTablet = (isMobileUa || isTouchDevice) && isSmallScreen;
    setIsMobileOrTablet(mobileOrTablet);

    // 3. Detect iOS / iPadOS
    const isIosDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIos(isIosDevice);

    // 4. Check dismissal history
    const dismissedTimeStr = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (dismissedTimeStr) {
      const dismissedTime = parseInt(dismissedTimeStr, 10);
      const isStillSnoozed = Date.now() - dismissedTime < SNOOZE_DURATION_MS;
      setIsDismissed(isStillSnoozed);
      if (!isStillSnoozed && mobileOrTablet && !isStandalone) {
        // Auto open prompt after a gentle delay
        const timer = setTimeout(() => setIsOpen(true), 1600);
        return () => clearTimeout(timer);
      }
    } else if (mobileOrTablet && !isStandalone) {
      setIsDismissed(false);
      const timer = setTimeout(() => setIsOpen(true), 1600);
      return () => clearTimeout(timer);
    }

    // 5. Intercept BeforeInstallPromptEvent (Chromium / Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // 6. Listen for App Installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setIsOpen(false);
      console.log("BitFactory PWA successfully installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isStandalone]);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        console.log("User accepted the BitFactory PWA install");
        setIsInstalled(true);
        setIsOpen(false);
      } else {
        console.log("User dismissed the BitFactory PWA install");
      }
      setDeferredPrompt(null);
      return choiceResult.outcome === "accepted";
    } catch (err) {
      console.error("Error triggering PWA install prompt:", err);
      return false;
    }
  }, [deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
    setIsDismissed(true);
    setIsOpen(false);
  }, []);

  const openPrompt = useCallback(() => {
    setIsOpen(true);
  }, []);

  return {
    isStandalone,
    isMobileOrTablet,
    isIos,
    isInstalled,
    isDismissed,
    canInstall: Boolean(deferredPrompt) || isIos,
    isOpen,
    openPrompt,
    promptInstall,
    dismissPrompt,
  };
}
