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
      // Also register in dev if explicitly desired or log readiness
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) =>
          console.log("Dev BitFactory Service Worker registered:", reg.scope),
        )
        .catch((err) => console.log("Dev SW notice:", err.message));
    }
  }, []);

  return null;
}
