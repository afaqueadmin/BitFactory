// "use client";

// import {
//     Drawer,
//     List,
//     ListItem,
//     ListItemIcon,
//     ListItemText,
//     IconButton,
//     Box,
//     ListItemButton,
// } from "@mui/material";
// import DashboardIcon from "@mui/icons-material/Dashboard";
// import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
// import StorageIcon from "@mui/icons-material/Storage";
// import SettingsIcon from "@mui/icons-material/Settings";
// import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
// import ChevronRightIcon from "@mui/icons-material/ChevronRight";
// import Link from "next/link";

// interface SidebarProps {
//     collapsed: boolean;
//     onToggleCollapse: () => void;
// }

// export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
//     return (
//         <Drawer
//             variant="permanent"
//             sx={{
//                 width: collapsed ? 72 : 240,
//                 flexShrink: 0,
//                 "& .MuiDrawer-paper": {
//                     width: collapsed ? 72 : 240,
//                     boxSizing: "border-box",
//                     transition: "width 0.3s ease",
//                 },
//             }}
//         >
//             {/* Collapse Button */}
//             <Box display="flex" justifyContent="flex-end" p={1}>
//                 <IconButton onClick={onToggleCollapse}>
//                     {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
//                 </IconButton>
//             </Box>

//             {/* Menu Items */}
//             <List>
//                 <ListItem disablePadding>
//                     <ListItemButton component={Link} href="/dashboard">
//                         <ListItemIcon>
//                             <DashboardIcon />
//                         </ListItemIcon>
//                         {!collapsed && <ListItemText primary="Dashboard" />}
//                     </ListItemButton>
//                 </ListItem>

//                 <ListItem disablePadding>
//                     <ListItemButton component={Link} href="/miners">
//                         <ListItemIcon>
//                             <StorageIcon />
//                         </ListItemIcon>
//                         {!collapsed && <ListItemText primary="My Miners" />}
//                     </ListItemButton>
//                 </ListItem>

//                 <ListItem disablePadding>
//                     <ListItemButton component={Link} href="/wallet">
//                         <ListItemIcon>
//                             <AccountBalanceWalletIcon />
//                         </ListItemIcon>
//                         {!collapsed && <ListItemText primary="My Wallet" />}
//                     </ListItemButton>
//                 </ListItem>

//                 <ListItem disablePadding>
//                     <ListItemButton component={Link} href="/settings">
//                         <ListItemIcon>
//                             <SettingsIcon />
//                         </ListItemIcon>
//                         {!collapsed && <ListItemText primary="Settings" />}
//                     </ListItemButton>
//                 </ListItem>
//             </List>
//         </Drawer>
//     );
// }
