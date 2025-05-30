import express, { Request, Response } from 'express'
import { LineEvent } from '@/types/webhook'
import { reply,validateLineSignature } from '@/utils/line'

const router = express.Router()

// =========================
//  Mention Route Handler
// =========================

router.post('/', async (request: Request, response: Response) => {
  /*
    Step 1: รับ events และ rawBody, signature จาก request
    Step 2: ตรวจสอบ LINE signature
    Step 3: ตรวจสอบว่า events เป็น array
    Step 4: วนลูปจัดการแต่ละ event
      - join: bot ถูกเชิญเข้าห้อง → handleJoinEvent
      - memberJoined: สมาชิกใหม่เข้าห้อง → handleMemberJoinedEvent
      - message: มีข้อความใหม่ (type=text) → handleMessageEvent
      - อื่น ๆ: log warning
    Step 5: ตอบกลับและจบ response
  */

    const events: LineEvent[] = request.body.events

      const rawBody = (request as any).rawBody
      const signature = request.headers['x-line-signature'] as string
    
      if (!validateLineSignature(rawBody, signature)) {
        response.status(401).send('Invalid signature')
        return
      }

    if (!Array.isArray(events)) {
      console.error("Invalid payload: 'events' is not an array", request.body)
      response.status(400).send('Invalid payload')
    }

    // วนลูปจัดการแต่ละ event
    for (const event of events) {
      switch (event.type) {
        case 'join':
          // กรณี bot ถูกเชิญเข้าห้อง
          await handleJoinEvent(event)
          break
        case 'memberJoined':
          // กรณีมีสมาชิกใหม่เข้าห้อง
          await handleMemberJoinedEvent(event)
          break
        case 'message':
          // กรณีมีข้อความใหม่
          if (event.message?.type === 'text') {
            await handleMessageEvent(event)
          }
          break
        default:
          // กรณี event type อื่น ๆ ที่ไม่ได้จัดการ
          console.warn(`Unhandled event type: ${event.type}`)
           break
      }
    }

    response.end()
 
})

// ฟังก์ชันตอบกลับเมื่อ bot ถูกเชิญเข้าห้อง
// - ส่งข้อความทักทายและ quick reply สำหรับ add friend หรือ share OA
async function handleJoinEvent(event: LineEvent) {
  await reply(event.replyToken!, [
    {
      type: 'text',
      text: 'สวัสดีทุกคน',
      sender: {
        name: 'BOT',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/10176/10176915.png',
      },
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'uri',
              label: 'add friend',
              uri: 'https://line.me/R/ti/p/@850dydcg',
            },
          },
          {
            type: 'action',
            action: {
              type: 'uri',
              label: 'share',
              uri: 'https://line.me/R/nv/recommendOA/@850dydcg',
            },
          },
        ],
      },
    },
  ])
}

// ฟังก์ชันตอบกลับเมื่อมีสมาชิกใหม่เข้าห้อง
// - mention สมาชิกใหม่, ใส่ emoji, mention @everyone, quick reply ทักทาย
async function handleMemberJoinedEvent(event: LineEvent) {
  for (const member of event.joined?.members || []) {
    if (member.type === 'user') {
      await reply(event.replyToken!, [
        {
          type: 'textV2',
          text: 'สวัสดีคุณ {user1}! ยินดีต้อนรับ {emoji1} \n ทุกคน {everyone} มีเพื่อนใหม่เข้ามาอย่าลืมทักทายกันนะ!',
          substitution: {
            user1: {
              type: 'mention',
              mentionee: {
                type: 'user',
                userId: member.userId,
              },
            },
            emoji1: {
              type: 'emoji',
              productId: '5ac2280f031a6752fb806d65',
              emojiId: '001',
            },
            everyone: {
              type: 'mention',
              mentionee: {
                type: 'all',
              },
            },
          },
          quickReply: {
            items: [
              {
                type: 'action',
                action: {
                  type: 'message',
                  label: 'ทักทาย',
                  text: 'สวัสดีจ้า {user1}',
                },
              },
            ],
          },
        },
      ])
    }
  }
}

// ฟังก์ชันตอบกลับเมื่อถูก mention หรือ mention @everyone
// - ถ้ามี mention ถึง bot หรือ @everyone จะตอบกลับ mention ผู้ส่ง
async function handleMessageEvent(event: LineEvent) {
  const mentionees = event.message?.mention?.mentionees || []
  let message = 'ว่ายังไงครับ ถามได้เลย {user1}'
  for (const mentionee of mentionees) {


    if (mentionee.type === 'all'){
      message = 'ว่ายังไงครับ ถามได้เลยทุกคน'
    }

    if (mentionee.isSelf || mentionee.type === 'all') {
      await reply(event.replyToken!, [
        {
          type: 'textV2',
          text: message,
          quoteToken: event.message?.quoteToken,
          substitution: {
            user1: {
              type: 'mention',
              mentionee: {
                type: 'user',
                userId: event.source.userId!,
              },
            },
          },
        },
      ])
    }
  }
}

// ส่งออก router เพื่อใช้งานในไฟล์หลัก
export default router
