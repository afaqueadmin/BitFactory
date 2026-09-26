"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  TextField,
  Typography,
  InputAdornment,
  IconButton,
  CircularProgress,
  Alert,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import TwoFactorVerification from "@/components/TwoFactorVerification";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";
import { authenticateWithPasskey } from "@/lib/webauthn/authentication";
import { isWebAuthnSupported } from "@/lib/webauthn/utils";
import PwaInstallPrompt, {
  PwaQuickInstallButton,
} from "@/components/pwa/PwaInstallPrompt";
import { PwaInstallProvider } from "@/components/pwa/PwaInstallContext";
import { RADIUS_CARD, focusRing, useDaylight } from "@/lib/daylight";

const PASSKEY_OFFER_FLAG = "bf_offer_passkey_setup";

function setPasskeyOfferFlag() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PASSKEY_OFFER_FLAG, "1");
}

export default function Login() {
  const { d, fonts } = useDaylight();
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);
  const [passKeyLoading, setPassKeyLoading] = useState(false);
  // Check WebAuthn support on component mount
  useEffect(() => {
    if (isWebAuthnSupported()) {
      setWebAuthnSupported(true);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const { email, password } = formData;

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await response.json();

      if (response.ok) {
        // ✅ Login successful
        console.log("Login successful, redirecting to:", data.redirectUrl);

        // If the server says 2FA is required for this login, go to 2FA flow.
        if (data.requiresTwoFactor) {
          setShowTwoFactor(true);
          return;
        }

        // Full login is complete. Offer passkey setup only after navigation.
        if (webAuthnSupported) {
          setPasskeyOfferFlag();
        }

        router.refresh();
        router.replace(data.redirectUrl);
      } else {
        // ❌ Login failed
        setError(data.error || "Login failed");
      }
    } catch {
      setError("An error occurred during login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = () => {
    // Open forgot password modal
    setShowForgotPassword(true);
  };

  const handlePasskeyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) {
      setError("Please enter your email address");
      return;
    }
    setPassKeyLoading(true);
    setError("");

    try {
      const result = await authenticateWithPasskey(formData.email);

      if (result.success && result.redirectUrl) {
        // Successful login
        router.refresh();
        router.replace(result.redirectUrl);
      } else if (result.requiresMfa) {
        // Need 2FA verification
        setFormData({ ...formData, email: formData.email });
        setShowTwoFactor(true);
      } else {
        // Authentication failed
        setError(result.error || "Passkey authentication failed");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred during passkey login",
      );
    } finally {
      setPassKeyLoading(false);
    }
  };

  const handleTwoFactorVerified = (redirectUrl: string) => {
    // Use a full navigation to ensure cookies are set and auth state is fully initialized
    window.location.href = redirectUrl;
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px",
      fontFamily: fonts.body,
      "& fieldset": { borderColor: d.inputBorder },
      "&:hover fieldset": { borderColor: d.action },
    },
    "& .MuiOutlinedInput-root.Mui-focused fieldset": {
      borderColor: d.action,
      borderWidth: "2px",
    },
    "& .MuiInputLabel-root": { fontFamily: fonts.body },
  };

  return (
    <PwaInstallProvider>
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
          bgcolor: d.canvas,
          fontFamily: fonts.body,
        }}
      >
        {/* Forgot Password Modal */}
        <ForgotPasswordModal
          open={showForgotPassword}
          onClose={() => setShowForgotPassword(false)}
        />

        {showTwoFactor ? (
          <TwoFactorVerification
            email={formData.email}
            onVerified={handleTwoFactorVerified}
          />
        ) : (
          <Box
            sx={{
              p: 4,
              width: "100%",
              maxWidth: 400,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              bgcolor: d.surface,
              border: `1px solid ${d.border}`,
              borderRadius: RADIUS_CARD,
              boxShadow: d.shadow,
            }}
          >
            {/* Logo */}
            <Box mb={1} sx={{ display: "flex", justifyContent: "center" }}>
              <Image
                src="/BitfactoryLogo.webp"
                alt="BitFactory Logo"
                width={220}
                height={110}
                style={{ height: "auto" }}
              />
            </Box>

            <Typography
              mb={3}
              sx={{ fontSize: 15, color: d.muted, fontFamily: fonts.body }}
            >
              Login To Your Bitcoin Mining Factory.
            </Typography>

            {/* Error Message */}
            {error && (
              <Alert
                severity="error"
                sx={{
                  mb: 2,
                  width: "100%",
                  borderRadius: "8px",
                  bgcolor: d.dangerSoft,
                  color: d.danger,
                  fontFamily: fonts.body,
                  "& .MuiAlert-icon": { color: d.danger },
                }}
              >
                {error}
              </Alert>
            )}

            <Box
              component="form"
              onSubmit={handleSubmit}
              noValidate
              sx={{ width: "100%" }}
            >
              <TextField
                fullWidth
                required
                name="email"
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={handleChange}
                margin="normal"
                sx={inputSx}
              />

              <TextField
                fullWidth
                required
                name="password"
                label="Password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={handleChange}
                margin="normal"
                sx={inputSx}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        sx={{ color: d.muted }}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Box display="flex" mt={1}>
                <Button
                  size="small"
                  onClick={handleForgotPassword}
                  sx={{
                    textTransform: "none",
                    fontFamily: fonts.body,
                    color: d.action,
                    "&:hover": { bgcolor: d.hover },
                  }}
                >
                  Forgot password?
                </Button>
              </Box>

              {webAuthnSupported && (
                <Button
                  fullWidth
                  onClick={handlePasskeyLogin}
                  disabled={passKeyLoading || !formData.email}
                  startIcon={
                    passKeyLoading ? (
                      <CircularProgress size={20} sx={{ color: d.action }} />
                    ) : (
                      <FingerprintIcon />
                    )
                  }
                  sx={{
                    mt: 3,
                    mb: 1,
                    minHeight: 42,
                    borderRadius: "8px",
                    textTransform: "none",
                    fontWeight: 600,
                    fontFamily: fonts.body,
                    color: d.action,
                    border: `1px solid ${d.action}`,
                    "&:hover": { bgcolor: d.hover },
                    "&:focus-visible": focusRing(d.action),
                    "&.Mui-disabled": { color: d.muted, borderColor: d.border },
                  }}
                >
                  {passKeyLoading ? "Authenticating..." : "Login with Passkey"}
                </Button>
              )}

              <Button
                type="submit"
                fullWidth
                sx={{
                  mt: 1,
                  mb: 1,
                  minHeight: 42,
                  borderRadius: "8px",
                  textTransform: "none",
                  fontWeight: 650,
                  fontFamily: fonts.body,
                  color: "#fff",
                  bgcolor: d.action,
                  boxShadow: "none",
                  "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
                  "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
                }}
                disabled={isLoading || !formData.password}
                startIcon={
                  isLoading ? (
                    <CircularProgress size={20} sx={{ color: "#fff" }} />
                  ) : null
                }
              >
                {isLoading ? "Loading..." : "Login with Password"}
              </Button>

              {/* Signup prompt (inline, no gap) */}
              <Box
                mt={2}
                display="flex"
                justifyContent="center"
                alignItems="center"
              >
                <Typography
                  component="span"
                  sx={{ fontSize: 13, color: d.muted, fontFamily: fonts.body }}
                >
                  Don&apos;t have an account?
                </Typography>
                <Button
                  component="a"
                  href="https://www.bitfactory.ae"
                  target="_blank"
                  rel="noopener noreferrer"
                  size="medium"
                  sx={{
                    textTransform: "none",
                    ml: 0,
                    fontFamily: fonts.body,
                    color: d.action,
                    "&:hover": { bgcolor: d.hover },
                  }}
                >
                  Sign up
                </Button>
              </Box>

              {/* Quick Mobile App Install Pill for Mobile/Tablet */}
              <Box mt={2} display="flex" justifyContent="center">
                <PwaQuickInstallButton />
              </Box>
            </Box>

            {/* Passkey unavailable notice */}
            {!webAuthnSupported && (
              <Box
                sx={{
                  mt: 2,
                  p: "12px 14px",
                  width: "100%",
                  borderRadius: "8px",
                  bgcolor: d.skySoft,
                  border: `1px solid ${d.borderSky}`,
                }}
              >
                <Typography
                  sx={{ fontSize: 11, color: d.action, fontFamily: fonts.body }}
                >
                  ℹ️ Passkey authentication is not available in your browser.
                  Please update your browser or use the password login method.
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* PWA Mobile/Tablet Install Modal Popup */}
        <PwaInstallPrompt />
      </Box>
    </PwaInstallProvider>
  );
}
