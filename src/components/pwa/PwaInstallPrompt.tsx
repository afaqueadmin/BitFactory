"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Button,
  IconButton,
  Fade,
  Slide,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { TransitionProps } from "@mui/material/transitions";
import CloseIcon from "@mui/icons-material/Close";
import IosShareIcon from "@mui/icons-material/IosShare";
import { usePwaInstallContext } from "./PwaInstallContext";

const SlideTransition = React.forwardRef(function SlideTransition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function PwaInstallPrompt() {
  const {
    isStandalone,
    isMobileOrTablet,
    isIos,
    isInstalled,
    canInstall,
    isOpen,
    promptInstall,
    dismissPrompt,
  } = usePwaInstallContext();

  const [installing, setInstalling] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("sm"));

  // Never show if already running inside installed standalone PWA, or if on desktop
  if (isStandalone || !isMobileOrTablet || isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIos) {
      return;
    }

    // The browser hasn't handed us a native install prompt to trigger
    // (e.g. it already fired before this component mounted). Fall back
    // to instructing the user rather than silently doing nothing.
    if (!canInstall) {
      setShowManualFallback(true);
      return;
    }

    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={dismissPrompt}
      TransitionComponent={SlideTransition}
      keepMounted
      fullWidth
      maxWidth="xs"
      sx={{
        "& .MuiDialog-container": {
          alignItems: "flex-end",
          justifyContent: "center",
        },
      }}
      PaperProps={{
        sx: {
          m: { xs: 1.5, sm: 3 },
          mb: { xs: "calc(12px + env(safe-area-inset-bottom, 0px))", sm: 3 },
          borderRadius: "20px",
          backgroundColor: "#ffffff",
          backgroundImage: "none",
          border: "1px solid #e2e8f0",
          boxShadow: "0 -4px 30px rgba(0, 0, 0, 0.12)",
          color: "#0f172a",
          overflow: "hidden",
        },
      }}
    >
      <DialogContent sx={{ p: { xs: 3, sm: 4 }, position: "relative" }}>
        {/* Close Button */}
        <IconButton
          onClick={dismissPrompt}
          size="small"
          aria-label="Close"
          sx={{
            position: "absolute",
            right: 12,
            top: 12,
            color: "#94a3b8",
            "&:hover": {
              color: "#0f172a",
              bgcolor: "#f1f5f9",
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>

        {/* Centered BitFactory Logo */}
        <Box sx={{ display: "flex", justifyContent: "center", mb: 2, mt: 1 }}>
          <Image
            src="/BitfactoryLogo.webp"
            alt="BitFactory"
            width={180}
            height={40}
            style={{ height: "auto" }}
            priority
          />
        </Box>

        {/* Simple Title */}
        <Typography
          variant="h6"
          fontWeight={600}
          align="center"
          sx={{ color: "#0f172a", fontSize: "1.125rem", mb: 0.75 }}
        >
          Install BitFactory App
        </Typography>

        {/* Clean Minimalist Subtitle */}
        <Typography
          variant="body2"
          align="center"
          sx={{
            color: "#64748b",
            fontSize: "0.9rem",
            mb: 3,
            px: 1,
            lineHeight: 1.5,
          }}
        >
          Install our app on your device for quick and seamless access to your
          mining factory.
        </Typography>

        {/* Platform Specific Action UI */}
        {isIos ? (
          /* iOS Simple Instruction Box */
          <Box>
            <Box
              sx={{
                p: 2,
                borderRadius: 2.5,
                bgcolor: "#f8fafc",
                border: "1px solid #e2e8f0",
                mb: 2.5,
                textAlign: "center",
              }}
            >
              <Typography
                variant="body2"
                sx={{ color: "#334155", fontSize: "0.875rem", lineHeight: 1.6 }}
              >
                Tap{" "}
                <IosShareIcon
                  sx={{
                    fontSize: 18,
                    verticalAlign: "middle",
                    mx: 0.5,
                    color: "#1976d2",
                  }}
                />{" "}
                in Safari, then select <strong>Add to Home Screen</strong>.
              </Typography>
            </Box>

            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={dismissPrompt}
              sx={{
                py: 1.2,
                borderRadius: 2.5,
                fontSize: "0.95rem",
                fontWeight: 600,
                textTransform: "none",
              }}
            >
              Got it
            </Button>
          </Box>
        ) : (
          /* Android / Standard 1-Tap Install */
          <Box>
            {showManualFallback && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  bgcolor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  mb: 2,
                  textAlign: "center",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    color: "#334155",
                    fontSize: "0.875rem",
                    lineHeight: 1.6,
                  }}
                >
                  Your browser didn&apos;t offer an automatic install this
                  time. Open the browser menu (⋮) and choose{" "}
                  <strong>Add to Home screen</strong> or{" "}
                  <strong>Install app</strong>.
                </Typography>
              </Box>
            )}

            <Button
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              onClick={handleInstallClick}
              disabled={installing}
              sx={{
                py: 1.3,
                borderRadius: 2.5,
                fontSize: "0.95rem",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "none",
                "&:hover": {
                  boxShadow: "0 4px 12px rgba(25, 118, 210, 0.25)",
                },
              }}
            >
              {installing ? "Installing..." : "Install App"}
            </Button>

            <Button
              fullWidth
              variant="text"
              onClick={dismissPrompt}
              sx={{
                mt: 1,
                color: "#64748b",
                textTransform: "none",
                fontSize: "0.875rem",
                "&:hover": {
                  bgcolor: "transparent",
                  color: "#0f172a",
                },
              }}
            >
              Not now
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Quick inline button to trigger or view the PWA install popup manually
 */
export function PwaQuickInstallButton() {
  const { isStandalone, isMobileOrTablet, isInstalled, openPrompt } =
    usePwaInstallContext();

  if (isStandalone || !isMobileOrTablet || isInstalled) {
    return null;
  }

  return (
    <Button
      variant="text"
      size="small"
      onClick={openPrompt}
      sx={{
        textTransform: "none",
        color: "text.secondary",
        fontSize: "0.85rem",
        "&:hover": {
          color: "primary.main",
          bgcolor: "transparent",
        },
      }}
    >
      Install Mobile App
    </Button>
  );
}
