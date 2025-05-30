// =========================
//  LINE Utility Functions
// =========================
import axios, { AxiosResponse } from 'axios'
import * as jose from 'node-jose'
import crypto from 'crypto'

import { lineOauthPrivate } from './linePrivateKey' // ต้อง export jwk ที่เป็น RSA key
import {
  LineAccessTokenResponse,
  LineProfile,
  LineProfileIdTokenResponse,
  JwtPayload,
  JwtHeader,
  AnimationLoadingResponse,
  QuotaResponse,
  ConsumptionResponse,
  FollowerResponse,
  BroadcastPayload,
  LineMessage,
  MulticastPayload,
  LineLoginProfileResponse,
  ServiceNotificationTokenResponse,
} from '@/types/line'
import { redisGet, redisSet } from './redis'

export const lineApiInstance = axios.create({
  baseURL: process.env.LINE_MESSAGING_API,
})

export const lineBlobInstance = axios.create({
  baseURL: process.env.LINE_DATA_MESSAGING_API,
})
/**
 * ตรวจสอบความถูกต้องของ LINE signature ที่แนบมากับ webhook
 * ใช้สำหรับยืนยันว่า request มาจาก LINE จริง
 * Limitation: ต้องใช้ rawBody ที่ยังไม่ถูก parse และ channel secret ที่ถูกต้อง
 */
export function validateLineSignature(rawBody: Buffer | string, signature: string): boolean {
  const hmac = crypto.createHmac('sha256', process.env.LINE_MESSAGING_CHANNEL_SECRET!)
  hmac.update(rawBody)
  const expectedSignature = hmac.digest('base64')

  return expectedSignature === signature
}

/**
 * ดึงข้อมูลโปรไฟล์ผู้ใช้จาก userId
 * ใช้สำหรับดึง displayName, pictureUrl ฯลฯ ของ user
 * Limitation: ต้องใช้ access token ที่ถูกต้อง, ใช้ได้เฉพาะ user ที่ add bot แล้ว
 */
export const getProfile = async (userId: string): Promise<LineProfile> => {
  try {
    const url = `${process.env.LINE_MESSAGING_API}/profile/${userId}`
    const response: AxiosResponse<LineProfile> = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })
    return response.data
  } catch (error: any) {
    console.error('Error fetching user profile:', error.response?.data || error.message)
    throw error
  }
}

/**
 * ดึงข้อมูลโปรไฟล์จาก idToken (LINE Login)
 * ใช้สำหรับ LINE Login flow เท่านั้น
 * Limitation: idToken ต้อง valid และยังไม่หมดอายุ
 */
export const getProfileByIDToken = async (idToken: string): Promise<LineProfileIdTokenResponse> => {
  try {
    const url = `${process.env.LINE_ENDPOINT_API_VERIFY}`
    const response = await axios.post(
      url,
      {
        id_token: idToken,
        client_id: process.env.LINE_LIFF_CHANNEL_ID,
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    )

    return response.data
  } catch (error: any) {
    console.error('Error fetching profile by ID token:', error.response?.data || error.message)
    throw error
  }
}

/**
 * ดึงข้อมูลโปรไฟล์จาก Redis cache ถ้ามี, ถ้าไม่มีจะดึงจาก LINE API แล้ว cache ไว้ 5 นาที
 * ใช้ลดจำนวน call ไปที่ LINE API
 * Limitation: ข้อมูลอาจไม่ real-time ถ้ามีการเปลี่ยนชื่อ/รูปในช่วง cache
 */
export const getProfileCache = async (userId: string): Promise<LineProfile> => {
  const cacheKey = `line:profile:${userId}`
  const cacheTTL = 60 * 5 // ✅ 5 นาที

  try {
    const cached = await redisGet(cacheKey)
    if (cached) {
      return JSON.parse(cached) as LineProfile
    }

    const url = `${process.env.LINE_MESSAGING_API}/profile/${userId}`
    const response: AxiosResponse<LineProfile> = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })

    const profile = response.data
    await redisSet(cacheKey, JSON.stringify(profile), cacheTTL) // ✅ TTL 5 นาที

    return profile
  } catch (error: any) {
    console.error('Error fetching user profile:', error.response?.data || error.message)
    throw error
  }
}

/**
 * ดึงข้อมูลโปรไฟล์สมาชิกใน group
 * ใช้สำหรับ group chat เท่านั้น
 * Limitation: ใช้ได้เฉพาะ group ที่ bot อยู่และ user ยังไม่ block
 */
