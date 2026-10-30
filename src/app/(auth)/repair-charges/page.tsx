"use client";

/**
 * Repair Charges page (authenticated) - BitFactory Daylight theme.
 *
 * One card per hosting site (Brazil, Ethiopia) with its repair price list
 * and the flat hands & eyes fee that is added to every repair. Website-priced
 * rows link to their own URL, else the site's parts shop link. Prices are
 * managed by staff at /admin/repair-charges.
 */

import React from "react";
import {
  Alert,
  Box,
  Link as MuiLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PanToolOutlinedIcon from "@mui/icons-material/PanToolOutlined";
import { RADIUS_CARD, RADIUS_CONTROL, useDaylight } from "@/lib/daylight";
import {
  DaylightLoading,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useRepairCharges } from "@/lib/hooks/useRepairCharges";
import {
  REPAIR_SITES,
  REPAIR_SITE_LABELS,
  RepairChargeItem,
  RepairSite,
  RepairSiteSettingItem,
  formatRepairPrice,
  formatRepairUsd,
} from "@/lib/repairCharges";

export default function RepairChargesPage() {
  const { d, fonts } = useDaylight();
  const { charges, settings, loading, error } = useRepairCharges();

  return (
    <Box
      sx={{ maxWidth: 1200, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      <Box sx={{ mb: { xs: "20px", md: "26px" } }}>
        <Typography
          component="h1"
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 750,
            fontSize: { xs: 27, md: 32 },
            lineHeight: 1.3,
            letterSpacing: "-.035em",
            color: d.text,
          }}
        >
          Repair Charges
        </Typography>
        <Typography
          sx={{
            fontSize: { xs: 12, md: 13 },
            lineHeight: { xs: 1.7, md: 1.5 },
            color: d.muted,
            mt: "7px",
          }}
        >
          Repair prices at each hosting site, in USD. A fixed hands &amp; eyes
          fee is added to every repair.
        </Typography>
      </Box>

      {loading ? (
        <DaylightLoading />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
            gap: { xs: 2, md: 3 },
            alignItems: "start",
          }}
        >
          {REPAIR_SITES.map((site) => (
            <SiteCard
              key={site}
              site={site}
              charges={charges.filter((c) => c.site === site)}
              setting={settings.find((s) => s.site === site)}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function SiteCard({
  site,
  charges,
  setting,
}: {
  site: RepairSite;
  charges: RepairChargeItem[];
  setting?: RepairSiteSettingItem;
}) {
  const { d, fonts } = useDaylight();
  const { tableSx } = useDaylightAdminSx();

  return (
    <Box
      component="section"
      aria-labelledby={`repair-site-${site}`}
      sx={{
        bgcolor: d.surface,
        border: `1px solid ${d.border}`,
        borderRadius: RADIUS_CARD,
        boxShadow: d.shadow,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 2.5 },
          pb: 1.5,
        }}
      >
        <Typography
          id={`repair-site-${site}`}
          component="h2"
          sx={{
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 18,
            color: d.text,
          }}
        >
          {REPAIR_SITE_LABELS[site]}
        </Typography>
      </Box>

      {charges.length === 0 ? (
        <Typography
          sx={{ px: { xs: 2, sm: 3 }, pb: 2, fontSize: 13, color: d.muted }}
        >
          No repair charges published for this site yet.
        </Typography>
      ) : (
        <Box sx={tableSx}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Repair type</TableCell>
                <TableCell align="right">Price (USD)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {charges.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Box sx={{ fontWeight: 600 }}>{c.repairType}</Box>
                    {c.note && (
                      <Box sx={{ mt: "2px", fontSize: 12, color: d.muted }}>
                        {c.note}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ whiteSpace: "nowrap", fontWeight: 650 }}
                  >
                    <PriceCell charge={c} fallbackUrl={setting?.partsUrl} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {setting && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            m: { xs: 2, sm: 3 },
            mt: { xs: 1.5, sm: 2 },
            px: 2,
            py: 1.5,
            borderRadius: RADIUS_CONTROL,
            bgcolor: d.amber,
            border: `1px solid ${d.borderAmber}`,
            color: d.warning,
          }}
        >
          <PanToolOutlinedIcon sx={{ fontSize: 20 }} />
          <Box sx={{ flex: 1, minWidth: 0, fontSize: 13 }}>
            <Box sx={{ fontWeight: 700 }}>Hands &amp; eyes fee</Box>
            <Box sx={{ fontSize: 12 }}>Fixed, added to every repair</Box>
          </Box>
          <Box sx={{ fontWeight: 750, fontSize: 16, whiteSpace: "nowrap" }}>
            + {formatRepairUsd(setting.handsAndEyesFee)}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function PriceCell({
  charge,
  fallbackUrl,
}: {
  charge: RepairChargeItem;
  fallbackUrl?: string | null;
}) {
  const { d } = useDaylight();
  const url = charge.linkUrl ?? fallbackUrl;
  if (charge.priceType === "EXTERNAL" && url) {
    return (
      <MuiLink
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        underline="hover"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          color: d.action,
          fontWeight: 650,
        }}
      >
        See website
        <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
      </MuiLink>
    );
  }
  return <>{formatRepairPrice(charge)}</>;
}
