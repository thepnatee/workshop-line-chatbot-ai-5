import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai'

import { redisGet, redisSet } from './redis'
import { MessageHistory } from '@/types/gemini'

import dotenv from 'dotenv'
dotenv.config()

const geminiKey = process.env.GEMINI_API_KEY!

const genAI = new GoogleGenAI({ apiKey: geminiKey })

/**
 * เรียก Gemini LLM สำหรับข้อความ (Text Only)
 * - รับ prompt ข้อความ ส่งไปยัง Gemini และคืนผลลัพธ์ข้อความ
 */
export async function textOnly(prompt: string): Promise<string> {
  const result = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: {
      maxOutputTokens: 500,
      temperature: 0.1,
    },
  })
  return result.text!
}

/**
 * เรียก Gemini LLM สำหรับภาพ (Multimodal)
 * - รับ Buffer ของภาพ ส่งไปยัง Gemini พร้อม prompt และตั้งค่า safety
 * - คืนผลลัพธ์เป็นข้อความบรรยายภาพ
 */
export async function multimodal(imageBinary: Buffer): Promise<string> {
  const prompt = 'ช่วยบรรยายภาพนี้ให้หน่อย'
  const mimeType = 'image/png'

  const contents = [
    { text: prompt },
    {
      inlineData: {
        data: imageBinary.toString('base64'),
        mimeType: mimeType,
      },
    },
  ]

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
  ]

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: contents,
    config: {
      safetySettings: safetySettings,
    },
  })

  const text = response.text!
  return text
}

/**
 * เรียก Gemini LLM สำหรับเสียง (Audio to Text)
 * - รับ Buffer ของไฟล์เสียง ส่งไปยัง Gemini พร้อม prompt และตั้งค่า safety
 * - คืนผลลัพธ์เป็นข้อความบรรยายเสียง
 */
export async function multiAudioTranslatemodal(audioBinary: Buffer): Promise<string> {
  const prompt = 'ช่วยบรรยายเสียงนี้ให้หน่อย'
  const mimeType = 'audio/mpeg'

  const contents = [
    { text: prompt },
    {
      inlineData: {
        data: audioBinary.toString('base64'),
        mimeType: mimeType,
      },
    },
  ]

  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
  ]

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: contents,
    config: {
      safetySettings: safetySettings,
    },
  })

  const text = response.text!
  return text
}

/**
 * สนทนา Gemini แบบ Multi-Turn พร้อมเก็บ Session แยก userId
 * - ดึงประวัติสนทนาจาก Redis (ถ้ามี)
 * - ส่งข้อความใหม่ไปยัง Gemini และอัปเดตประวัติ
 * - เก็บ session กลับเข้า Redis (TTL 30 นาที)
 */
export async function chatWithGeminiSession(userId: string, userMessage: string): Promise<string> {
  const cacheKey = `session:chat:${userId}`
  const sessionTTL = 60 * 30 // 30 นาที

  let sessionStr = await redisGet(cacheKey)
  let history: MessageHistory[] = sessionStr ? JSON.parse(sessionStr) : []

  const chat = genAI.chats.create({
    model: 'gemini-2.0-flash',
    history: history,
  })

  const result = await chat.sendMessage({
    message: userMessage,
  })

  const responseText = result.text ?? '(❓ ขอโทษค่ะ ฉันไม่เข้าใจ)' // ✅ fallback

  const updatedHistory: MessageHistory[] = [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
    { role: 'model', parts: [{ text: responseText }] },
  ]

  await redisSet(cacheKey, JSON.stringify(updatedHistory), sessionTTL)

  return responseText
}

/**
 * สร้าง Embedding จากข้อความด้วย Gemini
 * - รับ string แล้วขอ embedding vector จาก Gemini
 * - คืนค่าเป็น array ของตัวเลข (vector)
 */
export const getEmbedding = async (data: string): Promise<number[]> => {
  try {
    const result = await genAI.models.embedContent({
      model: 'text-embedding-004',
      contents: data,
    })
    if (!result.embeddings) {
      throw new Error('❌ Embeddings are undefined')
    }
    return result.embeddings[0].values ?? []
  } catch (error: any) {
    console.error('❌ Error generating embedding:', error.message)
    throw error
  }
}
