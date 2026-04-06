const { PrismaClient } = require('@prisma/client');
const braiins = require('./src/lib/braiins.ts');

const prisma = new PrismaClient();

(async () => {
  try {
    const userId = 'cmiojv0w50002l7044kq7e915';
    
    console.log('\n=== Checking User Setup ===');
    
    // Check miners
    const miners = await prisma.miner.findMany({
      where: { userId },
      include: { pool: true }
    });
    console.log(`\nMiners: ${miners.length}`);
    miners.forEach(m => console.log(`  - ${m.id} (Pool: ${m.pool?.name})`));
    
    // Check PoolAuth
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: true }
    });
    console.log(`\nPoolAuth entries: ${poolAuths.length}`);
    poolAuths.forEach(pa => console.log(`  - Pool: ${pa.pool.name} | AuthKey: ${pa.authKey}`));
    
    // Test Braiins API directly
    if (poolAuths.length > 0) {
      const braiinsAuth = poolAuths.find(pa => pa.pool.name === 'Braiins');
      if (braiinsAuth) {
        console.log(`\n=== Testing Braiins API with authKey: ${braiinsAuth.authKey} ===`);
        
        // Note: This would need the actual BraiinsClient import
        console.log('\nTo test Braiins API:');
        console.log(`1. Auth Key: ${braiinsAuth.authKey}`);
        console.log(`2. Test endpoint: GET /accounts/workers/json/btc`);
        console.log(`3. Expected to see miner worker data`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
})();
