import { MongoClient } from 'mongodb'
import { ImageMetadata, answerInsert } from '@/types/mongo'
import { LineProfile, ServiceNotificationTokenResponse } from '@/types/line'
import { Booking } from '@/types/gemini'
import { Member, beaconInsert } from '@/types/mongo'

import dotenv from 'dotenv'

dotenv.config()

const url = process.env.MONGODB_URI!
const client = new MongoClient(url)
const db = client.db('developer')
/** ✅ เปิดการเชื่อมต่อ MongoDB */
export async function connectDB(): Promise<void> {
  /**
   * เปิดการเชื่อมต่อ MongoDB
   * - ใช้สำหรับเชื่อมต่อฐานข้อมูลก่อนใช้งานทุกครั้ง
   * - Limitation: ควรปิดการเชื่อมต่อหลังใช้งานเสมอเพื่อป้องกัน connection leak
   */
  try {
    await client.connect()
    console.log('✅ MongoDB Connected Successfully')
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error)
  }
}

export async function saveLineProfileToMongoDB(profile: LineProfile): Promise<void> {
  /**
   * บันทึกหรืออัปเดตโปรไฟล์ LINE ลง MongoDB
   * - ใช้สำหรับเก็บข้อมูลโปรไฟล์ผู้ใช้ LINE
   * - Limitation: upsert ตาม userId
   */
  await connectDB()
  const collection = db.collection('line_profiles')
  await collection.updateOne({ userId: profile.userId }, { $set: profile }, { upsert: true })
  await disconnectDB()
}

export async function saveImageMetadataToMongoDB(data: ImageMetadata): Promise<void> {
  /**
   * บันทึกหรืออัปเดต metadata ของไฟล์รูป/ไฟล์สื่อ ลง MongoDB
   * - ใช้สำหรับเก็บข้อมูลไฟล์ที่ผู้ใช้ส่งมา
   * - Limitation: upsert ตาม messageId
   */
  await connectDB()
  const collection = db.collection('images')
  await collection.updateOne({ messageId: data.messageId }, { $set: data }, { upsert: true })
  await disconnectDB()
}

export async function upsertRegister(profile: Member): Promise<void> {
  /**
   * upsert ข้อมูลสมาชิก (Member) สำหรับการลงทะเบียน/อัปเดตสถานะ
   * - ใช้สำหรับ flow ลงทะเบียน/เปลี่ยนสถานะสมาชิก
   * - Limitation: upsert ตาม userId และ status: 'Active'
   */
  await connectDB()
  const collection = db.collection('members')
  await collection.updateOne(
    { userId: profile.userId, status: 'Active' },
    { $set: profile },
    { upsert: true },
  )
  await disconnectDB()
}

export async function getMemberByUserId(userId: string): Promise<Member | null> {
  /**
   * ดึงข้อมูลสมาชิกที่ active ตาม userId
   * - ใช้สำหรับตรวจสอบสถานะสมาชิก
   * - Limitation: คืนค่า null ถ้าไม่พบหรือไม่ active
   */
  await connectDB()
  const collection = db.collection('members')
  const member = await collection.findOne({ userId, status: 'Active' })
  await disconnectDB()
  return member as Member | null
}

export async function createBooking(
  userId: string,
  title: string,
  datetime: string,
  eventId: string,
) {
  /**
   * สร้างข้อมูลการจอง (booking)
   * - ใช้สำหรับบันทึกการจองกิจกรรม/นัดหมาย
   * - Limitation: ไม่มีการตรวจสอบซ้ำ eventId/userId
   */
  await connectDB()
  const collection = db.collection('booking')
  await collection.insertOne({
    userId,
    title,
    datetime,
    status: 'booked',
    eventId, // ✅ ตรงนี้ต้องเก็บ eventId เข้า MongoDB
    createdAt: new Date(),
  })
  await disconnectDB()
}

export async function getUserBookings(userId: string) {
  /**
   * ดึงรายการ booking ของ user ที่ยังไม่ถูกยกเลิก
   * - ใช้สำหรับแสดงรายการจองทั้งหมดของ user
   */
  await connectDB()
  const collection = db.collection('booking')
  const res = await collection.find({ userId, status: 'booked' }).sort({ datetime: 1 }).toArray()

  await disconnectDB()
  return res
}

