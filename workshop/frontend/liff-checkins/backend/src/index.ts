import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import axios from 'axios';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// In-memory check-in data
interface Checkin {
  userId: string;
  displayName: string;
  pictureUrl: string;
  timestamp: number;
}
let checkins: Checkin[] = [];

// Broadcast to all websocket clients
function broadcastCheckins() {
  const today = new Date().toISOString().slice(0, 10);
  const todayCheckins = checkins.filter(c => new Date(c.timestamp).toISOString().slice(0, 10) === today);
  const payload = {
    date: today,
    count: todayCheckins.length,
    checkins: todayCheckins,
  };

  console.log('Broadcasting check-ins:', payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  });
}

// ฟังก์ชันสร้าง Flex Message Card Profile
function createFlexProfileCard({ displayName, pictureUrl, timestamp }: { displayName: string; pictureUrl: string; timestamp: number }) {
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return {
    type: 'flex',
    altText: 'คุณได้เข้า พื้นที่แล้ว',
    contents: {
      type: 'bubble',
      size: 'mega',
      hero: {
        type: 'image',
        url: pictureUrl,
        size: 'full',
        aspectRatio: '1:1',
        aspectMode: 'cover',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          {
            type: 'text',
            text: displayName,
            weight: 'bold',
            size: 'xl',
            align: 'center',
            wrap: true,
          },
          {
            type: 'text',
            text: 'คุณได้เข้า พื้นที่แล้ว',
            size: 'md',
            color: '#00B900',
            align: 'center',
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            margin: 'md',
            contents: [
              {
                type: 'text',
                text: 'กิจกรรม',
                color: '#aaaaaa',
                size: 'sm',
                flex: 2,
              },
              {
                type: 'text',
                text: 'LINE API x Generative AI for Developer',
                wrap: true,
                color: '#333333',
                size: 'sm',
                flex: 5,
              },
            ],
          },
          {
            type: 'box',
            layout: 'baseline',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: 'วันเวลา',
                color: '#aaaaaa',
                size: 'sm',
                flex: 2,
              },
              {
                type: 'text',
                text: `${dateStr} ${timeStr} น.`,
                wrap: true,
                color: '#333333',
                size: 'sm',
                flex: 5,
              },
            ],
          },
        ],
      },
    },
  };
}

// LINE Webhook endpoint (for Beacon)
app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!Array.isArray(events)) return res.status(400).send('Invalid payload');
  for (const event of events) {

    console.log('Received event:', event);


    if (event.type === 'beacon' && event.beacon && event.source && event.source.userId) {
    // Log LINE Beacon event
      console.log('[LINE BEACON]', {
        userId: event.source.userId,
        hwid: event.beacon.hwid,
        type: event.beacon.type,
        timestamp: event.timestamp,
      });
        // Get user profile from LINE
          try {

            const profileRes = await axios.get(
                `https://api.line.me/v2/bot/profile/${event.source.userId}`,
                {
                headers: {
                    Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
            );
            const { userId, displayName, pictureUrl } = profileRes.data;

            console.log('LINE profile:', { userId, displayName, pictureUrl });
            
            checkins.push({ userId, displayName, pictureUrl, timestamp: Date.now() });
            broadcastCheckins();
            // ส่ง Flex Message กลับไปยังผู้ใช้
            const flexMsg = createFlexProfileCard({ displayName, pictureUrl, timestamp: Date.now() });
            await axios.post('https://api.line.me/v2/bot/message/push', {
              to: userId,
              messages: [flexMsg],
            }, {
              headers: {
                Authorization: `Bearer  ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
              },
            });
          } catch (e) {
            console.error('LINE profile error', e);
          }
    }
  }
  res.status(200).send('OK');
});

// Endpoint สำหรับ reset checkins
app.post('/reset', (req, res) => {
  checkins = [];
  broadcastCheckins();
  res.status(200).send('Reset OK');
});

wss.on('connection', ws => {
  // ส่งข้อมูลล่าสุดให้ client ที่เพิ่งเชื่อมต่อ
  const today = new Date().toISOString().slice(0, 10);
  const todayCheckins = checkins.filter(c => new Date(c.timestamp).toISOString().slice(0, 10) === today);
  ws.send(JSON.stringify({
    date: today,
    count: todayCheckins.length,
    checkins: todayCheckins,
  }));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
