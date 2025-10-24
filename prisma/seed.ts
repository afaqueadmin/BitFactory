import { PrismaClient } from '../src/generated/prisma';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    // Clear existing data
    await prisma.userActivity.deleteMany();
    await prisma.tokenBlacklist.deleteMany();
    await prisma.miner.deleteMany();
    await prisma.space.deleteMany();
    await prisma.user.deleteMany();

    // Create regular user
    const user = await prisma.user.create({
        data: {
            email: 'admin@example.com',
            password: await bcrypt.hash('123456', 10),
            name: 'Regular User',
            role: 'USER',
            city: 'Dubai',
            country: 'UAE'
        }
    });

    // Create admin user
    const adminUser = await prisma.user.create({
        data: {
            email: 'afaque@higgs.ae',
            password: await bcrypt.hash('AdminAhmedHiggs2025!', 10),
            name: 'Afaque Ahmed',
            role: 'ADMIN',
            city: 'Dubai',
            country: 'UAE'
        }
    });

    // Create spaces
    const space1 = await prisma.space.create({
        data: {
            name: 'Dubai Facility 1',
            location: 'Dubai, UAE',
            capacity: 100,
            powerCapacity: 1000.0, // 1000 kW
            status: 'AVAILABLE'
        }
    });

    const space2 = await prisma.space.create({
        data: {
            name: 'Dubai Facility 2',
            location: 'Dubai, UAE',
            capacity: 50,
            powerCapacity: 500.0, // 500 kW
            status: 'AVAILABLE'
        }
    });

    // Create miners
    await prisma.miner.create({
        data: {
            name: 'Antminer S19 XP',
            model: 'S19 XP',
            status: 'ACTIVE',
            powerUsage: 3.1, // 3.1 kW
            hashRate: 140.0, // 140 TH/s
            userId: user.id,
            spaceId: space1.id
        }
    });

    await prisma.miner.create({
        data: {
            name: 'Antminer S19j Pro',
            model: 'S19j Pro',
            status: 'ACTIVE',
            powerUsage: 3.0, // 3.0 kW
            hashRate: 110.0, // 110 TH/s
            userId: user.id,
            spaceId: space1.id
        }
    });

    await prisma.miner.create({
        data: {
            name: 'Whatsminer M50S',
            model: 'M50S',
            status: 'INACTIVE',
            powerUsage: 3.4, // 3.4 kW
            hashRate: 130.0, // 130 TH/s
            userId: user.id,
            spaceId: space2.id
        }
    });

    // Create some user activities
    await prisma.userActivity.create({
        data: {
            userId: user.id,
            type: 'LOGIN',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    console.log('Seed data created successfully');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });