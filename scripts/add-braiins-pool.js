const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("� Checking existing pools...\n");

  try {
    // List all pools
    const pools = await prisma.pool.findMany();
    console.log(`Found ${pools.length} pool(s):`);
    pools.forEach((pool) => {
      console.log(`  • ${pool.name} (ID: ${pool.id})`);
      console.log(`    URL: ${pool.apiUrl}`);
      console.log(`    Description: ${pool.description}\n`);
    });

    // Find Braiins pool
    const braiinsPool = await prisma.pool.findUnique({
      where: { name: "Braiins" },
    });

    if (!braiinsPool) {
      console.log("❌ Braiins pool not found!");
      return;
    }

    console.log(`✅ Found Braiins Pool: ${braiinsPool.id}\n`);

    // Check if PoolAuth already exists
    const existingAuth = await prisma.poolAuth.findUnique({
      where: {
        poolId_userId: {
          poolId: braiinsPool.id,
          userId: "cmiojv0w50002l7044kq7e915",
        },
      },
    });

    if (existingAuth) {
      console.log(`⚠️  PoolAuth already exists for this user and pool`);
      console.log(`   ID: ${existingAuth.id}`);
      console.log(`   Auth Key: ${existingAuth.authKey}`);
      return;
    }

    // Create PoolAuth
    console.log(`🔐 Creating PoolAuth for user cmiojv0w50002l7044kq7e915...`);
    const poolAuth = await prisma.poolAuth.create({
      data: {
        poolId: braiinsPool.id,
        userId: "cmiojv0w50002l7044kq7e915",
        authKey: "ooF4tScTnMOyPegE",
      },
    });

    console.log(`✅ Created PoolAuth:`);
    console.log(`   ID: ${poolAuth.id}`);
    console.log(`   Pool: Braiins (${braiinsPool.id})`);
    console.log(`   User: cmiojv0w50002l7044kq7e915`);
    console.log(`   Auth Key: ${poolAuth.authKey}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
