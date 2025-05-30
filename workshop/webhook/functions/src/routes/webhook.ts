/*
  Import Libraries
*/

import express from 'express'
import { LineEvent, Message } from '@/types/webhook'
import {
  reply,
  getProfile,
  getProfileCache,
  getContent,
  isAnimationLoading,
  validateLineSignature,
} from '@/utils/line'
import { service, bill, queue, booking, report, vdo } from '@/messages/flex'
import { postbackDate, welcomeMessage, welcomeBack } from '@/messages/message'

const router = express.Router()

// =========================
//  Webhook Main Route
// =========================

router.post('/', async (request, response) => {
  /*
    Step 1: Log the received events
    Step 2: Check if the events is an array
    Step 3: Loop through the events and handle each event type
    Step 4: Handle each event type (follow, unfollow, join, leave, memberJoined, memberLeft, message)
    Step 5: End the response
  */

  console.log('Received Request Headers:', JSON.stringify(request.headers))
  console.log('Received Events:', JSON.stringify(request.body.events))

  /*
    * Step 1: Log the received events
  */
  const events: LineEvent[] = request.body.events
  console.log('Received Events:', JSON.stringify(events))

  /*
    * Step 2: Check if the events is an array
  */

  if (!Array.isArray(events)) {
    console.error("Invalid payload: 'events' is not an array", request.body)
    response.status(400).send('Invalid payload')
    return
  }


  /*
    * Step 3: Loop through the events and handle each event type
  */

  for (const event of events) {

    /*
      * Step 4: Handle each event type
      * - follow
      * - unfollow
      * - join
      * - leave
      * - memberJoined
      * - memberLeft
      * - message
    */
    switch (event.type) {
      case 'follow':
        console.log('[follow] Event:', JSON.stringify(event))
        break
      case 'unfollow':
        console.log('[unfollow] Event:', JSON.stringify(event))
        break
      case 'join':
        console.log('[join] Event:', JSON.stringify(event))
        break
      case 'leave':
        console.log('[leave] Event:', JSON.stringify(event))
        break
      case 'memberJoined':
        console.log('[memberJoined] Event:', JSON.stringify(event))
        break
      case 'memberLeft':
        console.log('[memberLeft] Event:', JSON.stringify(event))
        break
      case 'message':
        console.log('[message] Event:', JSON.stringify(event))
        break
      default:
        console.log('[unknown] Event type:', event.type, event)
        break
    }
  }
  /*
    * Step 5: End the response
    * The LINE Platform sent a webhook to the bot server,
    * but the bot server didn't return a response within 2 seconds. 
    * For more information, see The reason is request_timeout section.
  */
  response.status(200).send('OK')
  return
})

// =========================
//  Webhook /receive Route
// =========================

router.post('/receive', async (request, response) => {
  /*
    Step 1: Extract events from request
    Step 2: Validate events array
    Step 3: Loop through events and handle 'message' and 'postback' types
    Step 4: End the response
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
      switch (event.type) {
     
      case 'message':
        await handleMessage(event.message!, event.replyToken!, event.source.userId!)
        break
      case 'postback':
        const date = event.postback?.data
      await reply(event.replyToken!, [postbackDate(date!)])
        break
      default:
        console.log('[unknown] Event type:', event.type, event)
        break
    }
  }

  response.end()
  return
})

// =========================
//  Webhook /profile Route
// =========================

router.post('/profile', async (request, response) => {
  /*
    Step 1: Extract events from request
    Step 2: Validate events array
    Step 3: Loop through events and handle 'follow' event
    Step 4: End the response
  */

  const events: LineEvent[] = request.body.events
  if (!Array.isArray(events)) {
    console.error("Invalid payload: 'events' is not an array", request.body)
    response.status(400).send('Invalid payload')
    return
  }

  for (const event of events) {
    if (event.type === 'follow') {
      const profile = await getProfile(event.source.userId!)
      const message = event.follow?.isUnblocked
        ? welcomeBack(profile.displayName)
        : welcomeMessage(profile.displayName)

      await reply(event.replyToken!, [message])
    }
  }
  response.end()
  return
})

