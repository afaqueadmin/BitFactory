const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const userId = 'cmiojv0w50002l7044kq7e915';
    const luxorPoolId = 'cmnk2idwd0000usq83qokoojv';
    const braiinsPoolId = 'cmnk43rbe0000ust49c7y25s8';

    console.log('🔧 Fixing PoolAuth and Miner assignments...\n');

    // Fix 1: Update PoolAuth entries with correct auth keys
    console.log('=== FIX 1: Updating PoolAuth entries ===');
    
    // Update Luxor PoolAuth to use 'higgs' (the correct Luxor auth key)
    const luxorUpdate = await prisma.poolAuth.updateMany({
      where: {
        userId,
        poolId: luxorPoolId
      },
      data: {
        authKey: 'higgs'
      }
    });
    console.log(`✅ Updated Luxor PoolAuth: authKey = 'higgs'`);

    // Verify Braiins PoolAuth still has correct key
    const braiinsAuth = await prisma.poolAuth.findFirst({
      where: {
        userId,
        poolId: braiinsPoolId
      }
    });
    console.log(`✅ Braiins PoolAuth verified: authKey = '${braiinsAuth.authKey}'`);

    // Fix 2: Reassign miners to Braiins pool
    console.log('\n=== FIX 2: Reassigning miners to Braiins pool ===');
    
    const minerUpdate = await prisma.miner.updateMany({
      where: {
        userId
      },
      data: {
        poolId: braiinsPoolId
      }
    });
    console.log(`✅ Reassigned ${minerUpdate.count} miners to Braiins pool`);

    // Verify the changes
    console.log('\n=== VERIFICATION ===');
    
    const updatedPoolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { name: true } } }
    });
    console.log('\nPoolAuth entries after fix:');
    updatedPoolAuths.forEach(pa => {
      console.log(`- Pool: ${pa.pool.name} | AuthKey: ${pa.authKey}`);
    });

    const updatedMiners = await prisma.miner.findMany({
      where: { userId },
      include: { pool: { select: { name: true } } }
    });
    console.log('\nMiners after fix:');
    updatedMiners.forEach(m => {
      console.log(`- Miner: ${m.id} | Pool: ${m.pool.name}`);
    });

    console.log('\n✅ All fixes completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
})();
