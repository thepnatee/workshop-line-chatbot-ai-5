import express, { Request, Response } from 'express'
import { LineEvent, Message } from '@/types/webhook'
import {
  reply,
  getContent,
  getExtension,
  getProfileByGroup,
  getProfileCache,
  isAnimationLoading,
  richmenuSetIndividual,
} from '@/utils/line'
import { saveImageToStorage } from '@/utils/firebase'
import {
  saveLineProfileToMongoDB,
  saveImageMetadataToMongoDB,
  upsertRegister,
  getMemberByUserId,
} from '@/utils/mongo'
import { welcomeRegister } from '@/messages/message'
import { Member } from '@/types/mongo'

const router = express.Router()

// =========================
//  MongoDB Route
// =========================

router.post('/', async (request: Request, response: Response) => {
  /*
    Step 1: Extract events from request
    Step 2: Validate events array
    Step 3: Loop through events
      - ถ้า event เป็น message: ดึง profile, save profile ลง MongoDB, และเรียก handleMessage
    Step 4: End the response
  */

  const events: LineEvent[] = request.body.events

  if (!Array.isArray(events)) {
    console.error("Invalid payload: 'events' is not an array", request.body)
    response.status(400).send('Invalid payload')
    return
  }

  for (const event of events) {
    if (event.type === 'message' && event.message) {
      const profile = await getProfileByGroup(event.source.groupId!, event.source.userId!)
      await saveLineProfileToMongoDB(profile)

      handleMessage(event.message, event.replyToken!, event.source.groupId!)
    }
  }

  response.end()
})

async function handleMessage(message: Message, replyToken: string, groupId: string): Promise<void> {
  /*
    Step 1: ตรวจสอบประเภทของ message
      - ถ้าเป็น image, video, audio, file:
        - ดึงไฟล์จาก LINE
        - ตรวจสอบนามสกุลไฟล์
        - ตอบกลับผู้ใช้
      - ถ้าเป็น text และข้อความคือ 'save':
        - ดึงไฟล์ที่ถูก quote
        - บันทึกไฟล์ลง storage
        - save metadata ลง MongoDB
        - ตอบกลับ URL ให้ผู้ใช้
    Step 2: กรณีอื่น ๆ log warning
  */

  switch (message.type) {
    case 'image':
    case 'video':
    case 'audio':
    case 'file':
      console.log('🖼️ Received Image Message with ID:', message.id)
      const buffer = await getContent(message.id)
      const extension = getExtension(message.fileName!, message.type!)

      console.log(`📦 Content size: ${buffer.length} bytes`)
      console.log(`📦 Extension: ${extension} bytes`)

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
      if (message.type === 'text' && message.text === 'save') {
        let id = message.quotedMessageId || message.id

        const buffer = await getContent(id)
        const extension = getExtension(message.fileName!, message.type!)
        const publicUrl = await saveImageToStorage(groupId, id, buffer, extension)
        console.log(`📦 Public URL: ${publicUrl}`)
        console.log(`📦 Content size: ${buffer.length} bytes`)
        console.log(`📦 Extension: ${extension} bytes`)
        console.log({
          groupId,
          messageId: id,
          type: message.type,
          size: buffer.length,
          timestamp: getCurrentDateTimeString(),
          url: publicUrl,
        })
        /* step uncomment*/
        // await saveImageMetadataToMongoDB({
        //   groupId,
        //   messageId: id,
        //   type: message.type,
        //   size: buffer.length,
        //   timestamp: getCurrentDateTimeString(),
        //   url: publicUrl,
        // })

         /* step uncomment*/
        // await reply(replyToken, [
        //   {
        //     type: 'text',
        //     text: `เราได้รับไฟล์ ${message.type} แล้ว ขนาด: ${buffer.length} bytes \n นามสกุล: ${extension} \n คุณสามารถดาวน์โหลดได้ที่: ${publicUrl}`,
        //     quoteToken: `${message.quoteToken}`,
        //   },
        // ])
      }

      break
  }
}

