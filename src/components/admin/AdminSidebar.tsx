"use client";

import { isStaffRole } from "@/lib/auth/staffRoles";
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
  Diversity3 as GuildsIcon,
  HowToReg as GuildRequestsIcon,
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
  Savings as SecurityDepositsIcon,
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
  LocalShipping as VendorsIcon,
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
  LockOpen as LockOpenIcon,
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
import { focusRing, useDaylight } from "@/lib/daylight";

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
  // Roles allowed to see this item. Defaults to every staff role (today's
  // behavior) when omitted, so existing items don't need to be touched.
  // FRANCHISEE no longer renders this sidebar at all — they get their own
  // dedicated FranchiseSidebar under the (franchise) route group.
  roles?: Array<"ADMIN" | "SUPER_ADMIN" | "ACCOUNTING">;
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
      {
        title: "Guild Requests",
        icon: <GuildRequestsIcon />,
        path: "/guild-requests",
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
        title: "Guilds",
        icon: <GuildsIcon />,
        path: "/guilds",
        activeMatch: [/^\/guilds\//],
      },
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
          {
            title: "Security Deposits",
            icon: <SecurityDepositsIcon />,
            path: "/accounting/security-deposits",
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
            title: "Repair Charges",
            icon: <HardwareRepairIcon />,
            path: "/admin/repair-charges",
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
          {
            title: "Vendors",
            icon: <VendorsIcon />,
            path: "/accounting/vendors",
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
  const { d, fonts } = useDaylight();

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
      if (!user) return false;
      return item.roles
        ? (item.roles as string[]).includes(user.role)
        : isStaffRole(user.role);
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

  // The item just clicked, highlighted until the navigation commits:
  // usePathname() only changes once the new route has loaded, which can
  // take a few seconds.
  const [pendingPath, setPendingPath] = React.useState<string | null>(null);
  React.useEffect(() => setPendingPath(null), [pathname]);
  const selectedPath = pendingPath ?? active.path;

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
      (child) => child.path === selectedPath || containsActive(child),
    );

  const renderItem = (
    item: SidebarItem,
    depth: number,
    isMobile: boolean,
  ): React.ReactNode => {
    const isExpanded = isMobile || sideBarOpen || isHovered;
    const isGroup = !!item.items;
    const isOpen = expandedItems.includes(item.title);
    const isSelected = !isGroup && item.path === selectedPath;
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
              onClick={(e: React.MouseEvent) => {
                if (isGroup) {
                  handleExpandClick(item.title, isMobile);
                  return;
                }
                // Modified clicks open a new tab and don't navigate here.
                const opensElsewhere =
                  item.openInNewTab ||
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey;
                if (!opensElsewhere && item.path) setPendingPath(item.path);
                if (isMobile) setMobileOpen(false);
              }}
              selected={isSelected}
              sx={{
                borderRadius: "9px",
                my: "2px",
                fontFamily: fonts.body,
                color: isActiveParent ? d.action : d.muted,
                minHeight: depth === 0 ? 38 : 34,
                "&.Mui-selected, &.Mui-selected:hover": {
                  color: d.action,
                  bgcolor: d.skySoft,
                  "& .MuiListItemIcon-root": {
                    color: d.action,
                  },
                },
                "&:hover": {
                  bgcolor: d.hover,
                },
                "&.Mui-focusVisible": {
                  ...focusRing(d.action),
                  outlineOffset: "-3px",
                  bgcolor: "transparent",
                },
                justifyContent: isExpanded ? "flex-start" : "center",
                px: isExpanded ? 1.5 : 2,
                pl: isExpanded ? 1.5 + depth * 2 : 2,
                whiteSpace: "nowrap",
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: isExpanded ? (depth === 0 ? 32 : 28) : 0,
                  color: "inherit",
                  justifyContent: "center",
                  "& .MuiSvgIcon-root": {
                    fontSize: depth === 0 ? 20 : 17,
                  },
                }}
              >
                {showBadge && !isExpanded ? (
                  <Badge
                    badgeContent={badgeCount}
                    max={99}
                    sx={{
                      "& .MuiBadge-badge": {
                        bgcolor: d.danger,
                        color: d.surface,
                        fontFamily: fonts.body,
                        fontWeight: 650,
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
                      fontFamily: fonts.body,
                      fontSize: depth === 0 ? 13 : 12.5,
                      fontWeight: isSelected || isActiveParent ? 650 : 500,
                      noWrap: true,
                    }}
                    sx={{ my: 0 }}
                  />
                  {showBadge && (
                    <Box
                      component="span"
                      sx={{
                        bgcolor: d.amber,
                        color: d.warning,
                        borderRadius: "999px",
                        px: "6px",
                        minWidth: 20,
                        lineHeight: 1.6,
                        fontSize: 10,
                        fontWeight: 650,
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
                px: "12px",
                mt: "20px",
                mb: "6px",
                lineHeight: 1.5,
                fontFamily: fonts.body,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".17em",
                color: d.muted,
                whiteSpace: "nowrap",
              }}
            >
              {section.heading}
            </Typography>
          ) : (
            <Divider sx={{ my: 1.25, mx: 1, borderColor: d.border }} />
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
            backgroundColor: d.surface,
            backgroundImage: "none",
            borderRight: `1px solid ${d.border}`,
            fontFamily: fonts.body,
            p: "14px 12px",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1,
            pb: "12px",
            mb: 1,
            borderBottom: `1px solid ${d.border}`,
          }}
        >
          <Typography
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: 15,
              color: d.text,
            }}
          >
            Admin Navigation
          </Typography>
          <IconButton
            size="small"
            onClick={() => setMobileOpen(false)}
            aria-label="close drawer"
            sx={{
              width: 36,
              height: 36,
              border: `1px solid ${d.border}`,
              borderRadius: "10px",
              color: d.muted,
              "&:hover": { bgcolor: d.hover },
              "&:focus-visible": focusRing(d.action),
            }}
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
            borderRight: `1px solid ${d.border}`,
            bgcolor: d.surface,
            fontFamily: fonts.body,
            boxShadow:
              isHovered && !sideBarOpen
                ? "0 8px 30px rgba(100,114,124,.18)"
                : "none",
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
                background: d.inputBorder,
              },
            }}
          >
            <List sx={{ px: isDesktopExpanded ? "12px" : 1, pt: "8px", pb: 2 }}>
              {/* Collapse / keep-open control: the sidebar's first row */}
              <ListItem disablePadding>
                <Tooltip
                  title={isDesktopExpanded ? "" : "Keep sidebar open"}
                  placement="right"
                  arrow
                >
                  <ListItemButton
                    onClick={toggleCollapse}
                    aria-label={
                      sideBarOpen ? "Collapse sidebar" : "Keep sidebar open"
                    }
                    sx={{
                      borderRadius: "9px",
                      minHeight: 38,
                      px: isDesktopExpanded ? 1.5 : 2,
                      justifyContent: isDesktopExpanded
                        ? "flex-start"
                        : "center",
                      fontFamily: fonts.body,
                      color: d.muted,
                      whiteSpace: "nowrap",
                      "&:hover": { bgcolor: d.hover, color: d.action },
                      "&.Mui-focusVisible": {
                        ...focusRing(d.action),
                        outlineOffset: "-3px",
                        bgcolor: "transparent",
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: isDesktopExpanded ? 32 : 0,
                        color: "inherit",
                        justifyContent: "center",
                        "& .MuiSvgIcon-root": { fontSize: 20 },
                      }}
                    >
                      {sideBarOpen ? <ChevronLeft /> : <ChevronRight />}
                    </ListItemIcon>
                    {isDesktopExpanded && (
                      <>
                        <ListItemText
                          primary={
                            sideBarOpen
                              ? "Collapse sidebar"
                              : "Keep sidebar open"
                          }
                          primaryTypographyProps={{
                            fontFamily: fonts.body,
                            fontSize: 13,
                            fontWeight: 500,
                            noWrap: true,
                          }}
                          sx={{ my: 0 }}
                        />
                        {sideBarOpen ? (
                          <LockIcon
                            aria-hidden
                            sx={{
                              fontSize: 14,
                              color: d.action,
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <LockOpenIcon
                            aria-hidden
                            sx={{ fontSize: 14, flexShrink: 0 }}
                          />
                        )}
                      </>
                    )}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
              {renderSections(false)}
            </List>
          </Box>
        </Box>
      </Box>
    </>
  );
}
