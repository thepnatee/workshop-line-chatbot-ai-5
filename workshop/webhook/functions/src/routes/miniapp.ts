import {
  generateServiceNotificationToken,
  getProfileByLiffAccessToken,
  sendServiceMessage,
} from '@/utils/line'
import { getNotificationTokenByUserId, saveNotificationTokenToDatabase } from '@/utils/mongo'
import express from 'express'

const router = express.Router()

router.post('/register', async (req, res) => {
  const { headers } = req

  const liffAccessToken = headers['x-liff-access-token']
  if (!liffAccessToken) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const profile = await getProfileByLiffAccessToken(liffAccessToken)
  if (!profile) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const { notificationToken } = await generateServiceNotificationToken(liffAccessToken)

  const serviceMessageResult = await sendServiceMessage(notificationToken, 'join_d_m_th', {
    point: '100 พอยท์',
    btn1_url: 'https://line.me',
    btn2_url: 'https://line.me',
    btn3_url: 'https://line.me',
    btn4_url: 'https://line.me',
    entry_date: '31/03/2033 0:00 น. ',
    expiration: '10/10/2044 0:00 น. ',
    user_number: '11023',
  })

  await saveNotificationTokenToDatabase(profile.userId, serviceMessageResult)

  return res.json({ message: 'Register Successfully' })
})

router.post('/notify', async (req, res) => {
  const { headers } = req
  const liffAccessToken = headers['x-liff-access-token']
  if (!liffAccessToken) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  const profile = await getProfileByLiffAccessToken(liffAccessToken)
  if (!profile) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const { notificationToken } = await getNotificationTokenByUserId(profile.userId)

  const serviceMessageResult = await sendServiceMessage(notificationToken, 'join_d_m_th', {
    point: '100 พอยท์',
    btn1_url: 'https://line.me',
    btn2_url: 'https://line.me',
    btn3_url: 'https://line.me',
    btn4_url: 'https://line.me',
    entry_date: '31/03/2033 0:00 น. ',
    expiration: '10/10/2044 0:00 น. ',
    user_number: '11023',
  })

  await saveNotificationTokenToDatabase(profile.userId, serviceMessageResult)

  return res.json({ message: 'Notify Successfully' })
})

export default router
