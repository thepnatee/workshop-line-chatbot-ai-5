import express, { Request, Response } from 'express'
import { LineEvent } from '@/types/webhook'
import dotenv from 'dotenv'
import { getContent, reply } from '@/utils/line'
import {
  textOnly,
  multimodal,
  multiAudioTranslatemodal,
  chatWithGeminiSession,
} from '@/utils/gemini'
import { redisDel } from '@/utils/redis'

dotenv.config()

const router = express.Router()

// =========================
//  Gemini Route Handlers
// =========================

router.post('/', async (request: Request, response: Response) => {
  /*
    Step 1: รับ events จาก request
    Step 2: ตรวจสอบว่า events เป็น array
    Step 3: วนลูปแต่ละ event
      - ถ้าเป็นข้อความ (text): ส่งไป Gemini (textOnly)
      - ถ้าเป็นรูปภาพ (image): ดึงไฟล์ ส่งไป multimodal
      - ถ้าเป็นเสียง (audio): ดึงไฟล์ ส่งไป multiAudioTranslatemodal
      - อื่น ๆ: log
    Step 4: ตอบกลับและจบ response
  */

  const events: LineEvent[] = request.body.events

  if (!Array.isArray(events)) {
    console.error("Invalid payload: 'events' is not an array", request.body)
    response.status(400).send('Invalid payload')
    return
  }

  for (const event of events) {
    switch (event.type) {
      case 'message':
        switch (event.message?.type) {
          case 'text':
            const userText = event.message.text
            console.log('User sent text:', userText)
            const responseText = await textOnly(userText!)
            console.log('Gemini reply:', responseText)
            await reply(event.replyToken!, [{ type: 'text', text: responseText }])

            break

          case 'image':
            const imageBinary = await getContent(event.message.id)
            const messageImage = await multimodal(imageBinary)
            console.log('Gemini describe image:', messageImage)
            await reply(event.replyToken!, [{ type: 'text', text: messageImage }])
          // กรณีที่ผู้ใช้ส่งข้อความเสียง (audio)
          case 'audio':
            // ดึงข้อมูลไฟล์เสียงจาก LINE ด้วย message id
            const audioBinary = await getContent(event.message.id)

            // แสดง log ข้อมูล binary ของไฟล์เสียง
            console.log('Gemini process audio:', audioBinary)
            // ส่งไฟล์เสียงไปประมวลผล (เช่น แปลงเสียงเป็นข้อความหรือแปลภาษา)
            const messageAudio = await multiAudioTranslatemodal(audioBinary)

            // ส่งข้อความผลลัพธ์กลับไปหาผู้ใช้ผ่าน LINE
            await reply(event.replyToken!, [{ type: 'text', text: messageAudio }])
            break

          default:
            console.log('Unhandled message type:', event.message?.type)
            break
        }
        break

      default:
        console.log('Unhandled event:', event)
        break
    }
  }

  response.end()
})

router.post('/history', async (request: Request, response: Response) => {
  /*
    Step 1: รับ events จาก request
    Step 2: ตรวจสอบว่า events เป็น array
    Step 3: วนลูปแต่ละ event
      - ถ้า user ส่ง 'เริ่มใหม่' หรือ 'reset': ลบ session chat ใน Redis
      - กรณีอื่น: ส่งข้อความไป chatWithGeminiSession (multi-turn)
    Step 4: ตอบกลับและจบ response
  */

  const events: LineEvent[] = request.body.events

  if (!Array.isArray(events)) {
    console.error("Invalid payload: 'events' is not an array", request.body)
    response.status(400).send('Invalid payload')
    return
  }

  for (const event of events) {
    if (event.type === 'message' && event.message?.type === 'text') {
      const userText = event.message.text

      if (userText === 'เริ่มใหม่' || userText!.toLowerCase() === 'reset') {
        // ✅ User ขอ Reset Session
        const cacheKey = `session:chat:${event.source.userId!}`
        await redisDel(cacheKey)
        continue
      } else {

        console.log('User sent text:', userText)
        // ✅ User ส่งข้อความปกติ
        const message = await chatWithGeminiSession(event.source.userId!, userText!)
        console.log('Gemini reply:', reply)
        await reply(event.replyToken!, [{ type: 'text', text: message }])
      }
    }
  }

  response.end()
})

export default router
