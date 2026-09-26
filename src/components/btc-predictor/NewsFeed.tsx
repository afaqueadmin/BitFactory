"use client";

import React from "react";
import { Box, Typography, CircularProgress, Alert, Link } from "@mui/material";
import { formatDistanceToNow } from "date-fns";
import { NewsArticle } from "@/hooks/useBtcNews";
import { useDaylight } from "@/lib/daylight";

interface NewsFeedProps {
  articles: NewsArticle[];
  isLoading: boolean;
  isError: boolean;
}

export default function NewsFeed({
  articles,
  isLoading,
  isError,
}: NewsFeedProps) {
  const { d, fonts } = useDaylight();

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} sx={{ color: d.action }} />
      </Box>
    );
  }

  if (isError || articles.length === 0) {
    return (
      <Alert
        severity="warning"
        sx={{
          borderRadius: "8px",
          bgcolor: d.amber,
          color: d.warning,
          fontFamily: fonts.body,
          "& .MuiAlert-icon": { color: d.warning },
        }}
      >
        BTC news feed unavailable right now.
      </Alert>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {articles.map((article) => (
        <Link
          key={article.id}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          underline="none"
          sx={{ color: "inherit" }}
        >
          <Box
            sx={{
              display: "flex",
              gap: "12px",
              p: { xs: "10px", sm: "12px" },
              borderRadius: "10px",
              alignItems: "center",
              bgcolor: d.canvas,
              border: `1px solid ${d.border}`,
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                bgcolor: d.hover,
                borderColor: d.action,
                transform: "translateY(-1px)",
              },
            }}
          >
            {article.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.imageUrl}
                alt=""
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            )}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                sx={{
                  fontFamily: fonts.body,
                  fontWeight: 600,
                  color: d.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  lineHeight: 1.35,
                  fontSize: { xs: 12, sm: 13 },
                }}
              >
                {article.title}
              </Typography>
              <Typography
                sx={{
                  mt: "4px",
                  display: "block",
                  fontSize: 11,
                  color: d.muted,
                }}
              >
                <Box component="span" sx={{ color: d.action, fontWeight: 700 }}>
                  {article.source}
                </Box>
                {" • "}
                {formatDistanceToNow(article.publishedAt, { addSuffix: true })}
              </Typography>
            </Box>
          </Box>
        </Link>
      ))}
    </Box>
  );
}
