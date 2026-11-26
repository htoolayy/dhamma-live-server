const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Dhamma Live WebSocket Server is running.');
});

wss.on('connection', (ws) => {
  let tiktokConnection = null;

  const safeSend = (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  safeSend({ type: 'status', message: 'WebSocket server ready' });

  ws.on('message', async (rawMessage) => {
    try {
      const msg = JSON.parse(rawMessage.toString());

      if (msg.type === 'connect' && msg.username) {
        const cleanUsername = msg.username.replace(/^@/, '').trim();

        if (tiktokConnection) {
          try {
            tiktokConnection.disconnect();
          } catch (_) {}
          tiktokConnection = null;
        }

        safeSend({ type: 'status', message: `Connecting to @${cleanUsername}...` });

        tiktokConnection = new WebcastPushConnection(cleanUsername, {
          processInitialData: false,
          enableExtendedGiftInfo: true,
          requestPollingIntervalMs: 2000
        });

        try {
          const state = await tiktokConnection.connect();
          safeSend({
            type: 'status',
            message: `Connected to @${cleanUsername} (Room: ${state.roomId})`
          });
        } catch (err) {
          safeSend({
            type: 'error',
            message: `Connection failed: ${err?.message || 'Unable to connect (Live may be offline or blocked)'}`
          });
        }

        tiktokConnection.on('member', (data) => {
          safeSend({
            type: 'join',
            uniqueId: data.uniqueId,
            nickname: data.nickname || data.uniqueId,
            profilePictureUrl: data.profilePictureUrl || ''
          });
        });

        tiktokConnection.on('chat', (data) => {
          safeSend({
            type: 'chat',
            uniqueId: data.uniqueId,
            nickname: data.nickname || data.uniqueId,
            comment: data.comment || ''
          });
        });

        tiktokConnection.on('gift', (data) => {
          if (data.giftType === 1 && !data.repeatEnd) return;

          safeSend({
            type: 'gift',
            uniqueId: data.uniqueId,
            nickname: data.nickname || data.uniqueId,
            giftId: data.giftId,
            giftName: data.giftName || 'Gift',
            giftPictureUrl: data.giftPictureUrl || '',
            repeatCount: data.repeatCount || 1,
            diamondCount: data.diamondCount || 1
          });
        });

        tiktokConnection.on('disconnected', () => {
          safeSend({ type: 'status', message: 'TikTok Live disconnected' });
        });

        tiktokConnection.on('error', (err) => {
          safeSend({ type: 'error', message: err?.message || 'TikTok stream error' });
        });
      }
    } catch (e) {
      safeSend({ type: 'error', message: 'Invalid command format' });
    }
  });

  ws.on('close', () => {
    if (tiktokConnection) {
      try {
        tiktokConnection.disconnect();
      } catch (_) {}
    }
  });
});

server.listen(PORT, () => {
  console.log(`Dhamma Live Server listening on port ${PORT}`);
});
