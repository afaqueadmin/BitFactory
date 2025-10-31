import { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Paper,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import Image from 'next/image';

export default function TwoFactorSettings( { twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(twoFactorEnabled);
  const [setupMode, setSetupMode] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  const startSetup = async () => {
    try {
      const response = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
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
      setError('Failed to start 2FA setup');
    }
  };

  const verifyAndEnable = async () => {
    try {
      const response = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      setToken('');
      setIsTwoFactorEnabled(true)
    } catch (error) {
      setError('Failed to verify 2FA token');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Two-Factor Authentication
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {isTwoFactorEnabled ? (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              Two-factor authentication is enabled for your account.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Your account is secured with two-factor authentication. You&apos;ll need to enter a verification code from your authenticator app when signing in.
            </Typography>
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

        <Dialog
          open={showBackupCodes}
          onClose={() => {
              setShowBackupCodes(false)
          }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Save Your Backup Codes</DialogTitle>
          <DialogContent>
            <Typography variant="body1" gutterBottom>
              Store these backup codes in a secure place. Each code can only be used once.
            </Typography>
            <Grid container spacing={1} sx={{ mt: 1 }}>
              {backupCodes.map((code, index) => (
                <Grid item xs={6} key={index}>
                  <Typography variant="mono">{code}</Typography>
                </Grid>
              ))}
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowBackupCodes(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </Paper>
    </Box>
  );
}
