export interface ImageMetadata {
  groupId: string
  messageId: string
  type: string
  size: number
  timestamp: string
  url: string
}

export interface Member {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
  phoneNumber: string
  status: string
  richmenu: string
  createdAt: Date
}
export interface beaconInsert {
  userId: string
  hwid?: string
  type?: string
  timestamp: string
  year: number
  month: number
  day: number
}

export interface answerInsert {
  userId: string
  groupId: string
  createdAt: Date
  updatedAt: Date
  model: string
  description: string
  Answers: string[]
}
