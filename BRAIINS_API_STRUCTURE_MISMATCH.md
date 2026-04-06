/**
 * BRAIINS API RESPONSE MAPPING
 * 
 * This file documents the actual Braiins API response structure
 * vs the current interface definitions in braiins.ts
 */

// ============================================================================
// ACTUAL API RESPONSES (from test-braiins-api.js)
// ============================================================================

/**
 * GET /stats/json/btc
 */
export const POOL_STATS_ACTUAL = {
  btc: {
    hash_rate_unit: "Gh/s",
    pool_active_workers: 106248,
    blocks: {},
    fpps_rate: 4.439847274120157e-7,
    pool_5m_hash_rate: 14064869487.490135,
    pool_60m_hash_rate: 13816493952.269337,
    pool_24h_hash_rate: 13690047497.42297,
    update_ts: 1775298600
  }
};

/**
 * GET /accounts/profile/json/btc
 */
export const PROFILE_ACTUAL = {
  username: "HiggsRAK",
  btc: {
    all_time_reward: "0.00538117",
    hash_rate_unit: "Gh/s",
    hash_rate_5m: 469124.9611844267,
    hash_rate_60m: 490079.2094506644,
    hash_rate_24h: 474102.8982725503,
    hash_rate_yesterday: 467130.8746794962,
    low_workers: 0,
    off_workers: 0,
    ok_workers: 2,
    dis_workers: 1,
    current_balance: "0.00021038",
    today_reward: "0.00009420",
    estimated_reward: "0.00021049",
    shares_5m: 32768000,
    shares_60m: 410779648,
    shares_24h: 9537323008,
    shares_yesterday: 9397069824
  }
};

/**
 * GET /accounts/workers/json/btc
 * 
 * NOTE: Returns an OBJECT with worker names as keys, NOT an array!
 */
export const WORKERS_ACTUAL = {
  btc: {
    workers: {
      "HiggsRAK.10x12x0x69": {
        state: "ok",
        last_share: 1775298866,
        hash_rate_unit: "Gh/s",
        hash_rate_5m: 202661.98323167232,
        hash_rate_60m: 249574.479350115,
        hash_rate_24h: 234823.10557064912,
        shares_5m: 14155776,
        shares_60m: 209190912,
        shares_24h: 4723834880
      },
      "HiggsRAK.10x12x0x70": {
        state: "ok",
        last_share: 1775298890,
        hash_rate_unit: "Gh/s",
        hash_rate_5m: 266462.97795275436,
        hash_rate_60m: 240504.7301005494,
        hash_rate_24h: 239279.79270190117,
        shares_5m: 18612224,
        shares_60m: 201588736,
        shares_24h: 4813488128
      }
    }
  }
};

/**
 * GET /accounts/rewards/json/btc?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * NOTE: Returns daily_rewards, date is Unix timestamp!
 */
export const REWARDS_ACTUAL = {
  btc: {
    daily_rewards: [
      {
        date: 1775174400,
        total_reward: "0.00021038",
        mining_reward: "0.00021038",
        bos_plus_reward: "0.00000000",
        referral_bonus: "0.00000000",
        referral_reward: "0.00000000",
        shares: 33816576,
        share_prices: [
          {
            from_ts: 1775174400,
            to_ts: 1775208300,
            share_price: "0.000000000000023495884734900788"
          }
        ],
        calculation_date: 1775268000
      }
    ]
  }
};

/**
 * GET /accounts/payouts/json/btc?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * NOTE: Returns payouts (not just amounts, but transaction data)
 */
export const PAYOUTS_ACTUAL = {
  btc: {
    payouts: [
      {
        date: "2026-04-03",
        transaction_id: "abc123...",
        amount: "0.00100000",
        status: "confirmed"
      }
    ]
  }
};

// ============================================================================
// WHAT THE CURRENT CODE EXPECTS
// ============================================================================

/**
 * Current DailyRewards interface:
 * {
 *   rewards: RewardData[]
 * }
 * 
 * But API returns:
 * {
 *   btc: {
 *     daily_rewards: [...]
 *   }
 * }
 */

/**
 * Current Workers interface:
 * {
 *   workers: Worker[]  (ARRAY)
 * }
 * 
 * But API returns:
 * {
 *   btc: {
 *     workers: {...}   (OBJECT with keys)
 *   }
 * }
 */

// ============================================================================
// WHAT NEEDS TO BE FIXED
// ============================================================================

export const FIXES_NEEDED = `
1. Update ALL response interfaces to include "btc" nesting level
2. Change Workers interface from array to object with string keys
3. Change interface names to match API (daily_rewards, not rewards)
4. Update all .getXyz() methods to properly extract nested btc data
5. Handle date as Unix timestamp (not string) in rewards
6. Convert worker object to array in getWorkers() for consistent API

Files to update:
- src/lib/braiins.ts (interfaces and client methods)
- src/app/api/**/*ts (any code expecting old response structure)
`;
