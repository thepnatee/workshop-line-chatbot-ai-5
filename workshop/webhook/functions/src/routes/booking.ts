import express, { Request, Response } from 'express'
import { LineEvent } from '@/types/webhook'
import dotenv from 'dotenv'
import { reply, isAnimationLoading } from '@/utils/line'
import { handleBookingGemini } from '@/utils/booking'
import { redisGet, redisSet, redisDel } from '@/utils/redis'

import { oauth2, oauth2GetToken, viewBookingList, cancelBookingHandler } from '@/utils/booking'

dotenv.config()

const router = express.Router()

// =========================
//  Booking Route Handlers
// =========================

router.post('/', async (request: Request, response: Response) => {
  /*
    Step 1: รับ events จาก request
    Step 2: ตรวจสอบว่า events เป็น array
    Step 3: วนลูปแต่ละ event
      - ถ้าไม่ใช่ group: แสดง animation loading
      - ถ้าเป็นข้อความ (message):
        - ถ้าข้อความมี 'ดูนัด' เรียกดูรายการนัดหมาย
        - ถ้าข้อความมี 'ยกเลิกนัดหมาย' แยก eventId และยกเลิกนัดหมาย
        - กรณีอื่น ๆ: เข้าสู่ flow การจองนัดหมาย (handleBooking)
      - ถ้าเป็น postback:
        - action=selectDate: บันทึกวันที่ที่เลือกและถามเวลาต่อ
        - action=selectTime: บันทึกเวลาที่เลือกและถามหัวข้อ
    Step 4: ตอบกลับและจบ response
  */

  const events: LineEvent[] = request.body.events

  if (!Array.isArray(events)) {
    console.error("Invalid payload: 'events' is not an array", request.body)
    response.status(400).send('Invalid payload')
    return
  }

  for (const event of events) {
    if (event.source.type !== 'group') {
      await isAnimationLoading(event.source.userId!)
    }
    if (event.type === 'message' && event.message?.type === 'text') {
      const userId = event.source.userId
      const userText = event.message.text
      if (event.type === 'message' && event.message.type === 'text') {
        if (userText!.includes('ดูนัด')) {
          const message = await viewBookingList(userId!)
          await reply(event.replyToken!, [message])
        } else if (userText!.includes('ยกเลิกนัดหมาย')) {
          const parts = userText!.split(' ')
          const eventId = parts[1]

          if (!eventId) {
            await reply(event.replyToken!, [
              { type: 'text', text: 'กรุณาระบุรหัสนัดหมายที่จะยกเลิกค่ะ' },
            ])
          } else {
            const message = await cancelBookingHandler(userId!, eventId)
            await reply(event.replyToken!, [message])
          }
        } else {
          await handleBooking(userId!, event.replyToken!, userText!)
        }
      }
    }

    if (event.type === 'postback') {
      const userId = event.source.userId
      const data = event.postback!.data
      const params = new URLSearchParams(data)
      const action = params.get('action')

      if (action === 'selectDate') {
        const selectedDate = event.postback!.params?.date
        await saveSelectedDate(userId!, selectedDate!)
        await reply(event.replyToken!, [
          {
            type: 'text',
            text: `✅ เลือกวันที่ ${selectedDate} เรียบร้อยค่ะ! กรุณาเลือกเวลา...`,
            quickReply: {
              items: [
                {
                  type: 'action',
                  action: {
                    type: 'datetimepicker',
                    label: 'เลือกเวลา',
                    data: 'action=selectTime',
                    mode: 'time',
                  },
                },
              ],
            },
          },
        ])
      }

      if (action === 'selectTime') {
        const selectedTime = event.postback!.params?.time
        await saveSelectedTime(userId!, selectedTime!)
        await reply(event.replyToken!, [
          {
            type: 'text',
            text: `✅ เลือกเวลา ${selectedTime} เรียบร้อยค่ะ! กรุณาพิมพ์หัวข้อนัดหมายค่ะ`,
          },
        ])
      }
    }
  }

  response.end()
})

/**
 * จัดการ flow การจองนัดหมายแบบ step-by-step ด้วย session ใน Redis
 * - ถ้าเริ่มต้นใหม่: รอให้ผู้ใช้เลือก 'จองนัด' หรือ 'ดูนัด'
 * - ถามวัน/เวลา/หัวข้อ/สถานที่/ยืนยัน ตามลำดับ
 * - เมื่อยืนยัน: เรียก handleBookingGemini เพื่อสร้างนัดหมายจริง
 * - หากยกเลิก: ลบ session และแจ้งยกเลิก
 * - หากผิดพลาด: ลบ session และแจ้งให้เริ่มใหม่
 */
