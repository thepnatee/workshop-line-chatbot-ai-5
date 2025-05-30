import { setGlobalOptions } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import express from 'express'


/* Step 1: Webhook route */
import webhookRouter from './routes/webhook'

// import mentionRouter from './routes/mention'

// import sendMessageRouter from './routes/message'


// import beaconRouter from './routes/beacon'

// import storageRouter from './routes/storage'

// import mongoeRouter from './routes/mongo'

// import geminiRouter from './routes/gemini'

// import bookingRouter from './routes/booking'

import agenticRouter from './routes/agentic'

// import miniappRouter from './routes/miniapp'

// Set global options for Firebase Functions
setGlobalOptions({
  region: 'asia-northeast1',
  memory: '1GiB',
  timeoutSeconds: 120, // Increased timeout to 120 seconds
  maxInstances: 10,
  concurrency: 40,
})

const app = express()

// Middleware to parse JSON and verify raw body
app.use(
  express.json({
    verify: (req, res, buffer) => {
      req.rawBody = buffer
    },
  }),
)

// Modularized route handlers
const routes = [
  /* Step 1: Webhook route */
  { path: '/webhook', router: webhookRouter },
  /* Step 2: Mention route */
  // { path: '/mention', router: mentionRouter },
  /* Step 3: Message route */
  // { path: '/message', router: sendMessageRouter },
  /* Step 4: Beacon route */
  // { path: '/beacon', router: beaconRouter },
  /* Step 5: Storage route */
  // { path: '/storage', router: storageRouter },

  /* Step 6: MongoDB route */
  // { path: '/mongo', router: mongoeRouter },
  /* Step 7: Gemini route */
  // { path: '/gemini', router: geminiRouter },
  /* Step 8: Booking route */
  // { path: '/booking', router: bookingRouter },
  /* Step 9: Agentic route */
  // { path: '/agent', router: agenticRouter },
  /* Step 10: Miniapp route */
  // { path: '/miniapp', router: miniappRouter },
]

// Register routes dynamically
routes.forEach(({ path, router }) => app.use(path, router))

// Add a route for the root path
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

// Export the API endpoint
export const api = onRequest({ invoker: 'public' }, app)
