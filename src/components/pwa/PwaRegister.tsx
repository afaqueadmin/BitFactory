"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      const registerSw = async () => {
        try {
          const registration = await navigator.serviceWorker.register(
            "/sw.js",
            {
              scope: "/",
            },
          );

          // Check for updates
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  console.log(
                    "New BitFactory PWA content available; please refresh.",
                  );
                }
              });
            }
          });

          console.log(
            "BitFactory Service Worker registered with scope:",
            registration.scope,
          );
        } catch (error) {
          console.error(
            "BitFactory Service Worker registration failed:",
            error,
          );
        }
      };

      if (document.readyState === "complete") {
        registerSw();
      } else {
        window.addEventListener("load", registerSw);
        return () => window.removeEventListener("load", registerSw);
      }
    } else if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV !== "production"
    ) {
      // No service worker in dev: it serves /_next/static from cache first,
      // and dev chunk URLs aren't content-hashed, so after an edit the browser
      // gets stale chunks ("module factory is not available"). Remove any
      // worker and cache left over from an earlier dev session.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((names) =>
            Promise.all(
              names
                .filter((n) => n.startsWith("bitfactory-pwa"))
                .map((n) => caches.delete(n)),
            ),
          )
          .catch(() => {});
      }
    }
  }, []);

  return null;
}
