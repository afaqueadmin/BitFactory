const { PrismaClient } = require('../src/generated/prisma')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const users = [
  {
    email: 'admin@example.com',
    password: '123456',
    name: 'Test Admin',
    role: 'CLIENT'
  },
  {
    email: 'afaque@higgs.ae',
    password: 'AdminAhmedHiggs2025!',
    name: 'Afaque Ahmed',
    role: 'ADMIN'
  }
]

async function createTestUsers() {
  try {
    for (const userData of users) {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email }
      })

      if (existingUser) {
        console.log(`✅ User ${userData.email} already exists!`)
        console.log(`Email: ${userData.email}`)
        console.log(`Password: ${userData.password}`)
        console.log('---')
        continue
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(userData.password, 12)

      // Create user
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          name: userData.name,
          password: hashedPassword,
          role: userData.role
        }
      })

      console.log(`🎉 User created successfully!`)
      console.log(`Email: ${userData.email}`)
      console.log(`Password: ${userData.password}`)
      console.log(`Role: ${userData.role}`)
      console.log(`User ID: ${user.id}`)
      console.log('---')
    }

  } catch (error) {
    console.error('❌ Error creating users:', error)
  } finally {
    await prisma.$disconnect()
  }
}

createTestUsers()