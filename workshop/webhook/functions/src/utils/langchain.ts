import fs from 'fs'
import axios from 'axios'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio'
import { VertexAIEmbeddings, ChatVertexAI } from '@langchain/google-vertexai'
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb'
import { MongoClient } from 'mongodb'
import { getEmbedding } from './gemini'

const url = process.env.MONGODB_URI!
const client = new MongoClient(url)
const db = client.db('developer')

export async function insertVector(): Promise<void> {
  // 1. เชื่อมต่อ MongoDB
  await client.connect()
  const collection = db.collection('disc_embeddings')

  const htmlFile = 'page.html'
  const targetURL = 'https://www.baseplayhouse.co/blog/what-is-disc'
  try {
    // 2. ดาวน์โหลด HTML ถ้ายังไม่มีไฟล์
    if (!fs.existsSync(htmlFile)) {
      console.log(`🌐 Downloading ${targetURL}`)
      const response = await axios.get(targetURL)
      fs.writeFileSync(htmlFile, response.data)
    } else {
      console.log(`📄 File exists: ${htmlFile}`)
    }

    // 3. โหลดและแยก HTML เป็นเอกสารย่อย ๆ
    const loader = new CheerioWebBaseLoader(targetURL)
    console.log(`📄 Loading ${targetURL}`)
    const rawDocs = await loader.load()
    console.log(`📄 Loaded ${rawDocs.length} documents`)
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 400, chunkOverlap: 20 })
    console.log(`✂️ Splitting documents`)
    const docs = await splitter.splitDocuments(rawDocs)
    console.log(`✂️ Split into ${docs.length} chunks`)

    // 4. สร้าง embeddings ด้วย VertexAI
    const embedder = new VertexAIEmbeddings({
      model: 'text-embedding-004',
    })
    console.log('embedder', embedder)

    // 5. เตรียม config สำหรับ vector store
    console.log('🔌 MongoDB connected')
    const dbConfig = {
      collection: collection,
      indexName: 'vector_index', // The name of the Atlas search index to use.
      textKey: 'text', // Field name for the raw text content. Defaults to "text".
      embeddingKey: 'embedding', // Field name for the vector embeddings. Defaults to "embedding".
    }
    console.log('🔍 Creating vector store', db)

    // 6. สร้าง embeddings สำหรับแต่ละ chunk
    const texts = docs.map((doc) => doc.pageContent)
    console.time('embedding')
    const embeddings = await embedder.embedDocuments(texts)
    console.timeEnd('embedding')

    // 7. รวม embeddings กับเอกสาร
    const embeddedDocs = docs.map((doc, i) => ({
      ...doc,
      embedding: embeddings[i],
    }))

    // 8. เพิ่มข้อมูลลง vector store (MongoDBAtlasVectorSearch)
    const vectorStore = new MongoDBAtlasVectorSearch(embedder, dbConfig)
    await vectorStore.addDocuments(embeddedDocs) // แยก insert

    console.log('🔍 Vector store created', vectorStore)
    console.log('✅ Documents inserted into vector store')
  } catch (err) {
    console.error('❌ Error:', err)
  } finally {
    // 9. สร้าง vector index (ถ้ายังไม่มี)
    await createVectorIndex()
    console.log('🔌 MongoDB disconnected')
  }
}

export async function createVectorIndex(): Promise<void> {
  // 1. เชื่อมต่อ MongoDB
  await client.connect()
  const collection = db.collection('disc_embeddings')
  const indexName: string = 'vector_index'

  // 2. ตรวจสอบว่ามี index อยู่แล้วหรือยัง
  const existingIndexes = await collection.listSearchIndexes().toArray()
  console.log('Existing indexes:', existingIndexes)
  const indexExists = existingIndexes.some((idx) => idx.name === indexName)
  console.log('Index exists:', indexExists)

  // 3. ถ้ายังไม่มี index ให้สร้างใหม่
  if (!indexExists) {
    const index = {
      name: indexName,
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            similarity: 'cosine',
            numDimensions: 768,
          },
        ],
      },
    }
    const result = await collection.createSearchIndex(index)
    console.log('✅ Created new index:', result)
  } else {
    console.log("✅ Index 'vector_index' already exists. Skipping creation.")
  }

  // 4. ปิดการเชื่อมต่อ MongoDB
  await client.close()
}

