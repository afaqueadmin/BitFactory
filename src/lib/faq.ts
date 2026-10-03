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
    id: "general",
    title: "General",
    description: "Getting around the BitFactory client portal.",
    items: [
      {
        id: "general-dashboard",
        question: "What can I see on my dashboard?",
        answer:
          "The dashboard gives you an overview of your mining operation: fleet status, hashrate history, mining earnings and the current BTC price.\n\nUse the subaccount filter in the top bar to narrow the figures to specific subaccounts.",
      },
      {
        id: "general-dark-mode",
        question: "Can I switch to dark mode?",
        answer:
          "Yes. Use the sun/moon button in the top bar to toggle between light and dark mode.",
      },
    ],
  },
  {
    id: "miners",
    title: "Miners & Hashrate",
    description: "Your hosted machines and their performance.",
    items: [
      {
        id: "miners-status",
        question: "Where can I check the status of my miners?",
        answer:
          "Open the Miners page from the sidebar. It lists every machine hosted for you along with its current status and hashrate.",
      },
    ],
  },
  {
    id: "wallet",
    title: "Wallet & Payouts",
    description: "Earnings, balances and payout addresses.",
    items: [
      {
        id: "wallet-change-address",
        question: "How do I change my payout wallet address?",
        answer:
          "Go to the Wallet page and submit a wallet change request. You can follow the status of the request in the request history on the same page.",
      },
      {
        id: "wallet-transactions",
        question: "Where can I see my past transactions?",
        answer: "The Transactions page shows your full transaction history.",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing & Invoices",
    description: "Invoices and payments.",
    items: [
      {
        id: "billing-invoices",
        question: "Where can I find my invoices?",
        answer:
          "Open the Invoices page from the sidebar. A counter next to the menu item shows how many invoices are still unpaid.",
      },
    ],
  },
  {
    id: "account",
    title: "Account & Security",
    description: "Profile, passwords, 2FA and passkeys.",
    items: [
      {
        id: "account-2fa",
        question: "How do I enable two-factor authentication?",
        answer:
          "Open the account menu in the top-right corner and choose Security Settings. From there you can set up two-factor authentication and passkeys.",
      },
    ],
  },
];
