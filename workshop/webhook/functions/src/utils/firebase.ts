import { App, initializeApp } from 'firebase-admin/app'
import { Storage } from '@google-cloud/storage'

let app: App | null = null

const initialize = () => {
  if (!app) {
    app = initializeApp()
  }
}

initialize()

const storage = new Storage()
const bucketName = process.env.BUCKET_NAME!

/**
 * saveImageToStorage
 * - บันทึกไฟล์ Buffer ลง Google Cloud Storage (Firebase Storage)
 * - ทำให้ไฟล์เป็น public และคืน public URL สำหรับเข้าถึงไฟล์
 * - โครงสร้าง path: <id>/<ปี>/<เดือน>/<messageId>.<extension>
 * - หมายเหตุ: เดือน (mm) เริ่มที่ 0 (January = 0)
 */
export const saveImageToStorage = async (
  id: string,
  messageId: string,
  buffer: Buffer,
  extension: string,
): Promise<string> => {
  const today = new Date()
  const yyyy = today.getFullYear()
  let mm = today.getMonth()

  const storageBucket = storage.bucket(bucketName)
  const filePath = `${id}/${yyyy}/${mm}/${messageId}.${extension}`
  const file = storageBucket.file(filePath)
  await file.save(buffer) // บันทึกไฟล์
  await file.makePublic() // ทำให้ไฟล์สาธารณะ
  return file.publicUrl();           // คืน URL สำหรับเข้าถึง
}
