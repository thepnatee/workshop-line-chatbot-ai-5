import express, { Request, Response } from 'express'
import { LineEvent, Message } from '@/types/webhook'
import { beaconInsert } from '@/types/mongo'
import { insertDataBeacon } from '@/utils/mongo' // Adjust the import path as needed
import { reply } from '@/utils/line'

const router = express.Router()

router.post('/', async (request: Request, response: Response) => {
  try {
    const events: LineEvent[] = request.body.events

    if (!Array.isArray(events)) {
      console.error("Invalid payload: 'events' is not an array", request.body)
      response.status(400).send('Invalid payload')
      return
    }

    for (const event of events) {
      try {
        if (event.type === 'beacon') {
          switch (event.beacon?.type) {
            case 'enter':
              await handleEnterBeaconEvent(event)
              break
            default:
              console.warn(`Unhandled beacon type: ${event.beacon?.type}`)
          }
        }
      } catch (eventError) {
        console.error('Error handling event:', event, eventError)
      }
    }

    response.end()
  } catch (error) {
    console.error('Error processing webhook:', error)
    response.status(500).send('Internal Server Error')
  }
})

async function handleEnterBeaconEvent(event: LineEvent) {
  console.log('Beacon enter event detected:', event)
  // Add logic to handle the 'enter' beacon event
  // Example: Send a welcome message or log the event
  await reply(event.replyToken!, [
    {
      type: 'text',
      text: `📡 Welcome! You just entered the beacon zone (${event.beacon?.hwid}).`,
    } as Message,
  ])
}

router.post('/mongo', async (request: Request, response: Response) => {
  try {
    const events: LineEvent[] = request.body.events

    if (!Array.isArray(events)) {
      console.error("Invalid payload: 'events' is not an array", request.body)
      response.status(400).send('Invalid payload')
      return
    }
    var dt = new Date()
    for (const event of events) {
      if (event.type === 'beacon') {
        const beaconData = {
          userId: event.source.userId,
          hwid: event.beacon?.hwid,
          type: event.beacon?.type,
          timestamp: dt.toISOString(),
          year: dt.getFullYear(),
          month: dt.getMonth() + 1,
          day: dt.getDate(),
        } as beaconInsert

        try {
          const res = await insertDataBeacon(beaconData)
          if (res) {
            console.log('Beacon event inserted into MongoDB:', beaconData)
          } else {
            console.error('Failed to insert beacon event into MongoDB')
          }
          console.log('Beacon event saved to MongoDB:', beaconData)
        } catch (mongoError) {
          console.error('Error saving beacon event to MongoDB:', mongoError)
        }
      }
    }

    response.status(200).send('Events processed and saved to MongoDB')
  } catch (error) {
    console.error('Error processing /mongo request:', error)
    response.status(500).send('Internal Server Error')
  }
})
export default router
