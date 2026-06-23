import webpush from 'web-push'
import cron from 'node-cron'
import { prisma } from '../../config/database'
import { logger } from '../../shared/utils/logger'

export function startReminderScheduler() {
  const publicKey  = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email      = process.env.VAPID_EMAIL ?? 'mailto:nexus@nexus.ai'

  if (!publicKey || !privateKey) {
    logger.warn('VAPID keys not set — push notifications disabled')
    return
  }

  webpush.setVapidDetails(email, publicKey, privateKey)

  // Every minute: fire due reminders
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date()
      const due = await prisma.proactiveNotification.findMany({
        where: { seen: false, scheduledFor: { lte: now } },
        include: { user: { include: { pushSubscriptions: true } } },
        take: 50,
      })

      for (const notif of due) {
        // Mark seen immediately to avoid double-firing
        await prisma.proactiveNotification.update({
          where: { id: notif.id },
          data:  { seen: true },
        })

        const payload = JSON.stringify({
          title: '⏰ Nexus',
          body:  notif.message,
          icon:  '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag:   notif.id,
        })

        for (const sub of notif.user.pushSubscriptions) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            )
          } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              // Subscription expired — clean up
              await prisma.pushSubscription.delete({ where: { endpoint: sub.endpoint } })
            }
          }
        }
      }
    } catch (err) {
      logger.error('Reminder scheduler error', err)
    }
  })

  logger.info('Reminder scheduler started')
}
