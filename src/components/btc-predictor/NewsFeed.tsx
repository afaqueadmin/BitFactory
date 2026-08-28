"use client";

import React from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Link,
  useTheme,
} from "@mui/material";
import { formatDistanceToNow } from "date-fns";
import { NewsArticle } from "@/hooks/useBtcNews";

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
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (isError || articles.length === 0) {
    return (
      <Alert severity="warning" sx={{ borderRadius: 2 }}>
        BTC news feed unavailable right now.
      </Alert>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
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
              gap: 1.5,
              p: { xs: 1.25, sm: 1.5 },
              borderRadius: 2,
              alignItems: "center",
              backgroundColor: isDark
                ? "rgba(255, 255, 255, 0.03)"
                : "rgba(0, 0, 0, 0.02)",
              border: `1px solid ${
                isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)"
              }`,
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                backgroundColor: isDark
                  ? "rgba(255, 255, 255, 0.07)"
                  : "rgba(0, 0, 0, 0.05)",
                borderColor: theme.palette.primary.main,
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
                variant="body2"
                fontWeight={600}
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  lineHeight: 1.35,
                  fontSize: { xs: "0.82rem", sm: "0.875rem" },
                }}
              >
                {article.title}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: "block", fontSize: "0.72rem" }}
              >
                <Box
                  component="span"
                  sx={{ color: "primary.main", fontWeight: 700 }}
                >
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
