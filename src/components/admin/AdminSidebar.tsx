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
  Divider,
  IconButton,
  Tooltip,
  Badge,
  Drawer,
  Typography,
} from "@mui/material";
import {
  SpaceDashboard as DashboardIcon,
  SupportAgent as SupportIcon,
  TrendingDown as HashrateAlertsIcon,
  AccountBalanceWallet as WalletRequestsIcon,
  EventRepeat as PaymentFrequencyRequestsIcon,
  SystemUpdateAlt as FirmwareRequestsIcon,
  ContactMail as SecondaryLoginRequestsIcon,
  Group as CustomersIcon,
  Workspaces as CustomerGroupsIcon,
  AccountTree as SubaccountsIcon,
  Storefront as FranchiseesIcon,
  Science as SimulatedAccountsIcon,
  Dns as MinersIcon,
  Hub as PoolWorkersIcon,
  Lan as LuxorWorkersIcon,
  DeviceHub as BraiinsWorkersIcon,
  CloudQueue as PoolsIcon,
  LocationOn as LocationsIcon,
  Memory as HardwareIcon,
  ReceiptLong as InvoicingIcon,
  Warehouse as HostingIcon,
  Sell as HardwareSalesIcon,
  Build as HardwareRepairIcon,
  Autorenew as RecurringIcon,
  Payments as PayablesIcon,
  Bolt as FarmTariffsIcon,
  ShoppingCart as HardwarePurchasesIcon,
  Tune as AdjustmentsIcon,
  StickyNote2 as MemoIcon,
  RequestQuote as CreditAdjustmentsIcon,
  Summarize as StatementsIcon,
  CompareArrows as TransactionHistoryIcon,
  MonetizationOn as IncentivesIcon,
  ForwardToInbox as EmailReportsIcon,
  SettingsApplications as FinanceSettingsIcon,
  PriceCheck as PricingIcon,
  PictureAsPdf as PdfSettingsIcon,
  AccountBalance as PaymentAccountsIcon,
  Timeline as CustomerPaybackIcon,
  Factory as CompanyPaybackIcon,
  History as ActivityLogIcon,
  FactCheck as AuditLogIcon,
  Dataset as DbDataIcon,
  ListAlt as SubaccountRecordsIcon,
  ShowChart as DailySnapshotsIcon,
  Engineering as WorkerMetricsIcon,
  SwapHoriz as PoolTransactionsIcon,
  Settings as SettingsIcon,
  PersonOutline as CustomerPaybackSettingsIcon,
  Domain as CompanyPaybackSettingsIcon,
  ChevronLeft,
  ChevronRight,
  ExpandMore,
  Lock as LockIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useUser,
  useTickets,
  useWalletChangeRequests,
  usePaymentFrequencyChangeRequests,
  useFirmwareChangeRequests,
  useSecondaryLoginRequests,
  useHashrateAlerts,
} from "@/lib/hooks";
import { useSimulationRequestCount } from "@/lib/hooks/useSimulationRequestCount";
import { useAdminNav } from "@/lib/contexts/admin-nav-context";

type BadgeKey =
  | "tickets"
  | "wallet"
  | "frequency"
  | "firmware"
  | "logins"
  | "alerts"
  | "simulation";

interface SidebarItem {
  title: string;
  icon: React.ReactNode;
  path?: string;
  // Extra pages that belong to this item but don't live under its path,
  // e.g. hosting invoice detail pages at /accounting/[id].
  activeMatch?: RegExp[];
  items?: SidebarItem[];
  // Roles allowed to see this item. Defaults to ADMIN/SUPER_ADMIN (today's
  // behavior) when omitted, so existing items don't need to be touched.
  // FRANCHISEE no longer renders this sidebar at all — they get their own
  // dedicated FranchiseSidebar under the (franchise) route group.
  roles?: Array<"ADMIN" | "SUPER_ADMIN">;
  openInNewTab?: boolean;
  badgeKey?: BadgeKey;
}

