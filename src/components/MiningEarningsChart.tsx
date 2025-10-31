// src/components/MiningEarningsChart.tsx
"use client";

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { Paper, Typography, Box, useTheme } from '@mui/material';

// Sample mining data
const miningData = [
  { date: '2024-10-01', earnings: 12.50, costs: 8.20, hashRate: 45.2 },
  { date: '2024-10-02', earnings: 14.30, costs: 8.20, hashRate: 47.1 },
  { date: '2024-10-03', earnings: 11.80, costs: 8.20, hashRate: 43.5 },
  { date: '2024-10-04', earnings: 15.60, costs: 8.20, hashRate: 48.9 },
  { date: '2024-10-05', earnings: 13.20, costs: 8.20, hashRate: 46.3 },
  { date: '2024-10-06', earnings: 16.80, costs: 8.20, hashRate: 51.2 },
  { date: '2024-10-07', earnings: 12.90, costs: 8.20, hashRate: 44.8 }
];

console.log('Mining data loaded:', miningData);

interface MiningEarningsChartProps {
  title?: string;
  height?: number;
}

export default function MiningEarningsChart({ 
  title = "Mining Performance", 
  height = 300 
}: MiningEarningsChartProps) {
  const theme = useTheme();
  
  // Debug: Check if data exists
  console.log('Chart rendering with data:', miningData);
  console.log('Chart height:', height);
  
  return (
    <Paper 
      sx={{ 
        p: 3, 
        width: '100%',
        minHeight: height + 80,
        display: 'flex',
        flexDirection: 'column',
        background: theme.palette.mode === 'dark' 
          ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
          : 'linear-gradient(135deg, rgba(0,198,255,0.02) 0%, rgba(0,114,255,0.02) 100%)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,198,255,0.1)'}`,
      }}
    >
      <Typography 
        variant="h6" 
        gutterBottom
        sx={{ 
          background: 'linear-gradient(135deg, #00C6FF 0%, #0072FF 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 600,
          mb: 2
        }}
      >
        {title}
      </Typography>
      
      <Box sx={{ flex: 1, width: '100%', height: height }}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart 
            data={miningData} 
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke={theme.palette.mode === 'dark' ? '#333' : '#f0f0f0'} 
          />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
            tickFormatter={(value) => {
              try {
                return new Date(value).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                });
              } catch (e) {
                return value;
              }
            }}
            height={60}
          />
          <YAxis 
            tick={{ fontSize: 12, fill: theme.palette.text.secondary }}
            domain={[0, 'dataMax + 2']}
            label={{ 
              value: 'Amount ($)',
              angle: -90, 
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: theme.palette.text.secondary }
            }}
          />
          <Tooltip 
            formatter={(value: any, name: string) => [
              `$${Number(value).toFixed(2)}`,
              name === 'earnings' ? 'Earnings' : 'Costs'
            ]}
            labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: '8px',
              boxShadow: theme.shadows[4]
            }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="earnings" 
            stroke="#00C6FF" 
            strokeWidth={3}
            name="Earnings"
            dot={{ fill: '#00C6FF', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: '#00C6FF', strokeWidth: 2 }}
          />
          <Line 
            type="monotone" 
            dataKey="costs" 
            stroke="#FF6B6B" 
            strokeWidth={2}
            name="Costs"
            dot={{ fill: '#FF6B6B', strokeWidth: 2, r: 3 }}
            strokeDasharray="5 5"
          />
          </LineChart>
        </ResponsiveContainer>
      </Box>    
    </Paper>
  );
}