export async function vectorSearchQuery(query: string): Promise<void> {
  // 1. รับ query และเชื่อมต่อ MongoDB
  console.log(query)
  try {
    const client = new MongoClient(process.env.MONGODB_URI!)
    await client.connect()
    const db = client.db('developer')
    const collection = db.collection('disc_embeddings')
    const indexName: string = 'vector_index'

    // 2. แปลง query เป็น embedding
    const queryEmbedding = await getEmbedding(query)
    console.log('👉 Embedding dimension:', queryEmbedding.length)

    // 3. ค้นหาด้วย vector search
    const results = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: indexName,
            queryVector: queryEmbedding,
            path: 'embedding',
            numCandidates: 1000,
            limit: 10,
          },
        },
        {
          $project: {
            type: 1,
            description: 1,
            strengths: 1,
            weaknesses: 1,
            work_style: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ])
      .toArray()

    // 4. แสดงผลลัพธ์ที่ค้นหาได้
    console.log('✅ Search results:', results)
    await results.forEach((doc) => console.dir(JSON.stringify(doc)))
  } catch (err) {
    console.error('❌ Search Error:', err)
  } finally {
    // 5. ปิดการเชื่อมต่อ MongoDB
    await client.close()
  }
}

export async function vectorSearchQueryGemini(query: string): Promise<string> {
  // 1. เชื่อมต่อ MongoDB
  try {
    await client.connect()
    const db = client.db('developer')
    const collection = db.collection('disc_embeddings')

    // 2. สร้าง embedder และ vector store
    const embedder = new VertexAIEmbeddings({ model: 'text-embedding-004' })
    const vectorStore = new MongoDBAtlasVectorSearch(embedder, {
      collection,
      indexName: 'vector_index',
      textKey: 'text',
      embeddingKey: 'embedding',
    })

    // 3. ค้นหาเอกสารที่ใกล้เคียงกับ query
    const documents = await vectorStore.asRetriever().invoke(query)
    console.log(`✅ Found ${documents.length} similar documents.`)

    // 4. รวม context สำหรับ prompt
    const contextText = documents.map((doc) => doc.pageContent).join('\n\n')
    const prompt = `
        คุณคือผู้เชี่ยวชาญด้าน DISC Model ซึ่งแบ่งบุคลิกภาพออกเป็น 4 กลุ่ม คือ D (Dominance), I (Influence), S (Steadiness), C (Conscientiousness)
        พิจารณาบุคลิกภาพต่อไปนี้:
        "${query}"

        และจากข้อมูล DISC ด้านล่าง:
        ${contextText}

        ช่วยระบุว่าบุคคลนี้น่าจะตรงกับ DISC ประเภทใดมากที่สุด และให้คำอธิบายอย่างกระชับ พร้อมตอบในรูปแบบ JSON:
        {
          "model": "ประเภท DISC ที่เหมาะสม",
          "description": "คำอธิบายเหตุผลที่เลือกประเภทนี้"
        }
        `

    // 5. เรียก Gemini LLM เพื่อวิเคราะห์และสรุปผล
    const model = new ChatVertexAI({
      model: 'gemini-2.0-flash-exp',
      maxOutputTokens: 500,
      temperature: 0.5,
      topP: 0.9,
      topK: 20,
    })

    const result = await model.invoke(prompt)
    let answer = result.content
    answer = answer
      .toString()
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    return answer
  } catch (error) {
    console.error('Error in vectorSearchQueryGemini:', error)
    return 'An unexpected error occurred.'
  } finally {
    // 6. ปิดการเชื่อมต่อ MongoDB
    await client.close()
  }
}
