import React from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { Box } from "@mui/material";

export default function ManageLayout({ children }: { children: React.ReactNode }) {
    return (
        <Box 
            sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: '100vh',
                backgroundColor: 'background.default'
            }}
        >
            <AdminHeader />
            <Box
                component="main"
                sx={{
                    flex: 1,
                    width: '100%',
                    px: { xs: 2, md: 4 },
                    pt: { xs: 2, md: 3 },
                }}
            >
                {children}
            </Box>
        </Box>
    );
}
