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
  Storage as MinersIcon,
  Timeline as OverviewIcon,
  AttachMoney as RevenueIcon,
  Construction as SelfMiningIcon,
  PriceCheck as HostingPricesIcon,
  Assignment as AccountingIcon,
  Description as DocumentIcon,
  RequestQuote as AdjustmentsIcon,
  Settings as SettingsIcon,
  History as ActivityLogIcon,
  ChevronLeft,
  ChevronRight,
  Lock as LockIcon,
  People as FranchiseesIcon,
} from "@mui/icons-material";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/hooks";

interface SidebarItem {
  title: string;
  icon: React.ReactNode;
  path?: string;
  items?: SidebarItem[];
  // Roles allowed to see this item. Defaults to ADMIN/SUPER_ADMIN (today's
  // behavior) when omitted, so existing items don't need to be touched.
  // FRANCHISEE no longer renders this sidebar at all — they get their own
  // dedicated FranchiseSidebar under the (franchise) route group.
  roles?: Array<"ADMIN" | "SUPER_ADMIN">;
  openInNewTab?: boolean;
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
    title: "Activity Log",
    icon: <ActivityLogIcon />,
    path: "/activity-log",
  },
  {
    title: "Franchisees",
    icon: <FranchiseesIcon />,
    path: "/franchisees",
  },
  {
    title: "Customers",
    icon: <CustomersIcon />,
    path: "/customers/overview",
    // items: [
    //   {
    //     title: "Overview",
    //     icon: <OverviewIcon />,
    //     path: "/customers/overview",
    //   },
    //   {
    //     title: "Own Revenue",
    //     icon: <RevenueIcon />,
    //     path: "/customers/revenue",
    //   },
    //   {
    //     title: "Own Transactions",
    //     icon: <TransactionsIcon />,
    //     path: "/customers/transactions",
    //   },
    // ],
  },
  {
    title: "Subaccounts",
    icon: <CustomersIcon />,
    path: "/subaccounts",
  },

  {
    title: "Customer Groups",
    icon: <CustomersIcon />,
    path: "/groups",
  },

  {
    title: "Pools",
    icon: <PoolsIcon />,
    path: "/pools",
  },

  {
    title: "All Miners",
    icon: <MinersIcon />,
    path: "/machine",
  },

  {
    title: "Luxor Workers",
    icon: <MinersIcon />,
    path: "/workers",
  },

  {
    title: "Braiins Workers",
    icon: <MinersIcon />,
    path: "/braiins-workers",
  },

  {
    title: "Locations",
    icon: <LocationsIcon />,
    path: "/space",
  },

  {
    title: "Hardware Models",
    icon: <HardwareIcon />,
    path: "/hardware",
  },

  {
    title: "Accounting",
    icon: <AccountingIcon />,
    items: [
      {
        title: "Hosting and Colocation",
        icon: <DashboardIcon />,
        path: "/accounting/Hosting-and-Colocation",
      },
      {
        title: "Farm Tariffs",
        icon: <DocumentIcon />,
        path: "/accounting/farm-tariffs",
      },
      {
        title: "Hardware Sales Dashboard",
        icon: <DashboardIcon />,
        path: "/accounting/hardware-sales",
      },
      {
        title: "Hardware Purchase Invoices",
        icon: <DocumentIcon />,
        path: "/accounting/hardware-purchases",
      },
      // {
      //   title: "Invoices",
      //   icon: <InvoicesIcon />,
      //   path: "/accounting/invoices",
      // },
      {
        title: "Recurring Invoices",
        icon: <RevenueIcon />,
        path: "/accounting/recurring",
      },
      {
        title: "Customer Statements",
        icon: <OverviewIcon />,
        path: "/accounting/statements",
      },
      {
        title: "Client Transaction History",
        icon: <DocumentIcon />,
        path: "/accounting/client-transaction-history",
      },
      {
        title: "Credit Adjustments",
        icon: <AdjustmentsIcon />,
        path: "/accounting/credit-adjustments",
      },
      {
        title: "Pricing",
        icon: <HostingPricesIcon />,
        path: "/accounting/pricing",
      },
      {
        title: "Invoice PDF Settings",
        icon: <DocumentIcon />,
        path: "/accounting/pdf-invoice-settings",
      },
      {
        title: "Email Reports",
        icon: <DocumentIcon />,
        path: "/accounting/email-report",
      },
    ],
  },
  {
    title: "Payback Analysis",
    icon: <OverviewIcon />,
    path: "/admin/payback-analysis",
  },
  {
    title: "Payback Analysis Settings",
    icon: <SettingsIcon />,
    path: "/admin/payback-analysis-settings",
  },
  {
    title: "Company Payback Analysis",
    icon: <SelfMiningIcon />,
    path: "/admin/payback-analysis-company",
  },
  {
    title: "Company Payback Settings",
    icon: <SettingsIcon />,
    path: "/admin/payback-analysis-company-settings",
  },
];

export default function AdminSidebar() {
  const [sideBarOpen, setSideBarOpen] = React.useState(true);
  const [isHovered, setIsHovered] = React.useState(false);
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = React.useState<string[]>([]);
  const { user } = useUser();

  const visibleSidebarItems = sidebarItems.filter((item) => {
    const allowedRoles = item.roles ?? ["ADMIN", "SUPER_ADMIN"];
    return user ? (allowedRoles as string[]).includes(user.role) : false;
  });

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
              target={item.openInNewTab ? "_blank" : undefined}
              rel={item.openInNewTab ? "noopener noreferrer" : undefined}
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
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    justifyContent: "space-between",
                  }}
                >
                  <ListItemText
                    primary={item.title}
                    primaryTypographyProps={{
                      fontSize: "0.875rem",
                      fontWeight: item.path === pathname ? 600 : 400,
                    }}
                  />
                  {item.items && (
                    <ChevronLeft
                      sx={{
                        fontSize: "1.25rem",
                        transition: (theme) =>
                          theme.transitions.create("transform", {
                            duration: theme.transitions.duration.shorter,
                            easing: theme.transitions.easing.easeInOut,
                          }),
                        transform: expandedItems.includes(item.title)
                          ? "rotate(90deg)"
                          : "rotate(-90deg)",
                      }}
                    />
                  )}
                </Box>
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
            display: "flex",
            gap: 0.5,
          }}
        >
          {sideBarOpen || isHovered ? <ChevronLeft /> : <ChevronRight />}
          {sideBarOpen && <LockIcon sx={{ fontSize: "0.75rem" }} />}
        </IconButton>
      </Box>
      <List sx={{ px: sideBarOpen || isHovered ? 2 : 1 }}>
        {renderSidebarItems(visibleSidebarItems)}
      </List>
    </Box>
  );
}
