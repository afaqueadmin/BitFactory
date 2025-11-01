// "use client";

// import { Drawer, List, ListItem, ListItemIcon, ListItemText, IconButton } from "@mui/material";
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
//             <div className="flex justify-end p-2">
//                 <IconButton onClick={onToggleCollapse}>
//                     {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
//                 </IconButton>
//             </div>

//             {/* Menu Items */}
//             <List>
//                 <ListItem button component={Link} href="/dashboard">
//                     <ListItemIcon><DashboardIcon /></ListItemIcon>
//                     {!collapsed && <ListItemText primary="Dashboard" />}
//                 </ListItem>

//                 <ListItem button component={Link} href="/miners">
//                     <ListItemIcon><StorageIcon /></ListItemIcon>
//                     {!collapsed && <ListItemText primary="My Miners" />}
//                 </ListItem>

//                 <ListItem button component={Link} href="/wallet">
//                     <ListItemIcon><AccountBalanceWalletIcon /></ListItemIcon>
//                     {!collapsed && <ListItemText primary="My Wallet" />}
//                 </ListItem>

//                 <ListItem button component={Link} href="/settings">
//                     <ListItemIcon><SettingsIcon /></ListItemIcon>
//                     {!collapsed && <ListItemText primary="Settings" />}
//                 </ListItem>
//             </List>
//         </Drawer>
//     );
// }
