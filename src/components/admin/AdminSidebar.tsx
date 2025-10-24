"use client";

import React from 'react';
import {
    Drawer,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Box,
    styled,
} from '@mui/material';
import {
    Dashboard as DashboardIcon,
    Group as CustomersIcon,
    Memory as MinersIcon,
    Storage as SpacesIcon,
    Power as PowerIcon,
} from '@mui/icons-material';
import { usePathname, useRouter } from 'next/navigation';

const DRAWER_WIDTH = 240;

const StyledDrawer = styled(Drawer)(() => ({
    width: DRAWER_WIDTH,
    flexShrink: 0,
    '& .MuiDrawer-paper': {
        width: DRAWER_WIDTH,
        boxSizing: 'border-box',
    },
}));

const adminRoutes = [
    { path: '/adminpanel', label: 'Dashboard', icon: <DashboardIcon /> },
    { path: '/adminpanel/miners', label: 'Miners', icon: <MinersIcon /> },
    { path: '/adminpanel/spaces', label: 'Spaces', icon: <SpacesIcon /> },
    { path: '/adminpanel/customers', label: 'Customers', icon: <CustomersIcon /> },
    { path: '/adminpanel/power', label: 'Power', icon: <PowerIcon /> },
];

export default function AdminSidebar() {
    const router = useRouter();
    const pathname = usePathname();

    return (
        <StyledDrawer
            variant="permanent"
            anchor="left"
        >
            <Box sx={{ overflow: 'auto', mt: 8 }}>
                <List>
                    {adminRoutes.map((route) => (
                        <ListItem
                            button
                            key={route.path}
                            onClick={() => router.push(route.path)}
                            sx={{
                                backgroundColor: pathname === route.path ? 'action.selected' : 'transparent',
                                '&:hover': {
                                    backgroundColor: 'action.hover',
                                },
                            }}
                        >
                            <ListItemIcon sx={{ color: pathname === route.path ? 'primary.main' : 'inherit' }}>
                                {route.icon}
                            </ListItemIcon>
                            <ListItemText 
                                primary={route.label}
                                sx={{ 
                                    color: pathname === route.path ? 'primary.main' : 'inherit'
                                }}
                            />
                        </ListItem>
                    ))}
                </List>
            </Box>
        </StyledDrawer>
    );
}