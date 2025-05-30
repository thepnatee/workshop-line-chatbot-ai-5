import express, { Request, Response } from 'express'
import { LineEvent } from '@/types/webhook'
import { reply, getContent, getExtension } from '@/utils/line'
import { saveImageToStorage } from '@/utils/firebase'

const router = express.Router()

// =========================
//  Storage Route
// =========================

router.post('/', async (request: Request, response: Response) => {
  /*
    Step 1: Extract events from request
    Step 2: Validate events array
    Step 3: Loop through events and handle 'message' type
      - If message type is image, video, audio, or file: download, save, and reply
      - If message type is text and text is 'save': save quoted file and reply with public URL
    Step 4: End the response
  */

  const events: LineEvent[] = request.body.events

  if (!Array.isArray(events)) {
    console.error("Invalid payload: 'events' is not an array", request.body)
    response.status(400).send('Invalid payload')
    return
  }

  for (const event of events) {
    /*
      Step 3.1: ตรวจสอบว่า event เป็นประเภท 'message' และมีข้อมูล message
      Step 3.2: แยกข้อมูล message, replyToken, groupId
      Step 3.3: ตรวจสอบประเภทของ message
        - ถ้าเป็น image, video, audio, file: ดึงไฟล์, บันทึก, ตอบกลับ
        - ถ้าเป็น text และข้อความคือ 'save': ดึงไฟล์ที่ถูก quote, บันทึก, ตอบกลับ URL
    */


    if (event.type === 'message' && event.message) {
      const message = event.message
      const replyToken = event.replyToken!
      switch (message.type) {
        case 'image':
        case 'video':
        case 'audio':
        case 'file': 
          // Step 3.3.1: กรณีรับไฟล์สื่อ (image, video, audio, file)
          // - ดึงไฟล์จาก LINE
          // - ตรวจสอบนามสกุลไฟล์
          // - บันทึกไฟล์ลง storage
          // - ตอบกลับผู้ใช้
          console.log('Received Image Message with ID:', message.id)
          const buffer = await getContent(message.id)
          const extension = getExtension(message.fileName!, message.type!)

          console.log(`Content size: ${buffer.length} bytes`)
          console.log(`Extension: ${extension} bytes`)

          if (message.imageSet) {
            message.id = message.id + '_' + message.imageSet.id.toString()
          }

          await reply(replyToken, [
            {
              type: 'text',
              text: `เราได้รับไฟล์ ${message.type} แล้ว ขนาด: ${buffer.length} bytes \n นามสกุล: ${extension} \n หากต้องการบันทึกไฟล์เพิ่มเติม กรุณาส่งข้อความ "save" ด้วย reply รูป`,
              quoteToken: `${message.quoteToken}`,
            },
          ])
          break

        default: 
          // Step 3.3.2: กรณีข้อความเป็น 'save'
          // - ดึงไฟล์ที่ถูก quote
          // - บันทึกไฟล์ลง storage
          // - ตอบกลับ URL ให้ผู้ใช้
          if (message.type === 'text' && message.text === 'save') {
            let id = message.quotedMessageId || message.id

            const buffer = await getContent(id)
            const extension = getExtension(message.fileName!, message.type!)
            const publicUrl = await saveImageToStorage(id, id, buffer, extension)
            await reply(replyToken, [
              {
                type: 'text',
                text: `เราได้รับไฟล์ ${message.type} แล้ว ขนาด: ${buffer.length} bytes \n นามสกุล: ${extension} \n คุณสามารถดาวน์โหลดได้ที่: ${publicUrl}`,
                quoteToken: `${message.quoteToken}`,
              },
            ])
          }
          break
        
      }
    }
  }

  response.end()
})

export default router
