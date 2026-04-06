/**
 * Data Migration Script: Migrate from Space-based pool identification to Pool + PoolAuth schema
 * 
 * CommonJS version - run with: node scripts/migrate-to-pool-schema.js
 * 
 * This script:
 * 1. Creates Pool entries from unique Space names
 * 2. Creates PoolAuth entries for each user+pool combination with their API keys
 * 3. Updates all Miners to link to their corresponding Pool
 * 4. Verifies data integrity
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const stats = {
  poolsCreated: 0,
  poolAuthsCreated: 0,
  minersUpdated: 0,
  errors: [],
};

async function createPoolsFromSpaces() {
  console.log("\n📦 STEP 1: Creating Pool entries from Space names...");

  try {
    const spaces = await prisma.space.findMany({
      where: {
        miners: {
          some: {
            isDeleted: false,
          },
        },
      },
      select: {
        id: true,
        name: true,
      },
      distinct: ["name"],
    });

    console.log(
      `   Found ${spaces.length} unique space(s): ${spaces.map(s => s.name).join(", ")}`
    );

    const poolUrlMap = {
      Luxor: "https://api.luxor.tech",
      Braiins: "https://pool.braiins.com",
    };

    for (const space of spaces) {
      const apiUrl = poolUrlMap[space.name] || null;

      const existingPool = await prisma.pool.findUnique({
        where: { name: space.name },
      });

      if (existingPool) {
        console.log(
          `   ✓ Pool "${space.name}" already exists (id: ${existingPool.id})`
        );
        continue;
      }

      const pool = await prisma.pool.create({
        data: {
          name: space.name,
          apiUrl: apiUrl || "",
          description: `Pool created from space "${space.name}"`,
        },
      });

      console.log(
        `   ✓ Created Pool "${space.name}" (id: ${pool.id}, apiUrl: ${apiUrl || "N/A"})`
      );
      stats.poolsCreated++;
    }
  } catch (error) {
    const msg = `Error creating pools: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`   ✗ ${msg}`);
    stats.errors.push(msg);
  }
}

async function createPoolAuths() {
  console.log("\n🔐 STEP 2: Creating PoolAuth entries...");

  try {
    const miners = await prisma.miner.findMany({
      where: { isDeleted: false },
      include: {
        user: { select: { id: true, email: true } },
        space: { select: { id: true, name: true } },
      },
    });

    console.log(`   Processing ${miners.length} miners...`);

    const userPoolCombos = new Map();

    for (const miner of miners) {
      if (!miner.poolAuth) {
        console.warn(
          `   ⚠ Miner "${miner.name}" (id: ${miner.id}) has no poolAuth - skipping`
        );
        continue;
      }

      const key = `${miner.userId}|${miner.space.name}`;
      if (!userPoolCombos.has(key)) {
        userPoolCombos.set(key, {
          userId: miner.userId,
          poolName: miner.space.name,
          poolAuth: miner.poolAuth,
          minerNames: [],
        });
      }
      userPoolCombos.get(key).minerNames.push(miner.name);
    }

    console.log(
      `   Found ${userPoolCombos.size} unique (user, pool) combinations`
    );

    let createdCount = 0;
    for (const combo of userPoolCombos.values()) {
      const pool = await prisma.pool.findUnique({
        where: { name: combo.poolName },
      });

      if (!pool) {
        console.warn(
          `   ⚠ Pool "${combo.poolName}" not found - skipping PoolAuth for user ${combo.userId}`
        );
        continue;
      }

      const existingAuth = await prisma.poolAuth.findUnique({
        where: {
          poolId_userId: {
            poolId: pool.id,
            userId: combo.userId,
          },
        },
      });

      if (existingAuth) {
        console.log(
          `   ✓ PoolAuth already exists (pool: ${combo.poolName}, user: ${combo.userId})`
        );
        continue;
      }

      const poolAuth = await prisma.poolAuth.create({
        data: {
          poolId: pool.id,
          userId: combo.userId,
          authKey: combo.poolAuth,
        },
      });

      console.log(
        `   ✓ Created PoolAuth (pool: ${combo.poolName}, user: ${combo.userId}, miners: ${combo.minerNames.length})`
      );
      createdCount++;
      stats.poolAuthsCreated++;
    }

    console.log(`   Total PoolAuth created: ${createdCount}`);
  } catch (error) {
    const msg = `Error creating PoolAuth: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`   ✗ ${msg}`);
    stats.errors.push(msg);
  }
}

async function updateMinersWithPoolId() {
  console.log("\n⛓️ STEP 3: Updating Miners with poolId...");

  try {
    const miners = await prisma.miner.findMany({
      where: { isDeleted: false },
      include: {
        space: { select: { id: true, name: true } },
      },
    });

    console.log(`   Processing ${miners.length} miners...`);

    let updatedCount = 0;
    for (const miner of miners) {
      const pool = await prisma.pool.findUnique({
        where: { name: miner.space.name },
      });

      if (!pool) {
        console.warn(
          `   ⚠ Pool "${miner.space.name}" not found for miner "${miner.name}"`
        );
        continue;
      }

      if (miner.poolId === pool.id) {
        console.log(
          `   ○ Miner "${miner.name}" already has correct poolId`
        );
        continue;
      }

      await prisma.miner.update({
        where: { id: miner.id },
        data: { poolId: pool.id },
      });

      console.log(
        `   ✓ Updated miner "${miner.name}" with poolId ${pool.id}`
      );
      updatedCount++;
      stats.minersUpdated++;
    }

    console.log(`   Total miners updated: ${updatedCount}`);
  } catch (error) {
    const msg = `Error updating miners: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`   ✗ ${msg}`);
    stats.errors.push(msg);
  }
}

async function verifyDataIntegrity() {
  console.log("\n✅ STEP 4: Verifying data integrity...");

  try {
    const miners = await prisma.miner.findMany({
      where: { isDeleted: false },
    });

    console.log(`   Total miners: ${miners.length}`);

    const minersWithoutPoolId = miners.filter(m => !m.poolId);
    if (minersWithoutPoolId.length > 0) {
      const msg = `${minersWithoutPoolId.length} miners still missing poolId`;
      console.error(`   ✗ ${msg}`);
      stats.errors.push(msg);
    } else {
      console.log(`   ✓ All miners have poolId assigned`);
    }

    const poolAuths = await prisma.poolAuth.findMany();
    console.log(`   Total PoolAuths: ${poolAuths.length}`);

    const pools = await prisma.pool.findMany();
    console.log(`   Total Pools: ${pools.length}`);

    for (const pool of pools) {
      const poolMiners = await prisma.miner.count({
        where: { poolId: pool.id, isDeleted: false },
      });
      console.log(`   • Pool "${pool.name}": ${poolMiners} miners`);
    }
  } catch (error) {
    const msg = `Error verifying integrity: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`   ✗ ${msg}`);
    stats.errors.push(msg);
  }
}

async function main() {
  console.log("🚀 Starting pool schema migration...");
  console.log("Date:", new Date().toISOString());

  try {
    await createPoolsFromSpaces();
    await createPoolAuths();
    await updateMinersWithPoolId();
    await verifyDataIntegrity();

    console.log("\n📊 Migration Summary:");
    console.log(`   • Pools created: ${stats.poolsCreated}`);
    console.log(`   • PoolAuths created: ${stats.poolAuthsCreated}`);
    console.log(`   • Miners updated: ${stats.minersUpdated}`);
    console.log(`   • Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log("\n❌ Errors encountered:");
      for (const error of stats.errors) {
        console.log(`   - ${error}`);
      }
    } else {
      console.log("\n✅ Migration completed successfully!");
    }
  } catch (error) {
    console.error("❌ Fatal error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
