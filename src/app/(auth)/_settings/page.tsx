"use client";

import {
  Box,
  Typography,
  Paper,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Button,
} from "@mui/material";

export default function Settings() {
  return (
    <Box
      sx={{
        p: 3,
        mt: 2,
        minHeight: "100vh",
        backgroundColor: "background.default",
      }}
    >
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Settings
      </Typography>

      <Paper sx={{ p: 4, mt: 2 }}>
        <Box component="form" noValidate autoComplete="off">
          {/* Mining Configuration */}
          <Typography variant="h6" gutterBottom>
            Mining Configuration
          </Typography>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: 2,
              mb: 3,
            }}
          >
            <Box sx={{ flex: 1 }}>
              <TextField fullWidth select label="Mining Pool" defaultValue="">
                <MenuItem value="">Select Pool</MenuItem>
                <MenuItem value="Ethermine">Ethermine</MenuItem>
                <MenuItem value="F2Pool">F2Pool</MenuItem>
                <MenuItem value="Nanopool">Nanopool</MenuItem>
              </TextField>
            </Box>
            <Box sx={{ flex: 1 }}>
              <TextField fullWidth label="Worker Name" placeholder="worker01" />
            </Box>
          </Box>

          {/* Notification Settings */}
          <Typography variant="h6" gutterBottom>
            Notifications
          </Typography>
          <Box sx={{ mb: 3 }}>
            <FormControlLabel
              control={<Checkbox />}
              label="Email notifications"
            />
            <FormControlLabel control={<Checkbox />} label="Mining alerts" />
            <FormControlLabel
              control={<Checkbox />}
              label="Performance warnings"
            />
          </Box>

          {/* Save Button */}
          <Box sx={{ textAlign: "right" }}>
            <Button variant="contained" color="primary">
              Save Settings
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
