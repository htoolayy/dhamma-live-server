const WebSocket = require('ws');
const { WebcastPushConnection } = require('tiktok-live-connector');

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

console.log(`Server listening on port ${PORT}`);

function safeSend(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

wss.on('connection', (ws) => {
  let tiktokConn = null;

  function cleanupTikTok() {
    if (tiktokConn) {
      try {
        tiktokConn.removeAllListeners();
      } catch (_) {}
      try {
        tiktokConn.disconnect();
      } catch (_) {}
      tiktokConn = null;
    }
  }

  safeSend(ws, {
    type: 'status',
    status: 'ready',
    message: 'WebSocket server ready'
  });

  ws.on('message', async (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());

      if (msg.type === 'disconnect') {
        cleanupTikTok();
        safeSend(ws, { type: 'status', status: 'offline' });
        return;
      }

      if (msg.type === 'connect') {
        const username = String(msg.username || '').replace(/^@/, '').trim();
        if (!username) {
          safeSend(ws, { type: 'error', message: 'TikTok @username ထည့်သွင်းပါ။' });
          return;
        }

        cleanupTikTok();
        safeSend(ws, { type: 'status', status: 'connecting', username });

        tiktokConn = new WebcastPushConnection(username, {
          processInitialData: true,
          enableExtendedGiftInfo: true,
          enableWebsocketUpgrade: true,
          requestHeaders: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });

        tiktokConn.on('connected', (state) => {
          safeSend(ws, {
            type: 'status',
            status: 'connected',
            username,
            roomId: state && state.roomId ? state.roomId : null
          });
        });

        tiktokConn.on('disconnected', () => {
          safeSend(ws, { type: 'status', status: 'offline' });
        });

        tiktokConn.on('member', (data) => {
          safeSend(ws, {
            type: 'join',
            user: data.uniqueId || data.nickname || 'ဧည့်သည်',
            nickname: data.nickname || data.uniqueId || 'ဧည့်သည်'
          });
        });

        tiktokConn.on('chat', (data) => {
          safeSend(ws, {
            type: 'chat',
            user: data.uniqueId || data.nickname || 'ဧည့်သည်',
            nickname: data.nickname || data.uniqueId || 'ဧည့်သည်',
            comment: data.comment || ''
          });
        });

        tiktokConn.on('gift', (data) => {
          const streakFinished = data.giftType === 1 && !data.repeatEnd;
          if (streakFinished) return;

          safeSend(ws, {
            type: 'gift',
            user: data.uniqueId || data.nickname || 'အလှူရှင်',
            nickname: data.nickname || data.uniqueId || 'အလှူရှင်',
            giftName: data.giftName || 'လက်ဆောင်',
            repeatCount: data.repeatCount || 1
          });
        });

        tiktokConn.on('streamEnd', () => {
          safeSend(ws, {
            type: 'status',
            status: 'offline',
            message: 'TikTok LIVE ပြီးဆုံးသွားပါပြီ။'
          });
        });

        tiktokConn.on('error', (err) => {
          const errText = err && err.message ? err.message : String(err);
          safeSend(ws, {
            type: 'error',
            message: errText.includes('403')
              ? 'TikTok ဘက်မှ Render Cloud Request ကို 403 ပိတ်ထားပါသည်။ Test ခလုတ်များဖြင့် ဆက်လက်လွှင့်နိုင်ပါသည်။'
              : errText
          });
        });

        try {
          const state = await tiktokConn.connect();
          safeSend(ws, {
            type: 'status',
            status: 'connected',
            username,
            roomId: state && state.roomId ? state.roomId : null
          });
        } catch (connectErr) {
          const errText = connectErr && connectErr.message ? connectErr.message : String(connectErr);
          safeSend(ws, {
            type: 'error',
            message: errText.includes('403')
              ? 'Failed to sign request (403): TikTok ဘက်မှ Render IP ကို 403 ပိတ်ထားပါသည်။ Test Join / Test Rose ခလုတ်များဖြင့် Live ဆက်လွှင့်နိုင်ပါသည်။'
              : `ချိတ်ဆက်မှု မအောင်မြင်ပါ: ${errText}`
          });
        }
      }
    } catch (parseErr) {
      safeSend(ws, {
        type: 'error',
        message: `Invalid request format: ${parseErr.message}`
      });
    }
  });

  ws.on('close', () => {
    cleanupTikTok();
  });

  ws.on('error', () => {
    cleanupTikTok();
  });
});
