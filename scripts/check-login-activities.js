const { PrismaClient } = require('../src/generated/prisma')

const prisma = new PrismaClient()

async function checkLoginActivities() {
  try {
    // Get last 5 login attempts
    const activities = await prisma.userActivity.findMany({
      where: {
        type: 'LOGIN'
      },
      include: {
        user: {
          select: {
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    })

    console.log('\nLast 5 login attempts:')
    console.log('-------------------')
    activities.forEach(activity => {
      console.log(`Time: ${activity.createdAt}`)
      console.log(`User: ${activity.user.email}`)
      console.log(`IP: ${activity.ipAddress}`)
      console.log(`User Agent: ${activity.userAgent}`)
      console.log('-------------------')
    })

  } catch (error) {
    console.error('Error checking login activities:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkLoginActivities()