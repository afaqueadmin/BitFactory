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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
              p: 1.25,
              borderRadius: 2,
              alignItems: "center",
              backgroundColor: isDark ? theme.palette.grey[800] : "#f5f5f5",
              "&:hover": {
                backgroundColor: isDark
                  ? theme.palette.grey[700]
                  : theme.palette.grey[200],
              },
            }}
          >
            {article.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.imageUrl}
                alt=""
                width={64}
                height={64}
                style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
              />
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                fontWeight={600}
                sx={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {article.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {article.source} •{" "}
                {formatDistanceToNow(article.publishedAt, { addSuffix: true })}
              </Typography>
            </Box>
          </Box>
        </Link>
      ))}
    </Box>
  );
}
