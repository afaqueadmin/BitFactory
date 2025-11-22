import { useState, useEffect } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
} from "@mui/material";
import Image from "next/image";

export default function TwoFactorSettings({
  twoFactorEnabled,
}: {
  twoFactorEnabled: boolean;
}) {
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] =
    useState(twoFactorEnabled);
  const [setupMode, setSetupMode] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [disableToken, setDisableToken] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleErrorClose = () => {
    setError("");
  };

  const handleSuccessClose = () => {
    setSuccessMessage("");
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (error) {
      timeoutId = setTimeout(() => {
        setError("");
      }, 3000);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [error]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (successMessage) {
      timeoutId = setTimeout(() => {
        setSuccessMessage("");
      }, 3000);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [successMessage]);

  const startSetup = async () => {
    try {
      const response = await fetch("/api/auth/2fa/setup", {
        method: "POST",
      });
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setQrCode(data.qrCode);
      setSecret(data.secret);
      setSetupMode(true);
    } catch (error) {
      setError("Failed to start 2FA setup");
    }
  };

  const verifyAndEnable = async () => {
    try {
      const response = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setBackupCodes(data.backupCodes);
      setShowBackupCodes(true);
      setSetupMode(false);
      setToken("");
      setIsTwoFactorEnabled(true);
      setSuccessMessage("Two-factor authentication enabled successfully.");
    } catch (error) {
      setError("Failed to verify 2FA token");
    }
  };

  const handleCloseDisableDialog = () => {
    setDisableDialogOpen(false);
    setDisableToken("");
  };

  const handleDisable2FA = async () => {
    try {
      const response = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: disableToken }),
      });
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      handleCloseDisableDialog();
      setIsTwoFactorEnabled(false);
      setError("");
      setSuccessMessage("Two-factor authentication disabled successfully.");
    } catch (error) {
      setError("Failed to disable 2FA");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Two-Factor Authentication
        </Typography>

        <Snackbar
          open={!!error}
          autoHideDuration={3000}
          onClose={handleErrorClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={handleErrorClose}
            severity="error"
            sx={{ width: "100%" }}
          >
            {error}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!successMessage}
          autoHideDuration={3000}
          onClose={handleSuccessClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={handleSuccessClose}
            severity="success"
            sx={{ width: "100%" }}
          >
            {successMessage}
          </Alert>
        </Snackbar>

        {isTwoFactorEnabled ? (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              Two-factor authentication is enabled for your account.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Your account is secured with two-factor authentication.
              You&apos;ll need to enter a verification code from your
              authenticator app when signing in.
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                color="primary"
                onClick={() => setDisableDialogOpen(true)}
              >
                Disable 2FA
              </Button>
            </Box>
          </Box>
        ) : (
          <>
            {!setupMode && !showBackupCodes && (
              <Button variant="contained" color="primary" onClick={startSetup}>
                Set up 2FA
              </Button>
            )}
          </>
        )}

        {setupMode && (
          <Box>
            <Typography variant="body1" gutterBottom>
              1. Scan this QR code with your authenticator app:
            </Typography>

            {qrCode && (
              <Box sx={{ my: 2 }}>
                <Image
                  src={qrCode}
                  alt="2FA QR Code"
                  width={200}
                  height={200}
                />
              </Box>
            )}

            <Typography variant="body1" gutterBottom>
              Manual entry code: {secret}
            </Typography>

            <Typography variant="body1" sx={{ mt: 2 }}>
              2. Enter the verification code from your app:
            </Typography>

            <Box sx={{ mt: 1 }}>
              <TextField
                label="Verification Code"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                sx={{ mr: 2 }}
              />
              <Button
                variant="contained"
                onClick={verifyAndEnable}
                disabled={!token}
              >
                Verify and Enable
              </Button>
            </Box>
          </Box>
        )}

        <Dialog
          open={showBackupCodes}
          onClose={() => {
            setShowBackupCodes(false);
          }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Save Your Backup Codes</DialogTitle>
          <DialogContent>
            <Typography variant="body1" gutterBottom>
              Store these 2FA backup codes in a secure place. Each code can only
              be used once. Use these codes in case 2FA is in accessible during
              login.
            </Typography>
            <Grid container spacing={1} sx={{ mt: 1 }}>
              {backupCodes.map((code, index) => (
                <Typography key={index} variant="body1">
                  {code}
                </Typography>
              ))}
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowBackupCodes(false)}>Close</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={disableDialogOpen} onClose={handleCloseDisableDialog}>
          <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Please enter the verification code from your authenticator app to
              disable 2FA.
            </Typography>
            <TextField
              label="Verification Code"
              value={disableToken}
              onChange={(e) => setDisableToken(e.target.value)}
              fullWidth
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDisableDialog}>Cancel</Button>
            <Button
              onClick={handleDisable2FA}
              variant="contained"
              color="primary"
              disabled={!disableToken}
            >
              Disable 2FA
            </Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Box>
  );
}
