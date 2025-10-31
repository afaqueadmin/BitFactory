import { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  Paper,
} from '@mui/material';

interface TwoFactorVerificationProps {
  email: string;
  onVerified: (redirectUrl: string) => void;
}

export default function TwoFactorVerification({ email, onVerified }: TwoFactorVerificationProps) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const handleVerify = async () => {
    try {
      const response = await fetch('/api/auth/2fa/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, token }),
      });
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      onVerified(data.redirectUrl);
    } catch (error) {
      setError('Failed to verify 2FA token');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Two-Factor Authentication Required
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography variant="body1" gutterBottom>
          Enter the verification code from your authenticator app or use a backup code:
        </Typography>

        <Box sx={{ mt: 2 }}>
          <TextField
            label="Verification Code"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            sx={{ mr: 2 }}
          />
          <Button
            variant="contained"
            onClick={handleVerify}
            disabled={!token}
          >
            Verify
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
