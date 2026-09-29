"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Alert, Button, Snackbar } from "@mui/material";
import { useUser } from "@/lib/hooks/useUser";

const DISMISSED_FLAG = "bf_2fa_reminder_dismissed";

function settingsPathForRole(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
    ? "/security-settings"
    : "/security-setting";
}

/**
 * Grace-period reminder for mandatory 2FA (M-1): shown until the account
 * enables 2FA, dismissible for the rest of the browser session.
 */
export default function TwoFactorReminder() {
  const { user } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISSED_FLAG) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!user?.twoFactorRequiredBy || user.twoFactorEnabled || dismissed) {
    return null;
  }
  const settingsPath = settingsPathForRole(user.role);
  if (pathname === settingsPath) return null;

  const deadline = new Date(user.twoFactorRequiredBy);
  const pastDeadline = deadline.getTime() <= Date.now();
  const deadlineText = deadline.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_FLAG, "1");
    } catch {
      // Storage unavailable - just hide for this page view.
    }
    setDismissed(true);
  };

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      sx={{ maxWidth: 640 }}
    >
      <Alert
        severity="warning"
        variant="filled"
        onClose={dismiss}
        action={
          <>
            <Button
              color="inherit"
              size="small"
              onClick={() => router.push(settingsPath)}
            >
              Set up now
            </Button>
            <Button color="inherit" size="small" onClick={dismiss}>
              Later
            </Button>
          </>
        }
      >
        {pastDeadline
          ? "Two-factor authentication is now required for your account. You'll be asked to set it up at your next password login."
          : `Two-factor authentication will be required for your account from ${deadlineText}. Set it up now to avoid being asked at login.`}
      </Alert>
    </Snackbar>
  );
}
