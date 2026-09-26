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
import { RADIUS_CARD, useDaylight } from "@/lib/daylight";

export default function TwoFactorSettings({
  twoFactorEnabled,
  daylight = false,
}: {
  twoFactorEnabled: boolean;
  daylight?: boolean;
}) {
  const { d, fonts } = useDaylight();
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
    } catch {
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
    } catch {
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
    } catch {
      setError("Failed to disable 2FA");
    }
  };

  // Dialogs (backup codes display, disable-2FA confirmation) are left on
  // default MUI styling in both variants - they're genuine overlays, not
  // the page's primary content.
  const backupCodesDialog = (
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
          Store these 2FA backup codes in a secure place. Each code can only be
          used once. Use these codes in case 2FA is in accessible during login.
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
  );

  const disableDialog = (
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
  );

  if (!daylight) {
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
                <Button
                  variant="contained"
                  color="primary"
                  onClick={startSetup}
                >
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

          {backupCodesDialog}
          {disableDialog}
        </Paper>
      </Box>
    );
  }

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
    "& .MuiInputLabel-root": { fontFamily: fonts.body, color: d.muted },
  };

  const alertSx = (tone: "success" | "error") => ({
    borderRadius: "8px",
    bgcolor: tone === "success" ? d.mint : d.dangerSoft,
    color: tone === "success" ? d.success : d.danger,
    fontFamily: fonts.body,
    "& .MuiAlert-icon": { color: tone === "success" ? d.success : d.danger },
  });

  const primaryBtnSx = {
    textTransform: "none",
    fontFamily: fonts.body,
    fontWeight: 650,
    borderRadius: "8px",
    minHeight: 40,
    bgcolor: d.action,
    color: "#fff",
    boxShadow: "none",
    "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
    "&.Mui-disabled": { bgcolor: d.border, color: d.muted },
  } as const;

  return (
    <Box
      sx={{
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        p: { xs: 2.5, sm: 4 },
      }}
    >
      <Typography
        sx={{
          fontFamily: fonts.heading,
          fontWeight: 700,
          fontSize: 18,
          color: d.text,
          mb: 2,
        }}
      >
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
          sx={{ width: "100%", ...alertSx("error") }}
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
          sx={{ width: "100%", ...alertSx("success") }}
        >
          {successMessage}
        </Alert>
      </Snackbar>

      {isTwoFactorEnabled ? (
        <Box>
          <Alert sx={{ mb: 2, ...alertSx("success") }}>
            Two-factor authentication is enabled for your account.
          </Alert>
          <Typography
            sx={{ fontFamily: fonts.body, fontSize: 13, color: d.muted }}
          >
            Your account is secured with two-factor authentication. You&apos;ll
            need to enter a verification code from your authenticator app when
            signing in.
          </Typography>
          <Box sx={{ mt: 2 }}>
            <Button
              variant="contained"
              onClick={() => setDisableDialogOpen(true)}
              sx={primaryBtnSx}
            >
              Disable 2FA
            </Button>
          </Box>
        </Box>
      ) : (
        <>
          {!setupMode && !showBackupCodes && (
            <Button variant="contained" onClick={startSetup} sx={primaryBtnSx}>
              Set up 2FA
            </Button>
          )}
        </>
      )}

      {setupMode && (
        <Box sx={{ mt: 2 }}>
          <Typography
            sx={{ fontFamily: fonts.body, fontSize: 13, color: d.text, mb: 1 }}
          >
            1. Scan this QR code with your authenticator app:
          </Typography>

          {qrCode && (
            <Box sx={{ my: 2 }}>
              <Image src={qrCode} alt="2FA QR Code" width={200} height={200} />
            </Box>
          )}

          <Typography
            sx={{ fontFamily: fonts.body, fontSize: 13, color: d.text }}
          >
            Manual entry code: {secret}
          </Typography>

          <Typography
            sx={{
              fontFamily: fonts.body,
              fontSize: 13,
              color: d.text,
              mt: 2,
              mb: 1,
            }}
          >
            2. Enter the verification code from your app:
          </Typography>

          <Box
            sx={{
              mt: 1,
              display: "flex",
              gap: 2,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <TextField
              label="Verification Code"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              size="small"
              sx={inputSx}
            />
            <Button
              variant="contained"
              onClick={verifyAndEnable}
              disabled={!token}
              sx={primaryBtnSx}
            >
              Verify and Enable
            </Button>
          </Box>
        </Box>
      )}

      {backupCodesDialog}
      {disableDialog}
    </Box>
  );
}
