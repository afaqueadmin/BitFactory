const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const userId = 'cmiojv0w50002l7044kq7e915';
    
    console.log('\n=== ALL POOLS IN DATABASE ===');
    const pools = await prisma.pool.findMany();
    pools.forEach(p => console.log(`- ${p.name} (ID: ${p.id})`));
    
    console.log('\n=== USER POOLAUTH ENTRIES ===');
    const poolAuths = await prisma.poolAuth.findMany({
      where: { userId },
      include: { pool: { select: { name: true, id: true } } }
    });
    poolAuths.forEach(pa => {
      console.log(`- Pool: ${pa.pool.name} (${pa.poolId}) | AuthKey: ${pa.authKey}`);
    });
    
    console.log('\n=== USER MINERS ===');
    const miners = await prisma.miner.findMany({
      where: { userId },
      include: { pool: { select: { name: true, id: true } } }
    });
    miners.forEach(m => {
      console.log(`- Miner: ${m.id} | Pool: ${m.pool?.name || 'NO POOL'} (${m.poolId || 'NO POOLID'})`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
})();
