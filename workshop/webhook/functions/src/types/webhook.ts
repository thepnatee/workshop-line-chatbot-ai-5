export interface WebhookRequestBody {
  destination: string
  events: LineEvent[]
}

export interface LineEvent {
  type: EventType
  mode: EventMode
  timestamp: number
  source: EventSource
  replyToken?: string
  message?: Message
  postback?: Postback
  beacon?: Beacon
  joined?: JoinedMembers
  left?: LeftMembers
  unsend?: Unsend
  videoPlayComplete?: VideoPlayComplete
  things?: Things
  follow?: FollowUnblocked
}

export type EventType =
  | 'message'
  | 'unsend'
  | 'follow'
  | 'unfollow'
  | 'join'
  | 'leave'
  | 'memberJoined'
  | 'memberLeft'
  | 'postback'
  | 'videoPlayComplete'
  | 'beacon'
  | 'accountLink'
  | 'things'

export type EventMode = 'active' | 'standby'

export interface EventSource {
  type: 'user' | 'group' | 'room'
  userId?: string
  groupId?: string
  roomId?: string
}

export interface Message {
  id: string
  type: MessageType
  text?: string
  emojis?: Emoji[]
  mention?: Mention
  fileName?: string
  fileSize?: number
  title?: string
  address?: string
  latitude?: number
  longitude?: number
  packageId?: string
  stickerId?: string
  stickerResourceType?: string
  keywords?: string[]
  duration?: number
  contentProvider?: ContentProvider
  quotedMessageId?: string
  quoteToken?: string
  imageSet?: imageSets
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'sticker'

export interface Emoji {
  index: number
  length: number
  productId: string
  emojiId: string
}

export interface Mention {
  mentionees: Mentionee[]
}

export interface Mentionee {
  index: number
  length: number
  userId: string
  isSelf: boolean
  type: 'user' | 'all'
}

export interface ContentProvider {
  type: 'line' | 'external'
  originalContentUrl?: string
  previewImageUrl?: string
}

export interface Postback {
  data: string
  params?: PostbackParams
}

export interface PostbackParams {
  date?: string
  time?: string
  datetime?: string
  newRichMenuAliasId?: string
  status?: string
}

export interface Beacon {
  hwid: string
  type: 'enter' | 'banner' | 'stay'
  dm?: string
}

export interface JoinedMembers {
  members: EventSource[]
}

export interface LeftMembers {
  members: EventSource[]
}

export interface Unsend {
  messageId: string
}

export interface VideoPlayComplete {
  trackingId: string
}

export interface Things {
  deviceId: string
  type: 'link' | 'unlink' | 'scenarioResult'
  result?: ScenarioResult
}

export interface ScenarioResult {
  scenarioId: string
  revision: number
  startTime: number
  endTime: number
  resultCode: string
  actionResults: ActionResult[]
  bleNotificationPayload?: string
  errorMessage?: string
}

export interface ActionResult {
  type: string
  data?: string
}

export interface FollowUnblocked {
  isUnblocked: boolean
}

export interface imageSets {
  id: string
  index: number
  total: number
}
