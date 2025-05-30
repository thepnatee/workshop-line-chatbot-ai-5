import { GoogleGenAI, Type } from '@google/genai'
import { createBooking, getUserBookings, cancelBooking } from './mongo'
import { createBookingListFlex } from '@/messages/flex'

import { google } from 'googleapis'
import dotenv from 'dotenv'

dotenv.config()

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
)
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })

const geminiKey = process.env.GEMINI_API_KEY!
const genAI = new GoogleGenAI({ apiKey: geminiKey })

/**
 * สร้าง URL สำหรับ OAuth2 เพื่อขอสิทธิ์เข้าถึง Google Calendar
 * - ใช้สำหรับ redirect ผู้ใช้ไปยืนยันสิทธิ์กับ Google
 */
export async function oauth2(): Promise<string> {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent', // บังคับถาม refresh token ทุกครั้ง
  })
  return url
}

/**
 * รับ authorization code จาก Google แล้วแลกเป็น refresh token
 * - ใช้สำหรับเก็บ refresh token เพื่อใช้งาน Google Calendar API
 */
export async function oauth2GetToken(code: string): Promise<string> {
  const { tokens } = await oauth2Client.getToken(code)
  console.log('Access Token:', tokens.access_token)
  console.log('Refresh Token:', tokens.refresh_token)
  return tokens.refresh_token!
}

/**
 * ประมวลผลข้อมูลนัดหมายด้วย Gemini และสร้าง event ใน Google Calendar
 * - 1. สร้าง prompt และ function declaration สำหรับ Gemini
 * - 2. เรียก Gemini เพื่อให้ช่วยแปลงข้อมูลเป็นโครงสร้าง event
 * - 3. ถ้า Gemini ตอบกลับเป็น function call: สร้าง event ใน Google Calendar และบันทึกลง MongoDB
 * - 4. คืนลิงก์นัดหมาย หรือแจ้ง error

 */
export async function handleBookingGemini(
  userId: string,
  session: { title: string; date: string; time: string },
): Promise<string> {
  console.log('▶️ [handleBookingGeminiAdvance] Prepare to call Gemini', session)

  const prompt = `ช่วยสร้างนัดหมายหัวข้อ "${session.title}" ในวันที่ ${session.date} เวลา ${session.time}`

  const scheduleMeetingFunctionDeclaration = {
    name: 'create_calendar_event',
    description: "Create an event in the user's calendar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Title of the event' },
        date: { type: Type.STRING, description: 'Date of the event' },
        time: { type: Type.STRING, description: 'Time of the event' },
      },
      required: ['title', 'date', 'time'],
    },
  }

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: {
      tools: [
        {
          functionDeclarations: [scheduleMeetingFunctionDeclaration],
        },
      ],
    },
  })

  if (response.functionCalls && response.functionCalls.length > 0) {
    const functionCall = response.functionCalls[0]

    const args = functionCall.args as {
      title: string
      date: string
      time: string
    }

    const datetimeISO = new Date(`${args.date}T${args.time}:00`).toISOString()

    const event = await createCalendarEvent({
      title: args.title,
      date: datetimeISO,
    })
    await createBooking(userId, args.title, datetimeISO, event.id)

    return `✅ นัดหมายของคุณถูกสร้างเรียบร้อย! ดูรายละเอียดได้ที่: ${event.link}&openExternalBrowser=1`
  }

  return '❌ ไม่สามารถสร้างนัดหมายได้ค่ะ กรุณาลองใหม่อีกครั้งนะคะ'
}

/**
 * ดึงรายการนัดหมายทั้งหมดของผู้ใช้
 * - 1. ดึงข้อมูล booking จาก MongoDB
 * - 2. ถ้าไม่มีนัดหมาย คืนข้อความแจ้งเตือน
 * - 3. ถ้ามี คืน flex message รายการนัดหมาย
 */
export async function viewBookingList(userId: string) {
  const bookings = await getUserBookings(userId)

  console.log(bookings)

  if (bookings.length === 0) {
    return { type: 'text', message: '📅 คุณยังไม่มีนัดหมายในระบบค่ะ' }
  }

  return createBookingListFlex(bookings)
}

/**
 * สร้าง event ใหม่ใน Google Calendar (ไม่มี location)
 */
export async function createCalendarEvent({
  title,
  date,
}: {
  title: string
  date: string
}) {
  console.log('▶️ [calendarService] Creating calendar event:', { title, date })
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
  const event = {
    summary: title,
    start: {
      dateTime: date,
      timeZone: 'Asia/Bangkok',
    },
    end: {
      dateTime: new Date(new Date(date).getTime() + 60 * 60 * 1000).toISOString(),
      timeZone: 'Asia/Bangkok',
    },
  }

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
  })

  console.log('✅ [calendarService] Event Created:', response.data.htmlLink)
  return {
    id: response.data.id!,
    link: response.data.htmlLink!,
  }
}

/**
 * ยกเลิกนัดหมาย (ทั้งในระบบและ Google Calendar)
 * - 1. ยกเลิก booking ใน MongoDB
 * - 2. ถ้าพบ eventId ให้ลบ event ใน Google Calendar
 * - 3. คืนข้อความแจ้งผลลัพธ์
 */
export async function cancelBookingHandler(userId: string, eventId: string) {
  const booking = await cancelBooking(userId, eventId)
  console.log('booking_>', booking)

  if (!booking) {
    return { type: 'text', text: '❌ ไม่พบนัดหมายที่ต้องการยกเลิกค่ะ' }
  }

  if (eventId) {
    await deleteCalendarEvent(eventId)
  }

  return { type: 'text', text: 'ยกเลิกนัดหมายเรียบร้อยแล้วค่ะ' }
}

/**
 * ลบ event ออกจาก Google Calendar
 * - 1. เรียก Google Calendar API เพื่อลบ event ตาม eventId
 * - 2. ตรวจสอบ error กรณี event ถูกลบไปแล้ว
 */
export async function deleteCalendarEvent(eventId: string) {
  console.log('🛠 [calendarService] Deleting event:', eventId)

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    })
    console.log('✅ [calendarService] Event deleted successfully')
  } catch (error: any) {
    // ✅ ตรวจจับ Error จาก Google API
    if (error.errors && Array.isArray(error.errors)) {
      const firstError = error.errors[0]
      if (firstError.reason === 'deleted') {
        console.log('⚠️ [calendarService] Event already deleted. No action needed.')
        return
      }
    }

    // ถ้าไม่ใช่ 'deleted' ก็ throw error ปกติ
    console.error('❌ [calendarService] Error deleting event:', error)
    throw error
  }
}
