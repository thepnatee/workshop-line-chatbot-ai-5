export interface MessageHistory {
  role: 'user' | 'model'
  parts: { text: string }[]
}

export interface CalendarEventData {
  title: string
  date: string // รูปแบบ ISO เช่น "2025-05-01T10:00:00"
  location?: string
}

export interface Booking {
  userId?: string
  title?: string
  datetime?: string
  location?: string
  eventId?: string
  status?: string
  createdAt: Date
}

export interface Schema {
  type: 'string' | 'object' | 'array' | 'boolean' | 'number'
  description?: string
  properties?: Record<string, Schema>
  items?: Schema
  required?: string[]
}

export interface FunctionDeclaration {
  name: string
  description: string
  parameters: Schema
}
