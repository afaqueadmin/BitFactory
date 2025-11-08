"use client";

import React from "react";
import {
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Collapse,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Dashboard as DashboardIcon,
  Group as CustomersIcon,
  Memory as HardwareIcon,
  CloudQueue as PoolsIcon,
  LocationOn as LocationsIcon,
  Inventory as InventoryIcon,
  Receipt as InvoicesIcon,
  Settings as CustomizeIcon,
  Download as DownloadsIcon,
  Storage as MinersIcon,
  Timeline as OverviewIcon,
  AttachMoney as RevenueIcon,
  Construction as SelfMiningIcon,
  ShoppingCart as ECommerceIcon,
  PriceCheck as HostingPricesIcon,
  Bolt as ConsumptionIcon,
  Payment as TransactionsIcon,
  ChevronLeft,
  ChevronRight,
} from "@mui/icons-material";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarItem {
  title: string;
  icon: React.ReactNode;
  path?: string;
  items?: SidebarItem[];
}

const sidebarItems: SidebarItem[] = [
  {
    title: "Dashboard",
    icon: <DashboardIcon />,
    path: "/dashboard",
    // items: [
    //   { title: "Dashboard", icon: <DashboardIcon />, path: "/dashboard" },
    // ],
  },
  {
    title: "Customers",
    icon: <CustomersIcon />,
    items: [
      {
        title: "Overview",
        icon: <OverviewIcon />,
        path: "/customers/overview",
      },
      {
        title: "Own Revenue",
        icon: <RevenueIcon />,
        path: "/customers/revenue",
      },
      {
        title: "Own Transactions",
        icon: <TransactionsIcon />,
        path: "/customers/transactions",
      },
    ],
  },
  {
    title: "Hardware",
    icon: <HardwareIcon />,
    items: [
      {
        title: "Self Mining",
        icon: <SelfMiningIcon />,
        path: "/hardware/self-mining",
      },
      { title: "Own Miners", icon: <MinersIcon />, path: "/hardware/miners" },
    ],
  },
  {
    title: "E-Commerce",
    icon: <ECommerceIcon />,
    items: [
      {
        title: "Hosting Prices",
        icon: <HostingPricesIcon />,
        path: "/ecommerce/hosting-prices",
      },
      {
        title: "Total Consumptions",
        icon: <ConsumptionIcon />,
        path: "/ecommerce/consumptions",
      },
    ],
  },
  {
    title: "Downloads",
    icon: <DownloadsIcon />,
    path: "/downloads",
  },
  {
    title: "Locations",
    icon: <LocationsIcon />,
    path: "/locations",
  },
  {
    title: "Pools",
    icon: <PoolsIcon />,
    path: "/pools",
  },
  {
    title: "Customers",
    icon: <CustomersIcon />,
    path: "/customers",
  },
  {
    title: "All Miners",
    icon: <MinersIcon />,
    path: "/miners",
  },
  {
    title: "Inventory",
    icon: <InventoryIcon />,
    path: "/inventory",
  },
  {
    title: "Invoices",
    icon: <InvoicesIcon />,
    path: "/invoices",
  },
  {
    title: "Customize",
    icon: <CustomizeIcon />,
    path: "/customize",
  },
];

export default function AdminSidebar() {
  const [sideBarOpen, setSideBarOpen] = React.useState(true);
  const [isHovered, setIsHovered] = React.useState(false);
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = React.useState<string[]>([]);

  const handleExpandClick = (title: string) => {
    if (!sideBarOpen && !isHovered) return;
    setExpandedItems((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title],
    );
  };

  const toggleCollapse = () => {
    setSideBarOpen((prev) => !prev);
    // Close all expanded items when collapsing
    if (sideBarOpen) {
      setExpandedItems([]);
    }
  };

  const handleMouseEnter = () => {
    if (!sideBarOpen) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (!sideBarOpen) {
      setExpandedItems([]);
    }
  };

  const renderSidebarItems = (items: SidebarItem[]) => {
    const isExpanded = sideBarOpen || isHovered;
    return items.map((item) => (
      <React.Fragment key={item.title}>
        <ListItem disablePadding>
          <Tooltip title={isExpanded ? "" : item.title} placement="right" arrow>
            <ListItemButton
              component={item.path ? Link : "div"}
              href={item.path || "#"}
              onClick={() => item.items && handleExpandClick(item.title)}
              selected={item.path === pathname}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                color: "text.secondary",
                minHeight: 44,
                "&.Mui-selected": {
                  color: "primary.main",
                  bgcolor: "action.selected",
                  "& .MuiListItemIcon-root": {
                    color: "primary.main",
                  },
                },
                "&:hover": {
                  bgcolor: "action.hover",
                },
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
                    fontWeight: item.path === pathname ? 600 : 400,
                  }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        </ListItem>
        {isExpanded && item.items && (
          <Collapse
            in={expandedItems.includes(item.title)}
            timeout="auto"
            unmountOnExit
          >
            <List component="div" disablePadding>
              {item.items.map((subItem) => (
                <Tooltip
                  key={subItem.title}
                  title={isExpanded ? "" : subItem.title}
                  placement="right"
                  arrow
                >
                  <ListItemButton
                    component={Link}
                    href={subItem.path || "#"}
                    selected={subItem.path === pathname}
                    sx={{
                      pl: 4,
                      py: 1,
                      borderRadius: 1,
                      mb: 0.5,
                      color: "text.secondary",
                      minHeight: 40,
                      "&.Mui-selected": {
                        color: "primary.main",
                        bgcolor: "action.selected",
                        "& .MuiListItemIcon-root": {
                          color: "primary.main",
                        },
                      },
                      "&:hover": {
                        bgcolor: "action.hover",
                      },
                      justifyContent: isExpanded ? "flex-start" : "center",
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
                      {subItem.icon}
                    </ListItemIcon>
                    {isExpanded && (
                      <ListItemText
                        primary={subItem.title}
                        primaryTypographyProps={{
                          fontSize: "0.875rem",
                          fontWeight: subItem.path === pathname ? 600 : 400,
                        }}
                      />
                    )}
                  </ListItemButton>
                </Tooltip>
              ))}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    ));
  };

  return (
    <Box
      component="nav"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        width: sideBarOpen || isHovered ? 280 : 72,
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
        "&:hover": {
          overflowY: "auto",
        },
        "&::-webkit-scrollbar": {
          width: "4px",
        },
        "&::-webkit-scrollbar-track": {
          background: "transparent",
        },
        "&::-webkit-scrollbar-thumb": {
          background: "rgba(0,0,0,0.2)",
          borderRadius: "2px",
        },
        "&:hover::-webkit-scrollbar-thumb": {
          background: "rgba(0,0,0,0.3)",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 3,
          position: "relative",
        }}
      >
        <IconButton
          onClick={toggleCollapse}
          sx={{
            backgroundColor: "transparent", // Ensures no background color
            "&:hover": {
              backgroundColor: "transparent", // Removes hover background effect
            },
            mt: 13,
            position: "absolute",
            right: 0,
            zIndex: 1,
          }}
        >
          {sideBarOpen || isHovered ? <ChevronLeft /> : <ChevronRight />}
        </IconButton>
      </Box>
      <List sx={{ px: sideBarOpen || isHovered ? 2 : 1 }}>
        {renderSidebarItems(sidebarItems)}
      </List>
    </Box>
  );
}
