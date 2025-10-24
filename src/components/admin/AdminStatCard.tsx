"use client";

import React from "react";
import {
    Card,
    CardContent,
    Typography,
    Box,
    useTheme,
} from "@mui/material";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface StatItem {
    label: string;
    value: number;
    color: string;
}

interface AdminStatCardProps {
    title: string;
    stats: StatItem[];
    total?: number;
}

export default function AdminStatCard({ 
    title, 
    stats,
    total 
}: AdminStatCardProps) {
    const theme = useTheme();
    
    // Calculate total if not provided
    const totalValue = total ?? stats.reduce((sum, stat) => sum + stat.value, 0);
    
    // Prepare data for the pie chart
    const chartData = stats.map(stat => ({
        name: stat.label,
        value: stat.value,
        color: stat.color
    }));

    return (
        <Card 
            sx={{ 
                borderRadius: 3,
                boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
                border: 'none',
                height: '100%',
                minHeight: 200,
                backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
                transition: 'box-shadow 0.3s ease',
                '&:hover': {
                    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.12)',
                }
            }}
        >
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {/* Left Side - Title and Stats */}
                    <Box>
                        <Typography 
                            variant="h5" 
                            component="h2" 
                            sx={{ 
                                fontWeight: 500,
                                mb: 3,
                                color: theme.palette.text.primary,
                                fontSize: '1.5rem'
                            }}
                        >
                            {title}
                        </Typography>
                        
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {stats.map((stat, index) => (
                                <Box 
                                    key={index} 
                                    sx={{ 
                                        display: 'flex', 
                                        alignItems: 'center',
                                        gap: 1.5
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: 14,
                                            height: 14,
                                            borderRadius: '50%',
                                            backgroundColor: stat.color,
                                            flexShrink: 0
                                        }}
                                    />
                                    <Typography 
                                        variant="body1" 
                                        sx={{ 
                                            color: theme.palette.text.primary,
                                            fontSize: '1rem',
                                            fontWeight: 400
                                        }}
                                    >
                                        {stat.label} {stat.value}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Box>

                    {/* Right Side - Circular Chart */}
                    <Box sx={{ width: 140, height: 140, position: 'relative' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={60}
                                    paddingAngle={0}
                                    dataKey="value"
                                    startAngle={90}
                                    endAngle={-270}
                                    stroke="none"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        
                        {/* Center Number */}
                        <Box
                            sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}
                        >
                            <Typography 
                                variant="h3" 
                                sx={{ 
                                    fontWeight: 500,
                                    color: theme.palette.text.primary,
                                    fontSize: '2.5rem'
                                }}
                            >
                                {totalValue}
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
}
