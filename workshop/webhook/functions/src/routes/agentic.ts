import express, { Request, Response } from 'express'
import cors from 'cors'

import { getProfileByIDToken } from '@/utils/line'
import { answerInsert } from '@/types/mongo.js'
import { upsertAnswersByUserID } from '@/utils/mongo.js'
import { insertVector, vectorSearchQuery, vectorSearchQueryGemini } from '@/utils/langchain.js'
const router = express.Router()

// Enable CORS for all routes
const corsOptions = {
  origin: '*', // Allow all origins. You can restrict this to specific domains if needed.
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

router.use(cors(corsOptions))

router.get('/create', async (request: Request, response: Response) => {
  await insertVector()
  response.end()
  return
})
router.get('/query', async (request: Request, response: Response) => {
  await vectorSearchQuery('What is DISC')
  response.end()
  return
})
router.get('/search', async (request: Request, response: Response) => {
  const prompt = `จากคำตอบนี้ ฉันเป็นคนอ่อนโยน ขี้อาย ไม่ชอบการเปลี่ยนแปลง ชอบความมั่นคง และมีความอดทนสูง ฉันมักจะหลีกเลี่ยงการเผชิญหน้ากับปัญหา และมักจะทำตามคำแนะนำของผู้อื่น
    ฉันมีความสามารถในการทำงานร่วมกับผู้อื่นได้ดี และมักจะให้ความสำคัญกับความสัมพันธ์ระหว่างบุคคลมากกว่าผลลัพธ์ที่ได้`

  const result = await vectorSearchQueryGemini(prompt)
  response.json(result)
  return
})

router.post('/answer', async (request: Request, response: Response) => {
  if (!request.headers.authorization) {
    response.status(401).send('Unauthorized')
    return
  }

  const idToken = request.headers.authorization!

  const profile = await getProfileByIDToken(idToken)

  console.log('profile', profile)

  const { answers } = request.body
  if (!answers || !Array.isArray(answers)) {
    response.status(400).send("Invalid or missing 'answers'")
    return
  }

  const answersMapIndex = answers.map((answer, index) => `${index + 1}. ${answer}`)

  const prompt = JSON.stringify(answersMapIndex)

  const result = await vectorSearchQueryGemini(prompt)
  const parsed = JSON.parse(result)

  const object = {
    userId: profile.sub,
    model: parsed.model,
    description: parsed.description,
    Answers: answersMapIndex,
  } as answerInsert

  await upsertAnswersByUserID(object)
  response.json({
    model: parsed.model,
    description: parsed.description,
    Answers: answersMapIndex,
  })

  return
})

export default router