export const getProfileByGroup = async (groupId: string, userId: string): Promise<LineProfile> => {
  try {
    const url = `${process.env.LINE_MESSAGING_API}/group/${groupId}/member/${userId}`
    const response: AxiosResponse<LineProfile> = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })
    return response.data
  } catch (error: any) {
    console.error('Error fetching group user profile:', error.response?.data || error.message)
    throw error
  }
}

/**
 * ดึงข้อมูล summary ของ group
 * ใช้สำหรับดึงชื่อ group, จำนวนสมาชิก ฯลฯ
 * Limitation: ใช้ได้เฉพาะ group ที่ bot อยู่
 */
export const groupInfo = async (groupId: string): Promise<any> => {
  try {
    const url = `${process.env.LINE_MESSAGING_API}/group/${groupId}/summary/`
    const response: AxiosResponse<any> = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })
    return response.data
  } catch (error: any) {
    console.error('Error fetching group profile:', error.response?.data || error.message)
    throw error
  }
}

/**
 * ส่ง animation loading (typing...) ให้ user
 * ใช้สำหรับแสดงสถานะกำลังประมวลผล
 * Limitation: จำกัดเวลาสูงสุด 60 วินาที, ต้องใช้ stateless access token
 */
export const isAnimationLoading = async (userId: string): Promise<AnimationLoadingResponse> => {
  try {

    const url = `${process.env.LINE_MESSAGING_API}/chat/loading/start`
    const payload = {
      chatId: userId,
      loadingSeconds: 10, // allowed values: 5,10,15,...,60
    }

    const response: AxiosResponse<AnimationLoadingResponse> = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 202) {
      return response.data
    } else {
      throw new Error(`❌ Failed to send animation loading. Status: ${response.status}`)
    }
  } catch (error: any) {
    console.error('🔥 Error sending animation loading:', error.response?.data || error.message)
    throw error
  }
}

/**
 * ส่งข้อความ reply กลับไปยังผู้ใช้ (replyToken)
 * ใช้สำหรับตอบกลับข้อความใน 1:1 หรือ group
 * Limitation: ต้อง reply ภายใน 1 นาทีหลังได้รับ event, ส่งได้สูงสุด 5 ข้อความต่อครั้ง
 */
export const reply = async (token: string, payload: any[]): Promise<any> => {
  const url = `${process.env.LINE_MESSAGING_API}/message/reply`
  const response: AxiosResponse<any> = await axios.post(
    url,
    { replyToken: token, messages: payload },
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    },
  )
  return response.data
}

/**
 * ส่งข้อความ reply ด้วย stateless access token
 * ใช้สำหรับ use case ที่ต้องการ security เพิ่มขึ้น
 * Limitation: ต้องขอ stateless access token ก่อนทุกครั้ง
 */
export const replyWithStateless = async (token: string, payload: any[]): Promise<any> => {
  const accessToken = await issueMessagingStatelessChannelAccessToken()
  const url = `${process.env.LINE_MESSAGING_API}/message/reply`
  const response: AxiosResponse<any> = await axios.post(
    url,
    { replyToken: token, messages: payload },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  )
  return response.data
}

/**
 * ดึง binary content (image, video, file ฯลฯ) จาก messageId
 * ใช้สำหรับดึงไฟล์ที่ผู้ใช้ส่งมา
 * Limitation: ใช้ได้เฉพาะ message ที่ยังไม่หมดอายุ (7 วัน), ต้องใช้ access token ที่ถูกต้อง
 */
