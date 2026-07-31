"use client";

import React from "react";
import {
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  AccountCircle as AccountIcon,
  Group as CustomersIcon,
  Storage as MinersIcon,
  ChevronLeft,
  ChevronRight,
} from "@mui/icons-material";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface FranchiseSidebarItem {
  title: string;
  icon: React.ReactNode;
  path: string;
}

const sidebarItems: FranchiseSidebarItem[] = [
  { title: "Dashboard", icon: <DashboardIcon />, path: "/franchise/dashboard" },
  { title: "My Account", icon: <AccountIcon />, path: "/franchise/account" },
  { title: "Customers", icon: <CustomersIcon />, path: "/franchise/customers" },
  { title: "All Miners", icon: <MinersIcon />, path: "/franchise/miners" },
];

export default function FranchiseSidebar() {
  const [sideBarOpen, setSideBarOpen] = React.useState(true);
  const [isHovered, setIsHovered] = React.useState(false);
  const pathname = usePathname();
  const isExpanded = sideBarOpen || isHovered;

  const toggleCollapse = () => setSideBarOpen((prev) => !prev);
  const handleMouseEnter = () => {
    if (!sideBarOpen) setIsHovered(true);
  };
  const handleMouseLeave = () => setIsHovered(false);

  return (
    <Box
      component="nav"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        width: isExpanded ? 280 : 72,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        transition: (theme) =>
          theme.transitions.create(["width"], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.standard,
          }),
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          p: 1,
        }}
      >
        <IconButton onClick={toggleCollapse} size="small">
          {isExpanded ? <ChevronLeft /> : <ChevronRight />}
        </IconButton>
      </Box>
      <List sx={{ px: isExpanded ? 2 : 1 }}>
        {sidebarItems.map((item) => (
          <ListItem key={item.title} disablePadding>
            <Tooltip
              title={isExpanded ? "" : item.title}
              placement="right"
              arrow
            >
              <ListItemButton
                component={Link}
                href={item.path}
                selected={pathname === item.path}
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  color: "text.secondary",
                  minHeight: 44,
                  "&.Mui-selected": {
                    color: "primary.main",
                    bgcolor: "action.selected",
                    "& .MuiListItemIcon-root": { color: "primary.main" },
                  },
                  "&:hover": { bgcolor: "action.hover" },
                  justifyContent: isExpanded ? "flex-start" : "center",
                  px: isExpanded ? 1.5 : 2,
                  whiteSpace: "nowrap",
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: isExpanded ? 40 : 0,
                    color: "inherit",
                    justifyContent: "center",
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {isExpanded && (
                  <ListItemText
                    primary={item.title}
                    primaryTypographyProps={{
                      fontSize: "0.875rem",
                      fontWeight: pathname === item.path ? 600 : 400,
                    }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
