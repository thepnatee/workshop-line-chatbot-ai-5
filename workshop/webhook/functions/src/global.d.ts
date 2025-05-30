declare module 'http' {
  export interface IncomingMessage {
    rawBody: Buffer
  }

  export interface IncomingHttpHeaders {
    'x-liff-access-token'?: string
  }
}
