"use client";
import React from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { Box } from "@mui/material";

export default function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminHeader />
      <Box sx={{ display: "flex" }}>
        <AdminSidebar />
        <Box
          component="main"
          sx={{
            flex: 1,
            width: "100%",
            // flexGrow: 1,
            // pl: sideBarOpen ? '280px' : '72px', // Width of the sidebar
            // minHeight: '90vh',
            bgcolor: "background.default",
          }}
        >
          {/*<Box*/}
          {/*    sx={{*/}
          {/*        px: { xs: 2, md: 4 },*/}
          {/*        pt: { xs: 2, md: 3 },*/}
          {/*    }}*/}
          {/*>*/}
          {children}
          {/*</Box>*/}
        </Box>
      </Box>
    </>
  );
}