// =========================
//  Webhook /signature Route
// =========================

router.post('/signature', async (request, response) => {
  /*
    Step 1: Log request headers and body
    Step 2: Validate LINE signature
    Step 3: End the response
  */


    /*
    Copy line 197-214 Import to postman

    curl --location 'https://c8c99a7f6dae.ngrok.app/demo-line-chatbot-workshop/asia-northeast1/api/webhook/signature' \
    --header 'Content-Type: application/json' \
    --data '{
      "destination": "Ud2117845b3c428bf20c0beae43835bfc",
      "events": [
        {
          "type": "message",
          "message": [],
          "webhookEventId": "01JWD9EX2K26V548ZJZ69H9ZEH",
          "deliveryContext": [],
          "timestamp": 1748497822608,
          "source": [],
          "replyToken": "9220c7d53d644e74a26500841912757b",
          "mode": "active"
        }
      ]
      }
    '
    
    */

  console.log('Received Request Headers:', JSON.stringify(request.headers))
  console.log('Received Request Body:', request.body)

  const rawBody = (request as any).rawBody
  const signature = request.headers['x-line-signature'] as string

  if (!validateLineSignature(rawBody, signature)) {
    response.status(401).send('Invalid signature')
    return
  }

  console.log('Signature validated successfully.')
  response.end()
  return
})

// =========================
//  Handle Message Function
// =========================

/**
 * handleMessage
 * ฟังก์ชันนี้ใช้จัดการข้อความที่ได้รับจาก LINE Messaging API
 * - รองรับข้อความประเภท: text, image, video, audio, file, location, sticker
 * - สามารถขยาย logic เพิ่มเติมได้ตามต้องการ
 *
 * ตัวอย่าง:
 * - ถ้าได้รับข้อความ text จะ reply กลับด้วยเนื้อหาข้อความนั้น
 * - ถ้าได้รับ location จะ reply กลับด้วยข้อความและพิกัด
 * - ถ้าได้รับ sticker จะ reply กลับด้วย sticker อื่น
 */
