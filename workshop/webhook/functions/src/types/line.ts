export interface LineAccessTokenResponse {
  access_token: string
  expires_in?: number
  token_type?: string
}

export interface LineProfile {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
}

export interface JwtPayload {
  iss: string
  sub: string
  aud: string
  exp: number
  token_exp: number
}

export interface JwtHeader {
  alg: string
  typ: string
  kid?: string
}

export interface AnimationLoadingResponse {
  status?: string
  message?: string
  [key: string]: any // เผื่อ LINE เพิ่ม field อื่นในอนาคต
}

// Message
export interface BroadcastPayload {
  messages: Array<{
    type: string
    text: string
  }>
  notificationDisabled?: boolean
}

export interface QuotaResponse {
  value: number
}

export interface ConsumptionResponse {
  totalUsage: number
}

export interface FollowerResponse {
  followers: number
}

export interface LineMessage {
  type: 'text' | 'image' | 'video' | 'audio' | 'location' | 'sticker' | 'flex' | string
  [key: string]: any
}

export interface MulticastPayload {
  to: string[] // userIds
  messages: LineMessage[]
  notificationDisabled?: boolean
}

export interface LineProfileIdTokenResponse {
  iss: string
  sub: string
  aud: string
  exp: number
  iat: number
  nonce: string
  amr: string[]
  name: string
  picture: string
  email?: string
}

export interface LineLoginProfileResponse {
  userId: string
  displayName: string
  pictureUrl?: string
  statusMessage?: string
}

export interface ServiceNotificationTokenResponse {
  notificationToken: string
  expiresIn: number
  remainingCount: number
  sessionId: string
}
