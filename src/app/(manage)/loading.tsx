import { Box, CircularProgress } from "@mui/material";

// Shown in <main> while the next admin page loads, so navigation switches
// pages (and the URL) straight away instead of waiting for the new route.
export default function ManageLoading() {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: 240,
      }}
    >
      <CircularProgress size={32} />
    </Box>
  );
}
