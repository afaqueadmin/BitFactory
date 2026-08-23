"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  InputAdornment,
  IconButton,
  CircularProgress,
  Alert,
  Card,
  CardContent,
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

const PASSKEY_OFFER_FLAG = "bf_offer_passkey_setup";

function setPasskeyOfferFlag() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PASSKEY_OFFER_FLAG, "1");
}

export default function Login() {
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

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
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
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: "100%",
            maxWidth: 400,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Logo */}
          <Box mb={1} sx={{ display: "flex", justifyContent: "center" }}>
            <Image
              src="/BitfactoryLogo.webp"
              alt="BitFactory Logo"
              width={220}
              height={48}
              style={{ height: "auto" }}
            />
          </Box>

          <Typography variant="body2" color="text.main" mb={3} fontSize={16}>
            Login To Your Bitcoin Mining Factory.
          </Typography>

          {/* Error Message */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              fullWidth
              required
              name="email"
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={handleChange}
              margin="normal"
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
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Box display="flex" mt={1}>
              <Button
                variant="text"
                size="small"
                onClick={handleForgotPassword}
                sx={{ textTransform: "none" }}
              >
                Forgot password?
              </Button>
            </Box>

            {webAuthnSupported && (
              <Button
                fullWidth
                variant="contained"
                sx={{
                  mt: 3,
                  mb: 1,
                  bgcolor: "#0f766e",
                  color: "#ffffff",
                  boxShadow: "0 8px 24px rgba(15, 118, 110, 0.28)",
                  "&:hover": {
                    bgcolor: "#115e59",
                    boxShadow: "0 10px 28px rgba(15, 118, 110, 0.34)",
                  },
                }}
                onClick={handlePasskeyLogin}
                disabled={passKeyLoading || !formData.email}
                startIcon={
                  passKeyLoading ? (
                    <CircularProgress size={20} />
                  ) : (
                    <FingerprintIcon />
                  )
                }
              >
                {passKeyLoading ? "Authenticating..." : "Login with Passkey"}
              </Button>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              sx={{ mt: 1, mb: 1 }}
              disabled={isLoading || !formData.password}
              startIcon={isLoading ? <CircularProgress size={20} /> : null}
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
                variant="body2"
                color="text.secondary"
                component="span"
                sx={{ mr: 0 }}
              >
                Don&apos;t have an account?
              </Typography>
              <Button
                component="a"
                href="https://www.bitfactory.ae"
                target="_blank"
                rel="noopener noreferrer"
                variant="text"
                size="medium"
                sx={{ textTransform: "none", ml: 0 }}
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
            <Card sx={{ mt: 2, bgcolor: "info.lighter" }}>
              <CardContent>
                <Typography variant="caption" color="info.main">
                  ℹ️ Passkey authentication is not available in your browser.
                  Please update your browser or use the password login method.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Paper>
      )}

      {/* PWA Mobile/Tablet Install Modal Popup */}
      <PwaInstallPrompt />
    </Box>
  );
}