interface SidebarSection {
  heading?: string;
  items: SidebarItem[];
}

const sidebarSections: SidebarSection[] = [
  {
    items: [
      { title: "Dashboard", icon: <DashboardIcon />, path: "/adminpanel" },
    ],
  },
  {
    heading: "Work Queue",
    items: [
      {
        title: "Support Tickets",
        icon: <SupportIcon />,
        path: "/tickets",
        badgeKey: "tickets",
      },
      {
        title: "Hashrate Alerts",
        icon: <HashrateAlertsIcon />,
        path: "/hashrate-alerts",
        badgeKey: "alerts",
      },
      {
        title: "Wallet Requests",
        icon: <WalletRequestsIcon />,
        path: "/wallet-requests",
        badgeKey: "wallet",
      },
      {
        title: "Payment Frequency Requests",
        icon: <PaymentFrequencyRequestsIcon />,
        path: "/payment-frequency-requests",
        badgeKey: "frequency",
      },
      {
        title: "Firmware Change Requests",
        icon: <FirmwareRequestsIcon />,
        path: "/firmware-change-requests",
        badgeKey: "firmware",
      },
      {
        title: "Sign-in Email Requests",
        icon: <SecondaryLoginRequestsIcon />,
        path: "/secondary-login-requests",
        badgeKey: "logins",
      },
    ],
  },
  {
    heading: "Customers",
    items: [
      {
        title: "Customers",
        icon: <CustomersIcon />,
        path: "/customers/overview",
        activeMatch: [/^\/customers\//],
      },
      {
        title: "Customer Groups",
        icon: <CustomerGroupsIcon />,
        path: "/groups",
      },
      { title: "Subaccounts", icon: <SubaccountsIcon />, path: "/subaccounts" },
      { title: "Franchisees", icon: <FranchiseesIcon />, path: "/franchisees" },
      {
        title: "Simulated Accounts",
        icon: <SimulatedAccountsIcon />,
        path: "/simulated-accounts",
        badgeKey: "simulation",
      },
    ],
  },
  {
    heading: "Operations",
    items: [
      { title: "Miners", icon: <MinersIcon />, path: "/machine" },
      {
        title: "Pool Workers",
        icon: <PoolWorkersIcon />,
        items: [
          {
            title: "Luxor Workers",
            icon: <LuxorWorkersIcon />,
            path: "/workers",
          },
          {
            title: "Braiins Workers",
            icon: <BraiinsWorkersIcon />,
            path: "/braiins-workers",
          },
        ],
      },
      { title: "Pools", icon: <PoolsIcon />, path: "/pools" },
      { title: "Locations", icon: <LocationsIcon />, path: "/space" },
      { title: "Hardware Models", icon: <HardwareIcon />, path: "/hardware" },
    ],
  },
  {
    heading: "Finance",
    items: [
      {
        title: "Invoicing",
        icon: <InvoicingIcon />,
        items: [
          {
            title: "Hosting and Colocation",
            icon: <HostingIcon />,
            path: "/accounting/Hosting-and-Colocation",
            // Hosting invoices live at /accounting/[id] (+ /edit,
            // /record-payment), created from /accounting/create or
            // /accounting/bulk-invoices. More specific /accounting/* items
            // win because their path match scores higher.
            activeMatch: [/^\/accounting\/[^/]+(\/(edit|record-payment))?$/],
          },
          {
            title: "Hardware Sales",
            icon: <HardwareSalesIcon />,
            path: "/accounting/hardware-sales",
          },
          {
            title: "Hardware Repair",
            icon: <HardwareRepairIcon />,
            path: "/accounting/hardware-repair",
          },
          {
            title: "Recurring Invoices",
            icon: <RecurringIcon />,
            path: "/accounting/recurring",
          },
        ],
      },
      {
        title: "Payables",
        icon: <PayablesIcon />,
        items: [
          {
            title: "Farm Tariffs",
            icon: <FarmTariffsIcon />,
            path: "/accounting/farm-tariffs",
            activeMatch: [
              /^\/accounting\/vendorInvoice\//,
              /^\/accounting\/vendor-invoices\//,
            ],
          },
          {
            title: "Hardware Purchases",
            icon: <HardwarePurchasesIcon />,
            path: "/accounting/hardware-purchases",
            activeMatch: [/^\/accounting\/hardwarePurchase\//],
          },
        ],
      },
      {
        title: "Adjustments",
        icon: <AdjustmentsIcon />,
        items: [
          { title: "Memos", icon: <MemoIcon />, path: "/accounting/memos" },
          {
            title: "Credit Adjustments",
            icon: <CreditAdjustmentsIcon />,
            path: "/accounting/credit-adjustments",
          },
        ],
      },
      {
        title: "Customer Statements",
        icon: <StatementsIcon />,
        path: "/accounting/statements",
      },
      {
        title: "Transaction History",
        icon: <TransactionHistoryIcon />,
        path: "/accounting/client-transaction-history",
      },
      {
        title: "Incentive Payouts",
        icon: <IncentivesIcon />,
        path: "/incentives/payouts",
      },
      {
        title: "Email Reports",
        icon: <EmailReportsIcon />,
        path: "/accounting/email-report",
      },
      {
        title: "Finance Settings",
        icon: <FinanceSettingsIcon />,
        items: [
          {
            title: "Pricing",
            icon: <PricingIcon />,
            path: "/accounting/pricing",
          },
          {
            title: "Invoice PDF Settings",
            icon: <PdfSettingsIcon />,
            path: "/accounting/pdf-invoice-settings",
          },
          {
            title: "Entities, Banks & Currencies",
            icon: <PaymentAccountsIcon />,
            path: "/accounting/payment-accounts",
          },
        ],
      },
    ],
  },
  {
    heading: "Analytics",
    items: [
      {
        title: "Customer Payback",
        icon: <CustomerPaybackIcon />,
        path: "/admin/payback-analysis",
      },
      {
        title: "Company Payback",
        icon: <CompanyPaybackIcon />,
        path: "/admin/payback-analysis-company",
      },
    ],
  },
  {
    heading: "System",
    items: [
      {
        title: "Activity Log",
        icon: <ActivityLogIcon />,
        path: "/activity-log",
      },
      { title: "Audit Log", icon: <AuditLogIcon />, path: "/audit-log" },
      {
        title: "DB Data Management",
        icon: <DbDataIcon />,
        items: [
          {
            title: "Subaccount Records",
            icon: <SubaccountRecordsIcon />,
            path: "/db-data-management/pool-subaccounts",
          },
          {
            title: "Daily Snapshots",
            icon: <DailySnapshotsIcon />,
            path: "/db-data-management/pool-daily-snapshots",
          },
          {
            title: "Worker Metrics",
            icon: <WorkerMetricsIcon />,
            path: "/db-data-management/pool-worker-metrics",
          },
          {
            title: "Pool Transactions",
            icon: <PoolTransactionsIcon />,
            path: "/db-data-management/pool-transactions",
          },
        ],
      },
      {
        title: "Payback Settings",
        icon: <SettingsIcon />,
        items: [
          {
            title: "Customer Payback",
            icon: <CustomerPaybackSettingsIcon />,
            path: "/admin/payback-analysis-settings",
          },
          {
            title: "Company Payback",
            icon: <CompanyPaybackSettingsIcon />,
            path: "/admin/payback-analysis-company-settings",
          },
        ],
      },
    ],
  },
];

const EXPANDED_WIDTH = 280;
const COLLAPSED_WIDTH = 72;

// How well `item` matches the current page: the length of its path for an
// exact/prefix match (so the most specific item wins), 0 for an activeMatch
// pattern, -1 for no match.
function matchScore(item: SidebarItem, pathname: string): number {
  if (!item.path) return -1;
  if (pathname === item.path || pathname.startsWith(`${item.path}/`)) {
    return item.path.length;
  }
  if (item.activeMatch?.some((pattern) => pattern.test(pathname))) return 0;
  return -1;
}

// The path of the best-matching leaf item, plus the titles of the groups
// that contain it (outermost first) so they can be auto-expanded.
function findActive(
  sections: SidebarSection[],
  pathname: string,
): { path: string | null; groups: string[] } {
  let best = { path: null as string | null, groups: [] as string[], score: -1 };
  const visit = (items: SidebarItem[], groups: string[]) => {
    for (const item of items) {
      if (item.items) {
        visit(item.items, [...groups, item.title]);
        continue;
      }
      const score = matchScore(item, pathname);
      if (score > best.score) best = { path: item.path!, groups, score };
    }
  };
  for (const section of sections) visit(section.items, []);
  return { path: best.path, groups: best.groups };
}

export default function AdminSidebar() {
  const [sideBarOpen, setSideBarOpen] = React.useState(true);
  const [isHovered, setIsHovered] = React.useState(false);
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = React.useState<string[]>([]);
  const { user } = useUser();
  const { mobileOpen, setMobileOpen } = useAdminNav();
  const { tickets: openTickets } = useTickets({ status: "OPEN" });
  const { requests: pendingWalletRequests } = useWalletChangeRequests({
    status: "PENDING",
  });
  const { requests: pendingFrequencyRequests } =
    usePaymentFrequencyChangeRequests({ status: "PENDING" });
  const { requests: pendingFirmwareRequests } = useFirmwareChangeRequests({
    status: "PENDING",
  });
  const { requests: pendingLoginRequests } = useSecondaryLoginRequests({
    status: "PENDING",
  });
  const { alerts: pendingHashrateAlerts } = useHashrateAlerts({
    acknowledged: false,
  });
  const pendingSimulationRequests = useSimulationRequestCount();

  const badgeCounts: Record<BadgeKey, number> = {
    tickets: openTickets.length,
    wallet: pendingWalletRequests.length,
    frequency: pendingFrequencyRequests.length,
    firmware: pendingFirmwareRequests.length,
    logins: pendingLoginRequests.length,
    alerts: pendingHashrateAlerts.length,
    simulation: pendingSimulationRequests,
  };

  // A group shows the total of its children so counts aren't hidden when
  // it's collapsed.
  const getBadgeCount = (item: SidebarItem): number =>
    item.items
      ? item.items.reduce((sum, child) => sum + getBadgeCount(child), 0)
      : item.badgeKey
        ? badgeCounts[item.badgeKey]
        : 0;

  const visibleSections = React.useMemo(() => {
    const isAllowed = (item: SidebarItem) => {
      const allowedRoles = item.roles ?? ["ADMIN", "SUPER_ADMIN"];
      return user ? (allowedRoles as string[]).includes(user.role) : false;
    };
    const filterItems = (items: SidebarItem[]): SidebarItem[] =>
      items.filter(isAllowed).flatMap((item) => {
        if (!item.items) return [item];
        const children = filterItems(item.items);
        return children.length > 0 ? [{ ...item, items: children }] : [];
      });
    return sidebarSections
      .map((section) => ({ ...section, items: filterItems(section.items) }))
      .filter((section) => section.items.length > 0);
  }, [user]);

  const active = React.useMemo(
    () => findActive(visibleSections, pathname),
    [visibleSections, pathname],
  );

  const expandActiveGroups = React.useCallback(() => {
    if (active.groups.length === 0) return;
    setExpandedItems((prev) =>
      Array.from(new Set([...prev, ...active.groups])),
    );
  }, [active.groups]);

  // Open the current page's group on navigation and after a refresh.
  React.useEffect(() => {
    if (sideBarOpen) expandActiveGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.path]);

  const handleExpandClick = (title: string, isMobile = false) => {
    if (!isMobile && !sideBarOpen && !isHovered) return;
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
    } else {
      expandActiveGroups();
    }
  };

  const handleMouseEnter = () => {
    if (!sideBarOpen) {
      setIsHovered(true);
      expandActiveGroups();
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (!sideBarOpen) {
      setExpandedItems([]);
    }
  };

  const containsActive = (item: SidebarItem): boolean =>
    !!item.items &&
    item.items.some(
      (child) => child.path === active.path || containsActive(child),
    );

  const renderItem = (
    item: SidebarItem,
    depth: number,
    isMobile: boolean,
  ): React.ReactNode => {
    const isExpanded = isMobile || sideBarOpen || isHovered;
    const isGroup = !!item.items;
    const isOpen = expandedItems.includes(item.title);
    const isSelected = !isGroup && item.path === active.path;
    const isActiveParent = isGroup && containsActive(item);
    const badgeCount = getBadgeCount(item);
    // A group's own badge only matters while its children are hidden.
    const showBadge = badgeCount > 0 && (!isGroup || !isOpen || !isExpanded);

    return (
      <React.Fragment key={item.path ?? item.title}>
        <ListItem disablePadding>
          <Tooltip title={isExpanded ? "" : item.title} placement="right" arrow>
            <ListItemButton
              component={item.path ? Link : "div"}
              href={item.path || "#"}
              target={item.openInNewTab ? "_blank" : undefined}
              rel={item.openInNewTab ? "noopener noreferrer" : undefined}
              onClick={() => {
                if (isGroup) {
                  handleExpandClick(item.title, isMobile);
                } else if (isMobile) {
                  setMobileOpen(false);
                }
              }}
              selected={isSelected}
              sx={{
                borderRadius: 1.5,
                mb: 0.25,
                color: isActiveParent ? "primary.main" : "text.secondary",
                minHeight: depth === 0 ? 40 : 36,
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
                pl: isExpanded ? 1.5 + depth * 2 : 2,
                whiteSpace: "nowrap",
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: isExpanded ? (depth === 0 ? 40 : 34) : 0,
                  color: "inherit",
                  justifyContent: "center",
                  "& .MuiSvgIcon-root": {
                    fontSize: depth === 0 ? "1.35rem" : "1.15rem",
                  },
                }}
              >
                {showBadge && !isExpanded ? (
                  <Badge
                    color="error"
                    badgeContent={badgeCount}
                    max={99}
                    sx={{
                      "& .MuiBadge-badge": {
                        fontSize: "0.65rem",
                        minWidth: 16,
                        height: 16,
                        padding: "0 4px",
                        borderRadius: 8,
                      },
                    }}
                  >
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              {isExpanded && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    minWidth: 0,
                    gap: 1,
                  }}
                >
                  <ListItemText
                    primary={item.title}
                    primaryTypographyProps={{
                      fontSize: depth === 0 ? "0.875rem" : "0.825rem",
                      fontWeight: isSelected || isActiveParent ? 600 : 400,
                      noWrap: true,
                    }}
                    sx={{ my: 0 }}
                  />
                  {showBadge && (
                    <Box
                      component="span"
                      sx={{
                        bgcolor: "error.main",
                        color: "error.contrastText",
                        borderRadius: 10,
                        px: 0.75,
                        minWidth: 20,
                        lineHeight: "18px",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        textAlign: "center",
                        flexShrink: 0,
                      }}
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </Box>
                  )}
                  {isGroup && (
                    <ExpandMore
                      sx={{
                        fontSize: "1.15rem",
                        flexShrink: 0,
                        transition: (theme) =>
                          theme.transitions.create("transform", {
                            duration: theme.transitions.duration.shorter,
                            easing: theme.transitions.easing.easeInOut,
                          }),
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    />
                  )}
                </Box>
              )}
            </ListItemButton>
          </Tooltip>
        </ListItem>
        {isExpanded && isGroup && (
          <Collapse in={isOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {item.items!.map((child) =>
                renderItem(child, depth + 1, isMobile),
              )}
            </List>
          </Collapse>
        )}
      </React.Fragment>
    );
  };

  const renderSections = (isMobile = false) => {
    const isExpanded = isMobile || sideBarOpen || isHovered;
    return visibleSections.map((section, index) => (
      <React.Fragment key={section.heading ?? `section-${index}`}>
        {section.heading &&
          (isExpanded ? (
            <Typography
              variant="overline"
              component="div"
              sx={{
                px: 1.5,
                mt: 2,
                mb: 0.5,
                lineHeight: 1.5,
                fontSize: "0.68rem",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "text.disabled",
                whiteSpace: "nowrap",
              }}
            >
              {section.heading}
            </Typography>
          ) : (
            <Divider sx={{ my: 1.25, mx: 1 }} />
          ))}
        {section.items.map((item) => renderItem(item, 0, isMobile))}
      </React.Fragment>
    ));
  };

  const isDesktopExpanded = sideBarOpen || isHovered;

  return (
    <>
      {/* Mobile Drawer (xs, sm) */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: EXPANDED_WIDTH,
            backgroundColor: "background.paper",
            backgroundImage: "none",
            p: 1.5,
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1,
            py: 1,
            mb: 1,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle1" fontWeight="700">
            Admin Navigation
          </Typography>
          <IconButton
            size="small"
            onClick={() => setMobileOpen(false)}
            aria-label="close drawer"
          >
            <CloseIcon />
          </IconButton>
        </Box>
        <List sx={{ px: 0 }}>{renderSections(true)}</List>
      </Drawer>

      {/* Desktop Collapsible Sidebar (md and up). The outer box reserves
          the layout width; the inner panel widens over the page on hover
          instead of pushing the content. */}
      <Box
        sx={{
          display: { xs: "none", md: "block" },
          position: "relative",
          width: sideBarOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
          flexShrink: 0,
          height: "100%",
          transition: (theme) =>
            theme.transitions.create(["width"], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.standard,
            }),
        }}
      >
        <Box
          component="nav"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: (theme) => theme.zIndex.drawer,
            width: isDesktopExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
            display: "flex",
            flexDirection: "column",
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            boxShadow: isHovered && !sideBarOpen ? 8 : "none",
            overflow: "hidden",
            transition: (theme) =>
              theme.transitions.create(["width", "box-shadow"], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.standard,
              }),
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: isDesktopExpanded ? "flex-end" : "center",
              px: 1,
              py: 0.75,
              borderBottom: 1,
              borderColor: "divider",
              flexShrink: 0,
            }}
          >
            <Tooltip
              title={sideBarOpen ? "Collapse sidebar" : "Keep sidebar open"}
              placement="right"
            >
              <IconButton
                size="small"
                onClick={toggleCollapse}
                aria-label={
                  sideBarOpen ? "Collapse sidebar" : "Keep sidebar open"
                }
                sx={{ gap: 0.5, borderRadius: 1.5 }}
              >
                {sideBarOpen ? <ChevronLeft /> : <ChevronRight />}
                {sideBarOpen && <LockIcon sx={{ fontSize: "0.75rem" }} />}
              </IconButton>
            </Tooltip>
          </Box>
          <Box
            sx={{
              flex: 1,
              overflowX: "hidden",
              overflowY: "auto",
              "&::-webkit-scrollbar": {
                width: "4px",
              },
              "&::-webkit-scrollbar-track": {
                background: "transparent",
              },
              "&::-webkit-scrollbar-thumb": {
                background: "transparent",
                borderRadius: "2px",
              },
              "&:hover::-webkit-scrollbar-thumb": {
                background: "rgba(0,0,0,0.3)",
              },
            }}
          >
            <List sx={{ px: isDesktopExpanded ? 1.5 : 1, pt: 1, pb: 2 }}>
              {renderSections(false)}
            </List>
          </Box>
        </Box>
      </Box>
    </>
  );
}
