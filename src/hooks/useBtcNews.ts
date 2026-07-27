import { useQuery } from "@tanstack/react-query";

export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  imageUrl: string | null;
  publishedAt: number;
}

interface NewsResponse {
  articles: NewsArticle[];
  error?: string;
}

export const useBtcNews = () => {
  const { data, isLoading, error, isError } = useQuery<NewsResponse>({
    queryKey: ["btc-news"],
    queryFn: async () => {
      const response = await fetch("/api/btc-news");
      if (!response.ok) {
        throw new Error("Failed to fetch BTC news");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  });

  return {
    articles: data?.articles || [],
    isLoading,
    isError,
    error: error instanceof Error ? error.message : data?.error || null,
  };
};
