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

export default function Login() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

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
                router.push(data.redirectUrl || "/dashboard");
            } else {
                // ❌ Login failed
                setError(data.error || "Login failed");
            }
        } catch (err) {
            console.error("Login error:", err);
            setError("Network error. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "background.default",
                px: 2,
            }}
        >
            <Paper
                elevation={6}
                sx={{
                    p: 4,
                    maxWidth: 400,
                    width: "100%",
                    borderRadius: 3,
                    textAlign: "center",
                }}
            >
                {/* Logo */}
                <Box mb={3} sx={{ display: "flex", justifyContent: "center" }}>
                    <Image
                        src="/BitfactoryLogo.webp"
                        alt="BitFactory Logo"
                        width={150}
                        height={48}
                        style={{ height: "auto" }}
                    />
                </Box>

                <Typography variant="h5" fontWeight="bold" mb={1}>
                    Welcome
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={3}>
                    Log in to BitFactory to continue.
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
                </Box>

                {/* Test User Info */}
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
            </Paper>
        </Box>
    );
}