async function handleMessage(message: Message, replyToken: string, userId: string): Promise<void> {
  /*
    Step 1: Switch by message type (text, image, video, audio, file, location, sticker)
    Step 2: Handle each message type accordingly
  */

  switch (message.type) {
    case 'text':

      /*step remove this function reply line234-240*/
      await reply(replyToken, [
        {
          type: 'text',
          text: `${JSON.stringify(message)}`,
          quoteToken: `${message.quoteToken}`,
        },
      ])


      /* Step Uncomment line 245-351 the following lines to handle specific text commands */
      
      // if (message.text === 'profile') {
      //   const profile = await getProfile(userId)
      //   console.log('🙋‍♂️ User Profile:', profile)

      //   await reply(replyToken, [
      //     {
      //       type: 'text',
      //       text: 'สวัสดีครับคุณ ' + profile.displayName,
      //     },
      //   ])
      // } else if (message.text === 'menu') {
      //   await reply(replyToken, [
      //     {
      //       type: 'text',
      //       text: 'Select your favorite food category or send me your location!',
      //       quickReply: {
      //         items: [
      //           {
      //             type: 'action',
      //             imageUrl: 'https://example.com/sushi.png',
      //             action: {
      //               type: 'message',
      //               label: 'Sushi',
      //               text: 'Sushi',
      //             },
      //           },
      //           {
      //             type: 'action',
      //             imageUrl: 'https://example.com/sushi.png',
      //             action: {
      //               type: 'postback',
      //               label: 'Postback',
      //               data: 'action=buy&itemid=111',
      //               text: 'Buy',
      //             },
      //           },
      //           {
      //             type: 'action',
      //             action: {
      //               type: 'camera',
      //               label: 'Camera',
      //             },
      //           },
      //           {
      //             type: 'action',
      //             action: {
      //               type: 'cameraRoll',
      //               label: 'Camera Roll',
      //             },
      //           },
      //           {
      //             type: 'action',
      //             action: {
      //               type: 'location',
      //               label: 'Send location',
      //             },
      //           },
      //           {
      //             type: 'action',
      //             action: {
      //               type: 'uri',
      //               label: 'Phone order',
      //               uri: 'tel:00000000',
      //             },
      //           },
      //           {
      //             type: 'action',
      //             action: {
      //               type: 'uri',
      //               label: 'Recommend to friends',
      //               uri: 'https://line.me/R/nv/recommendOA/@linedevelopers',
      //             },
      //           },
      //         ],
      //       },
      //     },
      //   ])
      // } else if (message.text === 'service') {
      //   await reply(replyToken, [service()])
      // } else if (message.text === 'bill') {
      //   await reply(replyToken, [bill()])
      // } else if (message.text === 'queue') {
      //   await reply(replyToken, [queue()])
      // } else if (message.text === 'booking') {
      //   await reply(replyToken, [booking()])
      // } else if (message.text === 'report') {
      //   await reply(replyToken, [report()])
      // } else if (message.text === 'vdo') {
      //   await reply(replyToken, [vdo()])
      // } else if (message.text === 'profile2') {
      //   const profile = await getProfileCache(userId)
      //   console.log('🙋‍♂️ User Profile2:', profile)
      //   await reply(replyToken, [
      //     {
      //       type: 'text',
      //       text: 'สวัสดีครับคุณ ' + profile.displayName,
      //     },
      //   ])
      // } else {
      //   await reply(replyToken, [
      //     {
      //       type: 'text',
      //       text: `${JSON.stringify(message)}`,
      //       quoteToken: `${message.quoteToken}`,
      //     },
      //   ])
      // }
      break

    case 'image':
      console.log('🖼️ Received Image Message with ID:', message.id)
      const buffer = await getContent(message.id)
      console.log(`📦 Content size: ${buffer.length} bytes`)
      await reply(replyToken, [
        {
          type: 'text',
          text: `เราได้รับไฟล์ ${message.type} แล้ว ขนาด: ${buffer.length} bytes`,
        },
      ])
      break

    case 'video':
      console.log('🎥 Received Video Message with ID:', message.id, '| Duration:', message.duration)
      break

    case 'audio':
      console.log('🔊 Received Audio Message with ID:', message.id, '| Duration:', message.duration)
      break

    case 'file':
      console.log('📁 Received File Message:', message.fileName, '| Size:', message.fileSize)
      break

    case 'location':
      // ตอบกลับด้วยข้อความและข้อมูล location ที่ได้รับ
      await reply(replyToken, [
        {
          type: 'location',
          title: message.title || 'ตำแหน่งที่คุณส่งมา',
          address: message.address || 'ไม่ระบุที่อยู่',
          latitude: message.latitude,
          longitude: message.longitude,
        },
        {
          type: 'text',
          text: `ได้รับ location: ${message.title || ''} (${message.latitude}, ${message.longitude})`,
        },
      ])
      break

    case 'sticker':
      // ตอบกลับด้วย sticker (ตัวอย่าง: ส่ง sticker หมายเลข 52002745)
      // ref https://developers.line.biz/en/docs/messaging-api/sticker-list/#send-sticker
      await reply(replyToken, [
        {
          type: 'sticker',
          packageId: '11537',
          stickerId: '52002745',
        },
        {
          type: 'text',
          text: `ได้รับสติกเกอร์ packageId: ${message.packageId}, stickerId: ${message.stickerId}`,
        },
      ])
      break

    default:
      console.warn('⚠️ Unhandled message type:', message.type)
      break
  }
}

export default router