function getCurrentDateTimeString(): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()

  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

/* [POST] /mongo/authen
ฟังก์ชันนี้ใช้สำหรับจัดการ flow การลงทะเบียนและยืนยันตัวตนของสมาชิกในกลุ่ม LINE
- ถ้า event มาจาก user ที่ไม่ใช่ group จะเล่น animation loading
- ถ้า event เป็น follow: ตอบกลับข้อความต้อนรับการลงทะเบียน
- ถ้า event เป็น message (type=text):
  - ถ้ายังไม่เคยลงทะเบียน (ไม่มีข้อมูลใน MongoDB):
    - ถ้าพิมพ์ "ลงทะเบียน" จะตอบกลับให้กรอกเบอร์มือถือ
    - ถ้าพิมพ์เบอร์มือถือ (รูปแบบ 0xxxxxxxxx) จะบันทึกข้อมูลลงทะเบียน, set richmenu, และตอบกลับสำเร็จ
  - ถ้าลงทะเบียนแล้ว: ถ้าพิมพ์ "logout" จะเปลี่ยนสถานะเป็น Inactive, set richmenu guest
- กรณีอื่น ๆ จะ log warning
*/
router.post('/authen', async (request: Request, response: Response) => {
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

    if (event.type === 'follow') {
      const profile = await getProfileCache(event.source.userId!)
      await reply(event.replyToken!, [welcomeRegister(profile.displayName)])
    }
    if (event.type === 'message' && event.message) {
      switch (event.message.type) {
        case 'text':
          const memberProfile = await getMemberByUserId(event.source.userId!)
          if (!memberProfile) {
            const profile = await getProfileCache(event.source.userId!)
            if (event.message.text === 'ลงทะเบียน') {
              await reply(event.replyToken!, [
                {
                  type: 'text',
                  text:
                    'สวัสดีครับคุณ ' +
                    profile.displayName +
                    ' กรุณากรอกเบอร์มือถือ \nตัวอย่าง 0812345678',
                },
              ])
              break
            }

            // ตรวจสอบว่าเป็นเบอร์โทรศัพท์หรือไม่
            const phone = event.message.text?.trim()
            const isPhoneNumber = /^0\d{9}$/.test(phone!)

            console.log('phone: ', phone)
            console.log('isPhoneNumber: ', isPhoneNumber)

            if (isPhoneNumber) {
              // Noted: ตรวจสอบว่ามีการใช้เบอร์โทรนี้แล้วหรือไม่ หากมีแล้วจะไม่ลงทะเบียนซ้ำได้
              // TODO: ตรวจสอบว่ามีการใช้เบอร์โทรนี้แล้วหรือไม่
              // Homework

              const richmenu = process.env.RICH_MENU_MEMBER_ID

              let profileRegister = {
                ...profile,
                phoneNumber: phone,
                status: 'Active',
                richmenu: richmenu,
                createdAt: new Date(),
              } as Member

              await upsertRegister(profileRegister)
              await richmenuSetIndividual(event.source.userId!, richmenu!)

              await reply(event.replyToken!, [
                {
                  type: 'text',
                  text: `✅ ลงทะเบียนสำเร็จแล้วครับคุณ ${profile.displayName}`,
                },
              ])
            }
            break
          } else {
            if (event.message.text === 'logout') {
              const richmenu = process.env.RICH_MENU_GUEST_ID
              const memberProfile = await getMemberByUserId(event.source.userId!)
              let profileRegister = {
                ...memberProfile,
                status: 'Inactive',
                richmenu: richmenu,
                updatedAt: new Date(),
              } as Member

              await upsertRegister(profileRegister)
              await richmenuSetIndividual(event.source.userId!, richmenu!)
            }
          }

          break

        default:
          console.warn('⚠️ Unhandled message type:', event.message.type)

          break
      }
    }
  }

  response.end()
})

export default router
