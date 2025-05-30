import express, { Request, Response } from 'express'
import { broadcastConsumption, multicast, getProfile, pushWithStateless,pushWithCustomAggregation } from '@/utils/line'
import { BroadcastPayload, LineMessage, MulticastPayload } from '@/types/line'
import { flexProfile } from '@/messages/flex'
const router = express.Router()

// =========================
//  Message Routes
// =========================

router.post('/broadcast', async (request: Request, response: Response) => {
  /*
    Step 1: รับ payload และตรวจสอบความถูกต้อง
    Step 2: ส่งข้อความ broadcast หาก payload ถูกต้อง
    Step 3: จัดการ error และตอบกลับ
  */
  try {
    const payload: BroadcastPayload = request.body
    await broadcastConsumption(payload)
    return response.status(200).send('✅ Broadcast sent successfully')
  } catch (error: any) {
    console.error('❌ Error broadcasting message:', error.message || error)
    return response.status(500).send('Failed to send broadcast')
  }
})

router.post('/multicast', async (request: Request, response: Response) => {
  /*
    Step 1: รับ userId array จาก request body และ validate
    Step 2: แบ่ง userId เป็นกลุ่มย่อย (batch) ละ 500 คน
    Step 3: สร้างข้อความ flex message สำหรับส่ง
    Step 4: ส่งข้อความ multicast ทีละกลุ่ม
    Step 5: ตอบกลับเมื่อส่งครบ
  */
  const users: string[] = request.body.to
  if (!Array.isArray(users) || users.length === 0) {
    return response.status(400).send("Invalid or missing 'to' array")
  }

  const batchSize = 500
  const chunks: string[][] = []

  for (let i = 0; i < users.length; i += batchSize) {
    // Step 2: แบ่ง userId เป็นกลุ่มย่อย (batch)
    chunks.push(users.slice(i, i + batchSize))
  }

  const message: LineMessage = {
    type: 'flex',
    altText: '^^ vdo ^^',
    contents: {
      type: 'bubble',
      size: 'giga',
      hero: {
        type: 'video',
        url: 'https://workshop-ex10.s3.ap-southeast-1.amazonaws.com/vdo.mp4',
        previewUrl: 'https://workshop-ex10.s3.ap-southeast-1.amazonaws.com/preview.png',
        aspectRatio: '1280:720',
        altContent: {
          type: 'image',
          size: 'full',
          url: 'https://workshop-ex10.s3.ap-southeast-1.amazonaws.com/preview.png',
        },
      },
    },
  }

  for (const chunk of chunks) {
    // Step 4: ส่งข้อความ multicast ทีละกลุ่ม
    const payload: MulticastPayload = {
      to: chunk,
      messages: [message],
    }

    console.log(payload)
    await multicast(payload)
  }

  return response.status(200).send('✅ Multicast sent.')
})
router.post('/push', async (request: Request, response: Response) => {
  /*
    Step 1: รับ userId จาก request body และ validate
    Step 2: ดึง profile และสร้าง flex message
    Step 3: ส่ง push message
    Step 4: จัดการ error และตอบกลับ
  */
  const userId: string = request.body.to
  if (!userId) {
    return response.status(400).send("Missing 'to' userId")
  }

  try {
    const profile = await getProfile(userId)
    const flexMessage = flexProfile(profile.pictureUrl!, profile.displayName)

    await pushWithStateless(userId, [flexMessage])
    return response.status(200).send('✅ Push sent.')
  } catch (error: any) {
    console.error('❌ Push error:', error.message || error)
    return response.status(500).send('Failed to send push')
  }
})

router.post('/pushCampaign', async (request: Request, response: Response) => {
  /*
    Step 1: รับ userId จาก request body และ validate
    Step 2: สร้างข้อความ campaign message
    Step 3: ส่ง push message พร้อม custom aggregation
    Step 4: จัดการ error และตอบกลับ
  */
  const userId: string = request.body.to

  if (!userId) {
    return response.status(400).send("Missing 'to' userId")
  }

  try {
    const message = {
      type: 'text',
      text: '🎉 มาลองเล่น LINE Chatbot ได้ที่นี่เลย 👉 https://codelab.line.me/',
      sender: {
        name: 'Cony',
        iconUrl: 'https://line.me/conyprof',
      },
    }

    const payload = {
      to: userId,
      messages: [message],
      customAggregationUnits: ["new_item_message"],
    }

    await pushWithCustomAggregation(payload.to, payload.messages, payload.customAggregationUnits)
    return response.status(200).send('✅ Push sent.')
  } catch (error: any) {
    console.error('❌ Push error:', error.message || error)
    return response.status(500).send('Failed to send push')
  }
})

export default router
