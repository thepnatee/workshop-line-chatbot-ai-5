import { createClient, RedisClientType } from 'redis'

let redisClient: RedisClientType | null = null

/**
 * สร้าง/คืน Redis client ที่เชื่อมต่ออยู่ (singleton)
 * - ใช้สำหรับ reuse connection และป้องกันการสร้าง client ซ้ำ
 */
const getRedisClient = async (): Promise<RedisClientType> => {
  if (redisClient && redisClient.isOpen) {
    return redisClient
  }

  redisClient = createClient({
    username: 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : undefined,
    },
  })

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err)
  })

  await redisClient.connect()
  return redisClient
}

/**
 * บันทึกค่า key-value ลง Redis พร้อมกำหนด TTL (วินาที) ได้
 * - ถ้าไม่กำหนด TTL จะเก็บถาวร
 * - คืน true ถ้าสำเร็จ
 */
export const redisSet = async (
  key: string,
  value: string,
  ttlInSeconds?: number,
): Promise<boolean> => {
  const client = await getRedisClient()

  const result = ttlInSeconds
    ? await client.set(key, value, { EX: ttlInSeconds }) // Set with expiration
    : await client.set(key, value) // Set without expiration

  return result === 'OK'
}

/**
 * ดึงค่าจาก Redis ตาม key
 * - คืนค่า string หรือ null ถ้าไม่พบ
 */
export const redisGet = async (key: string): Promise<string | null> => {
  const client = await getRedisClient()
  return await client.get(key)
}

/**
 * ลบค่าใน Redis ตาม key
 * - คืน true ถ้าลบสำเร็จ (มี key นี้อยู่)
 */
export const redisDel = async (key: string): Promise<boolean> => {
  const client = await getRedisClient()
  const result = await client.del(key)
  return result > 0
}