export async function cancelBooking(userId: string, eventId: string): Promise<Booking | null> {
  /**
   * ยกเลิก booking ตาม userId และ eventId
   * - ใช้สำหรับเปลี่ยนสถานะ booking เป็น cancelled
   * - Limitation: คืนค่า booking ที่ถูกยกเลิก หรือ null ถ้าไม่พบ
   */
  await connectDB()
  const collection = db.collection('booking')
  const result = await collection.findOneAndUpdate(
    { eventId: eventId, userId },
    { $set: { status: 'cancelled' } },
    { returnDocument: 'after' }, // ✅ สำคัญ! ขอ document ที่ update แล้ว
  )

  console.log(result)

  await disconnectDB()

  if (result) {
    console.log('✅ [MongoDB] Booking cancelled:', result)
    const booking = {
      _id: result._id,
      userId: result.userId,
      title: result.title,
      datetime: result.datetime,
      status: result.status,
      createdAt: result.createdAt,
      eventId: result.eventId, // optional
    } as Booking

    return booking // ใช้ result ตรง ๆ
  } else {
    console.log('❌ [MongoDB] Booking not found to cancel')
    return null
  }
}

export async function insertDataBeacon(data: beaconInsert): Promise<boolean> {
  /**
   * แทรกข้อมูล beacon (กันซ้ำรายวัน)
   * - ใช้สำหรับเก็บข้อมูลการเข้าใช้งาน/เช็คอินแบบ beacon
   * - Limitation: ถ้ามีข้อมูลซ้ำ (userId, year, month, day) จะไม่ insert ซ้ำ
   */
  await connectDB()
  const collection = db.collection('beacon')

  const exists = await collection.findOne({
    userId: data.userId,
    year: data.year,
    month: data.month,
    day: data.day,
  })

  if (exists) {
    await disconnectDB()
    return false
  }

  await collection.insertOne(data)
  await disconnectDB()
  return true
}

/** ✅ ปิดการเชื่อมต่อ MongoDB */
export async function disconnectDB(): Promise<void> {
  /**
   * ปิดการเชื่อมต่อ MongoDB
   * - ควรเรียกหลังใช้งานเสร็จทุกครั้ง
   */
  try {
    await client.close()
    console.log('✅ MongoDB Disconnected Successfully')
  } catch (error) {
    console.error('❌ MongoDB Disconnection Error:', error)
  }
}

export async function upsertAnswersByUserID(data: answerInsert): Promise<void> {
  /**
   * upsert คำตอบ (Answers) ของ user ใน group
   * - ใช้สำหรับเก็บหรืออัปเดตคำตอบของ user ในแต่ละ group
   * - Limitation: upsert ตาม userId และ groupId
   */
  const filter = { userId: data.userId, groupId: data.groupId }
  const update = {
    $set: {
      userId: data.userId,
      groupId: data.groupId,
      createdAt: new Date(),
      updatedAt: new Date(),
      model: data.model,
      description: data.description,
      Answers: data.Answers,
    },
  }
  const options = { upsert: true }
  await connectDB()
  const collection = db.collection('answers')
  await collection.updateOne(filter, update, options)
  await disconnectDB()
  console.log('✅ Answers upserted successfully')
}

export const saveNotificationTokenToDatabase = async (
  userId: string,
  notificationTokenResponse: ServiceNotificationTokenResponse,
): Promise<void> => {
  /**
   * บันทึก Service Notification Token ลงฐานข้อมูล
   * - ใช้สำหรับเก็บ token ที่ใช้ส่ง service notification
   * - Limitation: upsert ตาม userId
   */
  await connectDB()
  const collection = db.collection('notification_tokens')
  const filter = { userId }
  const update = {
    $set: {
      userId,
      ...notificationTokenResponse,
      timestamp: new Date(),
    },
  }
  const options = { upsert: true }
  await collection.updateOne(filter, update, options)
  await disconnectDB()
}

export const getNotificationTokenByUserId = async (
  userId: string,
): Promise<ServiceNotificationTokenResponse> => {
  /**
   * ดึง Service Notification Token ตาม userId
   * - ใช้สำหรับดึง token เพื่อส่ง service notification
   * - Limitation: ถ้าไม่พบจะ throw error
   */
  await connectDB()
  const collection = db.collection('notification_tokens')
  const result = await collection.findOne({ userId })
  await disconnectDB()

  if (!result) {
    console.log('❌ [MongoDB] Notification token not found')
    throw new Error('Notification token not found')
  }

  return result as unknown as ServiceNotificationTokenResponse
}
