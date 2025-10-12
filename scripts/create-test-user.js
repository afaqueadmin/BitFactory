const { PrismaClient } = require("../src/generated/prisma");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    // Check if test user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: "admin@example.com" },
    });

    if (existingUser) {
      console.log("✅ Test user already exists!");
      console.log("Email: admin@example.com");
      console.log("Password: 123456");
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash("123456", 12);

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: "admin@example.com",
        name: "Test Admin",
        password: hashedPassword,
      },
    });

    console.log("🎉 Test user created successfully!");
    console.log("Email: admin@example.com");
    console.log("Password: 123456");
    console.log("User ID:", user.id);
  } catch (error) {
    console.error("❌ Error creating test user:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
