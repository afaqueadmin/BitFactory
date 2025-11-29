"use client";

import Image from "next/image";
import { useState } from "react";
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
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import TwoFactorVerification from "@/components/TwoFactorVerification";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";

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
        router.refresh(); // Refresh router cache
        router.replace(data.redirectUrl); // Use replace instead of push
        if (data.requiresTwoFactor) {
          setShowTwoFactor(true);
          router.replace("/two-factor-authentication"); // Navigate to 2FA page
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

          {/* Form */}
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
          </Box>

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