export async function handleBooking(userId: string, replyToken: string, userInput: string) {
  const cacheKey = `session:booking:${userId}`
  const cacheTTL = 60 * 5

  let sessionStr = await redisGet(cacheKey)
  let session = sessionStr ? JSON.parse(sessionStr) : null

  if (!session) {
    if (userInput.includes('จองนัด')) {
      await redisSet(cacheKey, JSON.stringify({ step: 'ask_date' }), cacheTTL)
      await reply(replyToken, [
        {
          type: 'text',
          text: '🗓️ กรุณาเลือกวันนัดหมายค่ะ',
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'datetimepicker',
                  label: 'เลือกวัน',
                  data: 'action=selectDate',
                  mode: 'date',
                },
              },
            ],
          },
        },
      ])
      return
    } else {
      await reply(replyToken, [
        {
          type: 'text',
          text: "กรุณากด 'จองนัด' หรือ 'ดูนัด' ด้านล่างค่ะ",
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: '📝 จองนัด',
                  text: 'จองนัด',
                },
              },
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: '📅 ดูนัด',
                  text: 'ดูนัด',
                },
              },
            ],
          },
        },
      ])
      return
    }
  }

  switch (session.step) {
    case 'ask_time':
      await redisSet(
        cacheKey,
        JSON.stringify({ ...session, step: 'ask_title', time: userInput }),
        cacheTTL,
      )
      await reply(replyToken, [{ type: 'text', text: '📝 กรุณาพิมพ์หัวข้อนัดหมายค่ะ' }])
      break

    case 'ask_title':
      await redisSet(
        cacheKey,
        JSON.stringify({ ...session, step: 'confirm', title: userInput }),
        cacheTTL,
      )
      await reply(replyToken, [
        {
          type: 'text',
          text: `✅ กรุณายืนยันนัดหมาย:\n\nเรื่อง: ${userInput}\nวัน: ${session.date}\nเวลา: ${session.time}\n\nพิมพ์ 'ยืนยัน' หรือ 'ยกเลิก' ค่ะ`,
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: 'ยืนยัน',
                  text: 'ยืนยัน',
                },
              },
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: 'ยกเลิก',
                  text: 'ยกเลิก',
                },
              },
            ],
          },
        },
      ])
      break

    case 'confirm':
      if (userInput.includes('ยืนยัน')) {
        // ส่ง session โดยไม่มี location
        const message = await handleBookingGemini(userId, {
          title: session.title,
          date: session.date,
          time: session.time,
        })
        await redisDel(cacheKey)
        await reply(replyToken, [
          {
            type: 'text',
            text: message,
            quickReply: {
              items: [
                {
                  type: 'action',
                  action: {
                    type: 'message',
                    label: 'ดูนัดหมาย',
                    text: 'ดูนัดหมาย',
                  },
                },
              ],
            },
          },
        ])
      } else if (userInput.includes('ยกเลิก')) {
        await redisDel(cacheKey)
        await reply(replyToken, [{ type: 'text', text: '❌ ยกเลิกการจองเรียบร้อยแล้วค่ะ' }])
      } else {
        await reply(replyToken, [
          { type: 'text', text: "⚠️ กรุณาพิมพ์ 'ยืนยัน' หรือ 'ยกเลิก' ค่ะ" },
        ])
      }
      break

    default:
      await redisDel(cacheKey)
      await reply(replyToken, [
        { type: 'text', text: "⚠️ มีข้อผิดพลาด กรุณาพิมพ์ 'จองนัด' เพื่อเริ่มต้นใหม่ค่ะ" },
      ])
      break
  }
}

/**
 * บันทึกวันที่ที่ผู้ใช้เลือกลง session (Redis)
 * - ใช้ใน postback action=selectDate
 */
export async function saveSelectedDate(userId: string, date: string) {
  const cacheKey = `session:booking:${userId}`
  let sessionStr = await redisGet(cacheKey)
  let session = sessionStr ? JSON.parse(sessionStr) : {}

  session.date = date
  session.step = 'ask_time'
  await redisSet(cacheKey, JSON.stringify(session), 300)
}

/**
 * บันทึกเวลาที่ผู้ใช้เลือกลง session (Redis)
 * - ใช้ใน postback action=selectTime
 */
export async function saveSelectedTime(userId: string, time: string) {
  const cacheKey = `session:booking:${userId}`
  let sessionStr = await redisGet(cacheKey)
  let session = sessionStr ? JSON.parse(sessionStr) : {}

  session.time = time
  session.step = 'ask_title'
  await redisSet(cacheKey, JSON.stringify(session), 300)
}

// =========================
//  OAuth2 Callback Handlers
// =========================

router.get('/auth', async (request: Request, response: Response) => {
  /*
    Step 1: สร้าง URL สำหรับ OAuth2 เพื่อขอสิทธิ์ Google Calendar
    Step 2: redirect ผู้ใช้ไปยัง Google
  */
  const url = await oauth2()
  return response.redirect(url)
})

router.get('/oauth2callback', async (request: Request, response: Response) => {
  /*
    Step 1: รับ code จาก query
    Step 2: แลก code เป็น refresh token
    Step 3: แสดง refresh token ให้ผู้ใช้เก็บ
  */
  const code = request.query.code as string
  if (!code) {
    return response.status(400).send('Missing code')
  }

  try {
    const refresh_token = await oauth2GetToken(code)
    return response.send(`
        <h1>เรียบร้อย!</h1>
        <p><strong>Refresh Token:</strong></p>
        <pre>${refresh_token}</pre>
        <p>เอา refresh token นี้ไปเก็บใน .env ได้เลย ✅</p>
      `)
  } catch (error) {
    console.error('Error getting token:', error)
    return response.status(500).send('Error getting token')
  }
})

export default router
