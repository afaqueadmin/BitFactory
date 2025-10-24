import React from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminStatCard from "@/components/admin/AdminStatCard";
import { Box } from "@mui/material";

export default function AdminDashboard() {
    return (
        <>
            <AdminHeader />
            <Box sx={{ 
                p: 4, 
                backgroundColor: '#f5f5f7',
                minHeight: 'calc(100vh - 64px)'
            }}>
                <Box sx={{ 
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 3,
                    maxWidth: 1400
                }}>
                    {/* Miners Card */}
                    <AdminStatCard
                        title="Miners"
                        stats={[
                            { label: "Active", value: 5, color: "#2196F3" },
                            { label: "Inactive", value: 5, color: "#B0BEC5" }
                        ]}
                    />
                    
                    {/* Spaces Card */}
                    <AdminStatCard
                        title="Spaces"
                        stats={[
                            { label: "Free", value: 0, color: "#9C27B0" },
                            { label: "Used", value: 10, color: "#673AB7" }
                        ]}
                    />
                    
                    {/* Customers Card */}
                    <AdminStatCard
                        title="Customers"
                        stats={[
                            { label: "Active", value: 3, color: "#EC407A" },
                            { label: "Inactive", value: 0, color: "#B0BEC5" }
                        ]}
                    />
                    
                    {/* Power Card */}
                    <AdminStatCard
                        title="Power"
                        stats={[
                            { label: "Free kW", value: 0, color: "#00C853" },
                            { label: "Used kW", value: 0, color: "#00B0FF" }
                        ]}
                    />
                </Box>
            </Box>
        </>
    );
}
