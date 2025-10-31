const { PrismaClient } = require('../src/generated/prisma')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const userName: string = 'Hamza Najeeb'; // Replace this
const userEmail: string = 'hamza@example.com'; // Replace this
const userPassword: string = '123456'; // Replace this
async function createUser() {
    try {
        // Check if test user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: userEmail }
        })

        if (existingUser) {
            console.log('✅ User already exists!')
            console.log(`Email: ${userEmail}`)
            console.log(`Password: ${userPassword}`)
            return
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(userPassword, 12)

        // Create test user
        const user = await prisma.user.create({
            data: {
                email: userEmail,
                name: userName,
                password: hashedPassword
            }
        })

        console.log('🎉 User created successfully!')
        console.log(`Email: ${userEmail}`)
        console.log(`Password: ${userPassword}`)
        console.log('User ID:', user.id)

    } catch (error) {
        console.error('❌ Error creating user:', error)
    } finally {
        await prisma.$disconnect()
    }
}

createUser()