// "use client";

// import React, { useState, useEffect } from 'react';
// import {
//     Drawer,
//     List,
//     ListItem,
//     ListItemIcon,
//     ListItemText,
//     Box,
//     IconButton,
//     ListItemButton,
//     useTheme,
//     useMediaQuery,
// } from '@mui/material';
// import MenuIcon from '@mui/icons-material/Menu';
// import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
// import ChevronRightIcon from '@mui/icons-material/ChevronRight';
// import {
//     Dashboard as DashboardIcon,
//     Group as CustomersIcon,
//     Memory as MinersIcon,
//     Storage as SpacesIcon,
//     Power as PowerIcon,
// } from '@mui/icons-material';
// import Link from 'next/link';
// import { usePathname } from 'next/navigation';

// const DRAWER_WIDTH = 240;
// const COLLAPSED_WIDTH = 72;

// const adminRoutes = [
//     { path: '/adminpanel', label: 'Dashboard', icon: <DashboardIcon /> },
//     { path: '/adminpanel/miners', label: 'Miners', icon: <MinersIcon /> },
//     { path: '/adminpanel/spaces', label: 'Spaces', icon: <SpacesIcon /> },
//     { path: '/adminpanel/customers', label: 'Customers', icon: <CustomersIcon /> },
//     { path: '/adminpanel/power', label: 'Power', icon: <PowerIcon /> },
// ];

// export default function AdminSidebar() {
//     const theme = useTheme();
//     // Avoid SSR mismatch for media queries by disabling SSR mode for this hook.
//     // This makes the value consistent during hydration and prevents the drawer
//     // from rendering in a different variant on server vs client.
//     const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
//     const pathname = usePathname();

//     // mobile open state (temporary drawer)
//     const [mobileOpen, setMobileOpen] = useState(false);
//     // collapse state for desktop
//     const [collapsed, setCollapsed] = useState(false);

//     // persist collapsed preference
//     useEffect(() => {
//         const saved = typeof window !== 'undefined' ? localStorage.getItem('adminSidebarCollapsed') : null;
//         if (saved !== null) {
//             setCollapsed(saved === 'true');
//         }
//     }, []);

//     useEffect(() => {
//         if (typeof window !== 'undefined') {
//             localStorage.setItem('adminSidebarCollapsed', collapsed.toString());
//         }
//     }, [collapsed]);

//     const toggleMobile = () => setMobileOpen((s) => !s);
//     const handleCloseMobile = () => setMobileOpen(false);
//     const toggleCollapse = () => setCollapsed((s) => !s);

//     const drawerWidth = isDesktop ? (collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH) : DRAWER_WIDTH;

//     // publish current drawer width to a CSS variable so layouts can read it
//     useEffect(() => {
//         if (typeof document !== 'undefined') {
//             document.documentElement.style.setProperty('--admin-drawer-width', `${drawerWidth}px`);
//         }
//     }, [drawerWidth]);

//     return null;
// }
