"use client";

/**
 * FAQ page (authenticated) - BitFactory Daylight theme (v1.3)
 *
 * Composes:
 * - Page heading + search field
 * - Category filter pills ("All" + one per category)
 * - One card per category with accordion questions
 * - "Still need help?" card linking to Support
 *
 * Content lives in lib/faq.ts - add questions/categories there.
 */

import React, { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SupportAgentOutlinedIcon from "@mui/icons-material/SupportAgentOutlined";
import Link from "next/link";
import PillTab from "@/components/daylight/PillTab";
import { FAQ_CATEGORIES, FaqCategory } from "@/lib/faq";
import { RADIUS_CARD, focusRing, useDaylight } from "@/lib/daylight";

const ALL = "all";

export default function FaqPage() {
  const { d, fonts } = useDaylight();
  const [category, setCategory] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | false>(false);

  // Category filter first, then the search narrows the questions inside each
  // remaining category; categories left with no matches are dropped.
  const visible = useMemo<FaqCategory[]>(() => {
    const q = query.trim().toLowerCase();
    return FAQ_CATEGORIES.filter((c) => category === ALL || c.id === category)
      .map((c) => ({
        ...c,
        items: q
          ? c.items.filter(
              (i) =>
                i.question.toLowerCase().includes(q) ||
                i.answer.toLowerCase().includes(q),
            )
          : c.items,
      }))
      .filter((c) => c.items.length > 0);
  }, [category, query]);

  const totalCount = FAQ_CATEGORIES.reduce((n, c) => n + c.items.length, 0);

  const cardSx = {
    bgcolor: d.surface,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS_CARD,
    boxShadow: d.shadow,
    p: { xs: 2.5, sm: 4 },
  };

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: "8px",
      fontFamily: fonts.body,
      fontSize: 13,
      bgcolor: d.surface,
      color: d.text,
      "& fieldset": { borderColor: d.inputBorder },
      "&:hover fieldset": { borderColor: d.action },
    },
    "& .MuiOutlinedInput-root.Mui-focused fieldset": {
      borderColor: d.action,
      borderWidth: "2px",
    },
  };

  const countBadge = (n: number, active: boolean) => (
    <Box
      component="span"
      sx={{
        px: "6px",
        borderRadius: "999px",
        fontSize: 10,
        fontWeight: 650,
        lineHeight: 1.6,
        bgcolor: active ? d.surface : d.hover,
        color: active ? d.action : d.muted,
      }}
    >
      {n}
    </Box>
  );

  return (
    <Box
      sx={{ maxWidth: 1100, mx: "auto", fontFamily: fonts.body, color: d.text }}
    >
      {/* Heading + search */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 2,
          mb: { xs: "20px", md: "26px" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
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
            Frequently Asked Questions
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 12, md: 13 },
              lineHeight: { xs: 1.7, md: 1.5 },
              color: d.muted,
              mt: "7px",
            }}
          >
            Quick answers about your miners, wallet, billing and account.
          </Typography>
        </Box>

        <TextField
          size="small"
          placeholder="Search questions"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ ...inputSx, width: { xs: "100%", sm: 300 } }}
          slotProps={{
            htmlInput: { "aria-label": "Search FAQs" },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 18, color: d.muted }} />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      {/* Category pills */}
      <Box
        role="group"
        aria-label="FAQ categories"
        sx={{
          display: "flex",
          gap: "4px",
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          p: "4px",
          mb: { xs: "18px", md: "22px" },
          bgcolor: d.surface,
          border: `1px solid ${d.border}`,
          borderRadius: "10px",
        }}
      >
        <PillTab active={category === ALL} onClick={() => setCategory(ALL)}>
          All {countBadge(totalCount, category === ALL)}
        </PillTab>
        {FAQ_CATEGORIES.map((c) => (
          <PillTab
            key={c.id}
            active={category === c.id}
            onClick={() => setCategory(c.id)}
          >
            {c.title} {countBadge(c.items.length, category === c.id)}
          </PillTab>
        ))}
      </Box>

      {/* Category sections */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {visible.length === 0 ? (
          <Box sx={{ ...cardSx, textAlign: "center" }}>
            <Typography sx={{ fontSize: 13, color: d.muted }}>
              No questions match &ldquo;{query.trim()}&rdquo;.
            </Typography>
          </Box>
        ) : (
          visible.map((c) => (
            <Box
              key={c.id}
              component="section"
              id={c.id}
              aria-labelledby={`faq-${c.id}-title`}
              sx={cardSx}
            >
              <Typography
                id={`faq-${c.id}-title`}
                component="h2"
                sx={{
                  fontFamily: fonts.heading,
                  fontWeight: 700,
                  fontSize: { xs: 17, md: 19 },
                  letterSpacing: "-.02em",
                  color: d.text,
                }}
              >
                {c.title}
              </Typography>
              {c.description && (
                <Typography sx={{ fontSize: 12, color: d.muted, mt: "4px" }}>
                  {c.description}
                </Typography>
              )}

              <Box sx={{ mt: "14px" }}>
                {c.items.map((item) => (
                  <Accordion
                    key={item.id}
                    id={item.id}
                    disableGutters
                    elevation={0}
                    square
                    expanded={expanded === item.id}
                    onChange={(_, open) => setExpanded(open ? item.id : false)}
                    sx={{
                      bgcolor: "transparent",
                      backgroundImage: "none",
                      color: d.text,
                      borderTop: `1px solid ${d.border}`,
                      "&::before": { display: "none" },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={
                        <ExpandMoreRoundedIcon sx={{ color: d.muted }} />
                      }
                      sx={{
                        px: 0,
                        minHeight: 52,
                        "& .MuiAccordionSummary-content": { my: "12px" },
                        "&.Mui-focusVisible": {
                          bgcolor: "transparent",
                          ...focusRing(d.action),
                        },
                      }}
                    >
                      <Typography
                        sx={{
                          fontFamily: fonts.body,
                          fontSize: 14,
                          fontWeight: expanded === item.id ? 650 : 550,
                          color: expanded === item.id ? d.action : d.text,
                        }}
                      >
                        {item.question}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0, pt: 0, pb: "16px" }}>
                      {item.answer.split(/\n\s*\n/).map((para, i) => (
                        <Typography
                          key={i}
                          sx={{
                            fontSize: 13,
                            lineHeight: 1.7,
                            color: d.muted,
                            "& + &": { mt: "10px" },
                          }}
                        >
                          {para}
                        </Typography>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            </Box>
          ))
        )}

        {/* Support CTA */}
        <Box
          sx={{
            ...cardSx,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 2,
            bgcolor: d.skySoft,
            borderColor: d.borderSky,
          }}
        >
          <Box
            aria-hidden
            sx={{
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              borderRadius: "50%",
              bgcolor: d.surface,
              color: d.action,
              flexShrink: 0,
            }}
          >
            <SupportAgentOutlinedIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography
              sx={{
                fontFamily: fonts.heading,
                fontWeight: 700,
                fontSize: 16,
                color: d.text,
              }}
            >
              Still need help?
            </Typography>
            <Typography sx={{ fontSize: 12, color: d.muted, mt: "2px" }}>
              Raise a ticket and our support team will get back to you.
            </Typography>
          </Box>
          <Button
            component={Link}
            href="/support"
            variant="contained"
            sx={{
              textTransform: "none",
              fontFamily: fonts.body,
              fontWeight: 650,
              fontSize: 12,
              minHeight: 42,
              borderRadius: "8px",
              bgcolor: d.action,
              color: "#fff",
              boxShadow: "none",
              px: "16px",
              width: { xs: "100%", sm: "auto" },
              "&:hover": { bgcolor: d.actionHover, boxShadow: "none" },
            }}
          >
            Contact support
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
