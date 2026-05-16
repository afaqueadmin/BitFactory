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
  Tabs,
  Tab,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import LockIcon from "@mui/icons-material/Lock";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import TwoFactorVerification from "@/components/TwoFactorVerification";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";
import { authenticateWithPasskey } from "@/lib/webauthn/authentication";
import { isWebAuthnSupported } from "@/lib/webauthn/utils";

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
  const [showPasskeyPrompt, setShowPasskeyPrompt] = useState(false);
  const [pendingRedirectUrl, setPendingRedirectUrl] = useState<string | null>(
    null,
  );

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
      });

      const data = await response.json();

      if (response.ok) {
        // ✅ Login successful
        console.log("Login successful, redirecting to:", data.redirectUrl);

        // If the server says 2FA is required for this login, go to 2FA flow.
        if (data.requiresTwoFactor) {
          setShowTwoFactor(true);
          router.replace("/two-factor-authentication");
          return;
        }

        // Otherwise, if browser supports WebAuthn, check whether user already
        // has passkeys registered. Only prompt to set up a passkey when none
        // exist for this account.
        if (webAuthnSupported) {
          try {
            const credsRes = await fetch("/api/auth/webauthn/credentials", {
              method: "GET",
              credentials: "include",
            });

            if (credsRes.ok) {
              const credsData = await credsRes.json();
              const credentials = credsData.credentials || [];
              if (!credentials || credentials.length === 0) {
                setPendingRedirectUrl(data.redirectUrl);
                setShowPasskeyPrompt(true);
              } else {
                router.refresh();
                router.replace(data.redirectUrl);
              }
            } else {
              // If we couldn't determine credentials, avoid prompting every
              // time — just redirect the user.
              router.refresh();
              router.replace(data.redirectUrl);
            }
          } catch (err) {
            console.error("Failed to check existing passkeys:", err);
            router.refresh();
            router.replace(data.redirectUrl);
          }
        } else {
          router.refresh(); // Refresh router cache
          router.replace(data.redirectUrl); // Use replace instead of push
        }
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
    router.refresh(); // Refresh router cache
    // router.replace(data.redirectUrl); // Use replace instead of push

    router.replace(redirectUrl);
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

            <Button
              type="submit"
              fullWidth
              variant="contained"
              color="primary"
              sx={{ mt: 3, mb: 1 }}
              disabled={isLoading}
              startIcon={isLoading ? <CircularProgress size={20} /> : null}
            >
              {isLoading ? "Loading..." : "Continue"}
            </Button>

            {webAuthnSupported && (
              <Button
                fullWidth
                variant="outlined"
                color="secondary"
                sx={{ mt: 1 }}
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

            {/* Passkey setup prompt after password login */}
            <Dialog
              open={showPasskeyPrompt}
              onClose={() => setShowPasskeyPrompt(false)}
              maxWidth="xs"
              fullWidth
            >
              <DialogTitle>Set up a passkey?</DialogTitle>
              <DialogContent>
                <DialogContentText>
                  For faster and safer logins, would you like to set up a
                  passkey (Face ID / Touch ID / Windows Hello) on this device?
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={() => {
                    setShowPasskeyPrompt(false);
                    if (pendingRedirectUrl) router.replace(pendingRedirectUrl);
                  }}
                >
                  No thanks
                </Button>
                <Button
                  onClick={async () => {
                    setShowPasskeyPrompt(false);
                    // Trigger registration (user is authenticated via cookie)
                    try {
                      const res = await fetch(
                        "/api/auth/webauthn/register/options",
                        {
                          method: "POST",
                          credentials: "include",
                        },
                      );
                      if (!res.ok) {
                        console.error("Failed to get registration options");
                      } else {
                        // Use existing helper to run registration
                        const { registerPasskey } =
                          await import("@/lib/webauthn/registration");
                        const regResult = await registerPasskey();
                        if (!regResult.success) {
                          console.error(
                            "Passkey registration failed:",
                            regResult.error,
                          );
                        }
                      }
                    } catch (err) {
                      console.error("Passkey setup error:", err);
                    } finally {
                      if (pendingRedirectUrl)
                        router.replace(pendingRedirectUrl);
                    }
                  }}
                  variant="contained"
                >
                  Set up passkey
                </Button>
              </DialogActions>
            </Dialog>
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

          {/*
                    Test User Info (commented out to hide credentials)
                    <Box mt={2} fontSize={14} color="text.secondary">
                        <Typography>
                            💡 Test user created in database:
                        </Typography>
                        <Typography>
                            Email: <code>admin@example.com</code>
                        </Typography>
                        <Typography>
                            Password: <code>123456</code>
                        </Typography>
                    </Box>
                    */}
        </Paper>
      )}
    </Box>
  );
}
