// src/lib/faq.ts

/**
 * Client FAQ content, rendered by the /faq page.
 *
 * To add a question, append an entry to the matching category's `items`.
 * To add a category, append a new object to `FAQ_CATEGORIES` - it shows up
 * as a filter pill and its own section automatically. `id`s must be unique
 * (they're used as React keys and URL anchors).
 */

export interface FaqItem {
  id: string;
  question: string;
  /** Plain text; blank lines start a new paragraph. */
  answer: string;
}

export interface FaqCategory {
  id: string;
  title: string;
  description?: string;
  items: FaqItem[];
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "bitcoin-fundamentals",
    title: "Bitcoin Fundamentals",
    description: "What Bitcoin is, how it works and why it matters.",
    items: [],
  },
  {
    id: "mining-explained",
    title: "Mining Explained",
    description: "How Bitcoin mining works, from hashrate to rewards.",
    items: [],
  },
  {
    id: "platform-technical",
    title: "Platform & Technical",
    description: "Using the BitFactory portal and technical troubleshooting.",
    items: [],
  },
];