export const getContent = async (messageId: string): Promise<Buffer> => {
  try {
    const url = `${process.env.LINE_DATA_MESSAGING_API}/message/${messageId}/content`

    console.log('url', url)
    const response: AxiosResponse<Buffer> = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN}`,
      },
      responseType: 'arraybuffer',
    })
    return response.data
  } catch (error: any) {
    console.error('Error fetching content:', error.response?.data || error.message)
    throw error
  }
}

/**
 * หานามสกุลไฟล์จาก messageType หรือ fileName
 * ใช้สำหรับตั้งชื่อไฟล์ก่อนบันทึก
 * Limitation: ถ้าเป็น file ต้องมี fileName ที่มีนามสกุล
 */
export const getExtension = (fileName: string, messageType: string): string => {
  let extension = ''
  switch (messageType) {
    case 'image':
      extension = 'png'
      break
    case 'video':
      extension = 'mp4'
      break
    case 'audio':
      extension = 'm4a'
      break
    case 'file':
      const regex = /\.([0-9a-z]+)(?:[\?#]|$)/i
      const match = regex.exec(fileName)
      extension = match ? match[1] : ''
      break
  }

  return extension
}

/**
 * ขอ stateless access token สำหรับ channel (expires 15 นาที)
 * ใช้สำหรับ API ที่ต้องการ stateless token
 * Limitation: ต้องขอใหม่ทุก 15 นาที, cache ได้ใน Redis
 */
export const issueStatelessChannelAccessToken = async (
  channelId: string,
  channelSecret: string,
): Promise<string> => {
  try {
    const cacheKey = `line:token:${channelId}_${channelSecret}`

    // // Try to get token from Redis
    let token = await redisGet(cacheKey)

    // console.log('Stateless token cache key:', token)

    if (!token) {
      const url = `${process.env.LINE_MESSAGING_OAUTH_ISSUE_TOKENV3}`
      const response: AxiosResponse<LineAccessTokenResponse> = await axios.post(
        url,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: channelId,
          client_secret: channelSecret,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      )

      if (response.data?.access_token) {
        token = response.data.access_token
        console.log('Stateless access token issued:', token)
        await redisSet(cacheKey, token, (response.data.expires_in || 900) - 60) // 15 นาที - 1 นาที (60 วินาที)
        return token
      } else {
        throw new Error('Failed to obtain stateless access token.')
      }
    }

    return token
  } catch (error: any) {
    // console.error('Error issuing token:', error.message)
    throw error
  }
}

const issueMessagingStatelessChannelAccessToken = async (): Promise<string> => {
  return issueStatelessChannelAccessToken(
    process.env.LINE_MESSAGING_CHANNEL_ID!,
    process.env.LINE_MESSAGING_CHANNEL_SECRET!,
  )
}

const issueLiffStatelessChannelAccessToken = async (): Promise<string> => {
  return issueStatelessChannelAccessToken(
    process.env.LINE_LIFF_CHANNEL_ID!,
    process.env.LINE_LIFF_CHANNEL_SECRET!,
  )
}

/**
 * Channel Access Token v2.1 (JWT) - max 30 days, cached in Redis for 30 minutes
 */
export const issueTokenv2_1 = async (): Promise<string> => {
  try {
    const channelId = process.env.LINE_MESSAGING_CHANNEL_ID!
    const cacheKey = `line:token:v2.1:${channelId}`
    const tokenExp = 60 * 60 * 24 // 1 day

    // 1️⃣ ตรวจสอบ token จาก Redis ก่อน
    let token = await redisGet(cacheKey)
    if (token) {
      return token
    }

    // 2️⃣ ไม่มีใน Redis → สร้างใหม่ด้วย JWT
    const jwkRaw = lineOauthPrivate.privateKey
    const jwk = await jose.JWK.asKey(jwkRaw) // แปลง JWK object → Key object

    const LINE_SIGNING_KEY: JwtHeader = {
      alg: 'RS256',
      typ: 'JWT',
      kid: process.env.ASSERTION_SIGNING_KEY,
    }

    const now = Math.floor(Date.now() / 1000)
    const payload: JwtPayload = {
      iss: channelId,
      sub: channelId,
      aud: 'https://api.line.me/',
      exp: now + 1800, // 30 นาที
      token_exp: tokenExp, // 1 วัน
    }

    const clientAssertion = (await jose.JWS.createSign(
      { format: 'compact', fields: LINE_SIGNING_KEY },
      jwk,
    )
      .update(JSON.stringify(payload))
      .final()) as unknown as string

    const data = new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: clientAssertion,
    })

    const response: AxiosResponse<LineAccessTokenResponse> = await axios.post(
      process.env.LINE_MESSAGING_OAUTH_ISSUE_TOKENV2!,
      data,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    )

    if (response.status === 200 && response.data?.access_token) {
      token = response.data.access_token

      await redisSet(cacheKey, token, tokenExp)
      return token
    } else {
      console.error('LINE OAuth Response:', response.data)
      throw new Error('❌ Failed to obtain v2.1 access token.')
    }
  } catch (error: any) {
    console.error('🔥 Error issuing JWT token:', error.response?.data || error.message)
    throw error
  }
}

/**
 * ส่งข้อความ broadcast ไปยังผู้ติดตามทั้งหมด
 * ตรวจสอบ quota ก่อนส่ง, ใช้ stateless access token
 * Limitation: quota ต้องเหลือมากกว่าจำนวนผู้ติดตาม
 */
export const broadcastConsumption = async (payload: BroadcastPayload): Promise<void> => {
  try {
    const accessToken = await issueMessagingStatelessChannelAccessToken()

    // ดึงข้อมูลทั้งหมดพร้อมกัน
    const [quotaMessage, quotaConsumption, numberOfFollowers]: [
      QuotaResponse,
      ConsumptionResponse,
      FollowerResponse,
    ] = await Promise.all([
      getQuota(accessToken),
      getConsumption(accessToken),
      getNumberOfFollowers(accessToken),
    ])

    console.log('Quota:', quotaMessage)
    console.log('Consumption:', quotaConsumption)
    console.log('Number Of Followers:', numberOfFollowers)

    // คำนวณว่า quota ที่เหลือ > จำนวนผู้ติดตามหรือไม่
    const remainingQuota = quotaMessage.value - quotaConsumption.totalUsage

    if (remainingQuota > numberOfFollowers.followers) {
      const url = `${process.env.LINE_MESSAGING_API}/message/broadcast`
      const response: AxiosResponse = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.status === 200) {
        return response.data
      } else {
        throw new Error(`Failed to send broadcast. API responded with status: ${response.status}`)
      }
    } else {
      console.warn('❗️Remaining quota is less than number of followers. Broadcast skipped.')
    }
  } catch (error: any) {
    console.error('Error in broadcastConsumption:', error.message || error)
    throw error
  }
}

async function getQuota(accessToken: string): Promise<QuotaResponse> {
  const url = `${process.env.LINE_MESSAGING_API}/message/quota`
  const response: AxiosResponse<QuotaResponse> = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return response.data
}

async function getConsumption(accessToken: string): Promise<ConsumptionResponse> {
  const url = `${process.env.LINE_MESSAGING_API}/message/quota/consumption`
  const response: AxiosResponse<ConsumptionResponse> = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return response.data
}

async function getNumberOfFollowers(accessToken: string): Promise<FollowerResponse> {
  const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const url = `${process.env.LINE_MESSAGING_API}/insight/followers?date=${currentDate}`
  const response: AxiosResponse<FollowerResponse> = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return response.data
}

/**
 * ส่งข้อความไปยัง user หลายคนพร้อมกัน (สูงสุด 500 คน/ครั้ง)
 * ใช้สำหรับส่งข้อความแบบกลุ่มย่อย
 * Limitation: ส่งได้สูงสุด 500 user ต่อ 1 request
 */
export const multicast = async (payload: MulticastPayload): Promise<any> => {
  try {
    const accessToken = await issueMessagingStatelessChannelAccessToken()
    console.log("accessToken",accessToken)
    const url = `${process.env.LINE_MESSAGING_API}/message/multicast`

    const response: AxiosResponse = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 200) {
      return response.data
    } else {
      throw new Error(`Failed to send multicast. API responded with status: ${response.status}`)
    }
  } catch (error: any) {
    console.error('❌ Error in multicast:', error.message)
    throw error
  }
}

/**
 * ส่ง push message ไปยัง userId ด้วย stateless access token (JWT v2.1)
 * ใช้สำหรับ push message แบบปลอดภัย
 * Limitation: ต้องขอ token v2.1 ก่อน, ส่งได้สูงสุด 5 ข้อความ/ครั้ง
 */
export const pushWithStateless = async (userId: string, messages: LineMessage[]): Promise<any> => {
  try {
    const accessToken = await issueTokenv2_1()
    const url = `${process.env.LINE_MESSAGING_API}/message/push`

    const response: AxiosResponse = await axios.post(
      url,
      {
        to: userId,
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    )

    if (response.status === 200) {
      return response.data
    } else {
      throw new Error(`Failed to send push. API responded with status: ${response.status}`)
    }
  } catch (error: any) {
    console.error('❌ Error in pushWithStateless:', error.message)
    throw error
  }
}

/**
 * ส่ง push message พร้อม custom aggregation unit
 * ใช้สำหรับ campaign หรือ analytics
 * Limitation: ต้องขอ token v2.1 ก่อน, ต้องกำหนด customAggregationUnits
 */
export const pushWithCustomAggregation = async (
  userId: string,
  messages: LineMessage[],
  customAggregationUnits: string[],
): Promise<any> => {
  try {
    const accessToken = await issueTokenv2_1()
    const url = `${process.env.LINE_MESSAGING_API}/message/push`

    const response: AxiosResponse = await axios.post(
      url,
      {
        to: userId,
        messages,
        customAggregationUnits,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    )

    if (response.status === 200) {
      return response.data
    } else {
      throw new Error(
        `Failed to send push with custom aggregation. API responded with status: ${response.status}`,
      )
    }
  } catch (error: any) {
    console.error('❌ Error in pushWithCustomAggregation:', error.message)
    throw error
  }
}

/**
 * กำหนด richmenu ให้ user รายบุคคล
 * ใช้สำหรับ personalize richmenu
 * Limitation: ต้องใช้ stateless access token, 1 user มีได้ 1 richmenu
 */
export const richmenuSetIndividual = async (userId: string, richmenuId: string): Promise<void> => {
  try {
    const accessToken = await issueMessagingStatelessChannelAccessToken()
    const url = `${process.env.LINE_MESSAGING_API}/user/${userId}/richmenu/${richmenuId}`
    await axios.post(
      url,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )
  } catch (error: any) {
    console.error('❌ Error in richmenuSetIndividual:', error.message)
    throw error
  }
}

/**
 * ตรวจสอบความถูกต้องของ access token
 * ใช้สำหรับ validate token ที่ได้จาก LINE
 * Limitation: ใช้ได้เฉพาะ access token ที่ยังไม่หมดอายุ
 */
export const verifyAccessToken = async (accessToken: string, expectedChannelId?: string) => {
  try {
    const response = await axios.request({
      method: 'GET',
      url: 'https://api.line.me/oauth2/v2.1/verify',
      params: {
        access_token: accessToken,
      },
    })

    if (response.status === 200) {
      if (expectedChannelId) {
        return response.data.client_id === expectedChannelId
      }

      return true
    } else {
      throw new Error(`❌ Failed to verify access token. Status: ${response.status}`)
    }
  } catch (error) {
    console.error('❌ Error in verifyAccessToken:', error)
    throw error
  }
}

/**
 * ดึง profile จาก LIFF access token
 * ใช้สำหรับ LIFF app เท่านั้น
 * Limitation: ต้อง verify access token ก่อน, ใช้ได้เฉพาะ user ที่ login ผ่าน LIFF
 */
export const getProfileByLiffAccessToken = async (liffAccessToken: string) => {
  try {
    // Verify if LIFF access token is valid and generated from the correct channel
    await verifyAccessToken(liffAccessToken, process.env.LINE_LIFF_CHANNEL_ID)

    const response = await axios.request<LineLoginProfileResponse>({
      method: 'GET',
      url: 'https://api.line.me/v2/profile',
      headers: {
        Authorization: `Bearer ${liffAccessToken}`,
      },
    })

    return response.data
  } catch (error) {
    console.error('❌ Error in getProfileByLiffAccessToken:', error)
    throw error
  }
}

/**
 * ขอ service notification token สำหรับ LIFF
 * ใช้สำหรับส่ง service notification ผ่าน LIFF
 * Limitation: ต้องใช้ LIFF access token และ stateless access token
 */
export const generateServiceNotificationToken = async (liffAccessToken: string) => {
  try {
    const accessToken = await issueLiffStatelessChannelAccessToken()

    const response = await lineApiInstance.request<ServiceNotificationTokenResponse>({
      method: 'POST',
      url: '/message/v3/notifier/token',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        liffAccessToken,
      },
    })

    return response.data
  } catch (error) {
    console.error('❌ Error in generateServiceNotificationToken:', error)
    throw error
  }
}

/**
 * ส่ง service notification message
 * ใช้สำหรับแจ้งเตือนผ่าน service notification
 * Limitation: ต้องมี notificationToken และ templateName ที่ถูกต้อง
 */
export const sendServiceMessage = async (
  notificationToken: string,
  templateName: string,
  variables: Record<string, string> = {},
) => {
  try {
    const accessToken = await issueLiffStatelessChannelAccessToken()

    const response = await lineApiInstance.request<ServiceNotificationTokenResponse>({
      method: 'POST',
      url: '/message/v3/notifier/send?target=service',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        templateName,
        params: variables,
        notificationToken,
      },
    })

    console.log('✅ sendServiceMessage response:', response.data)

    return response.data
  } catch (error) {
    console.error('❌ Error in sendServiceMessage:', error)
    throw error
  }
}
