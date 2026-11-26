const http = require('http');
const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

const PORT = process.env.PORT || 8080;

// Render / Cloud Hosting Health Check အတွက် HTTP Server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('TikTok Dhamma Live WebSocket Server is Running.');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let tiktokConnection = null;

  const sendJSON = (payload) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  ws.on('message', (rawMessage) => {
    let data;
    try {
      data = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (data.action === 'connect' && data.username) {
      const cleanUsername = data.username.trim().replace(/^@/, '');
      if (!cleanUsername) return;

      if (tiktokConnection) {
        try { tiktokConnection.disconnect(); } catch {}
      }

      sendJSON({ type: 'status', status: 'connecting' });

      tiktokConnection = new WebcastPushConnection(cleanUsername, {
        processInitialData: false,
        enableExtendedGiftInfo: true
      });

      tiktokConnection.connect()
        .then((state) => {
          sendJSON({
            type: 'status',
            status: 'connected',
            roomId: state.roomId,
            username: cleanUsername
          });
        })
        .catch((err) => {
          sendJSON({
            type: 'status',
            status: 'error',
            message: err.message || 'Live မလွှင့်ထားပါ သို့မဟုတ် ချိတ်ဆက်မရပါ'
          });
        });

      // 1. Viewer အသစ်ဝင်လာလျှင် (Join)
      tiktokConnection.on('member', (member) => {
        sendJSON({
          type: 'join',
          nickname: member.nickname || member.uniqueId,
          uniqueId: member.uniqueId
        });
      });

      // 2. Comment ရေးလျှင် (Chat)
      tiktokConnection.on('chat', (chat) => {
        sendJSON({
          type: 'chat',
          nickname: chat.nickname || chat.uniqueId,
          uniqueId: chat.uniqueId,
          comment: chat.comment || ''
        });
      });

      // 3. Gift ပေးလျှင် (Gift)
      tiktokConnection.on('gift', (gift) => {
        // Streak Gift (ဥပမာ Rose ဆက်တိုက်ပို့ခြင်း) ပြီးဆုံးမှ Trigger လုပ်ရန်
        if (gift.giftType === 1 && !gift.repeatEnd) return;
        sendJSON({
          type: 'gift',
          nickname: gift.nickname || gift.uniqueId,
          uniqueId: gift.uniqueId,
          giftName: gift.giftName || 'Gift',
          giftId: gift.giftId,
          repeatCount: gift.repeatCount || 1
        });
      });

      tiktokConnection.on('disconnected', () => {
        sendJSON({ type: 'status', status: 'disconnected' });
      });
    }

    if (data.action === 'disconnect' && tiktokConnection) {
      try { tiktokConnection.disconnect(); } catch {}
      tiktokConnection = null;
      sendJSON({ type: 'status', status: 'disconnected' });
    }
  });

  ws.on('close', () => {
    if (tiktokConnection) {
      try { tiktokConnection.disconnect(); } catch {}
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
