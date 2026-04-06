const axios = require('axios');

// Braiins API configuration
const BRAIINS_API_BASE = 'https://pool.braiins.com';
const AUTH_KEY = 'ooF4tScTnMOyPegE'; // The key we're testing

// Create axios client for Braiins
const braiinsClient = axios.create({
  baseURL: BRAIINS_API_BASE,
  headers: {
    'Pool-Auth-Token': AUTH_KEY,
    'Content-Type': 'application/json',
  },
  validateStatus: () => true, // Don't throw on any status
});

async function testBraiinsAPI() {
  console.log('='.repeat(70));
  console.log('BRAIINS POOL API TEST');
  console.log('='.repeat(70));
  
  console.log(`\nAuth Key: ${AUTH_KEY}`);
  console.log(`API Base: ${BRAIINS_API_BASE}`);
  
  // Test 1: Get Pool Stats
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 1: Get Pool Stats (Public Endpoint)');
  console.log('-'.repeat(70));
  try {
    const response = await braiinsClient.get('/stats/json/btc');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 2: Get User Profile
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 2: Get User Profile');
  console.log('-'.repeat(70));
  try {
    const response = await braiinsClient.get('/accounts/profile/json/btc');
    console.log('Status:', response.status);
    if (response.status === 200) {
      console.log('✅ Auth Key Valid!');
      console.log('Profile:', JSON.stringify(response.data, null, 2));
    } else {
      console.log('❌ Auth Key Invalid or Error');
      console.log('Response:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 3: Get Workers
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 3: Get Workers');
  console.log('-'.repeat(70));
  try {
    const response = await braiinsClient.get('/accounts/workers/json/btc');
    console.log('Status:', response.status);
    if (response.status === 200 && response.data?.workers) {
      console.log(`✅ Found ${response.data.workers.length} workers`);
      console.log('Workers:', JSON.stringify(response.data.workers.slice(0, 3), null, 2));
      if (response.data.workers.length > 3) {
        console.log(`... and ${response.data.workers.length - 3} more workers`);
      }
    } else {
      console.log('❌ No workers found or error');
      console.log('Response:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 4: Get Daily Rewards
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 4: Get Daily Rewards (Last 30 days)');
  console.log('-'.repeat(70));
  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);
    
    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const from = formatDate(startDate);
    const to = formatDate(endDate);
    
    console.log(`Date Range: ${from} to ${to}`);
    
    const response = await braiinsClient.get('/accounts/rewards/json/btc', {
      params: { from, to }
    });
    
    console.log('Status:', response.status);
    if (response.status === 200 && response.data?.rewards) {
      console.log(`✅ Found ${response.data.rewards.length} reward records`);
      console.log('Sample Rewards:', JSON.stringify(response.data.rewards.slice(0, 3), null, 2));
      if (response.data.rewards.length > 3) {
        console.log(`... and ${response.data.rewards.length - 3} more records`);
      }
    } else {
      console.log('❌ No rewards found or error');
      console.log('Response:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Test 5: Get Payouts
  console.log('\n' + '-'.repeat(70));
  console.log('TEST 5: Get Payouts (Last 30 days)');
  console.log('-'.repeat(70));
  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);
    
    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const from = formatDate(startDate);
    const to = formatDate(endDate);
    
    console.log(`Date Range: ${from} to ${to}`);
    
    const response = await braiinsClient.get('/accounts/payouts/json/btc', {
      params: { from, to }
    });
    
    console.log('Status:', response.status);
    if (response.status === 200 && response.data?.payouts) {
      console.log(`✅ Found ${response.data.payouts.length} payout records`);
      console.log('Sample Payouts:', JSON.stringify(response.data.payouts.slice(0, 3), null, 2));
      if (response.data.payouts.length > 3) {
        console.log(`... and ${response.data.payouts.length - 3} more records`);
      }
    } else {
      console.log('❌ No payouts found or error');
      console.log('Response:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`
If you see:
✅ Auth Key Valid! → The key is correct
❌ Auth Key Invalid → The key needs to be updated
0 workers → No miners are connected to this account
0 rewards/payouts → No mining activity from this account yet

Next Steps:
1. If auth key is invalid, update the Braiins PoolAuth entry in database
2. If 0 workers, verify miners are actually pointed to Braiins pool
3. If 0 rewards, wait for mining to complete and data to appear
  `);
}

// Run tests
testBraiinsAPI().catch(console.error);
