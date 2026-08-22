require('dotenv').config();

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

console.log('admin keys:', Object.keys(admin));
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Used when deployed on Render (see Step 8)
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Used for local testing
  serviceAccount = require('./serviceAccountKey.json');
}

admin.initializeApp({
  credential: admin.cert(serviceAccount)
});

async function getConversation(phone) {
  const doc = await db.collection('conversations').doc(phone).get();
  return doc.exists ? doc.data() : null;
}

async function saveConversation(phone, data) {
  await db.collection('conversations').doc(phone).set(data, { merge: true });
}

const db = getFirestore();
const express = require('express');
const app = express();
app.use(express.json());

const axios = require('axios');

async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`;
  try {
    await axios.post(url, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    }, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('Send failed:', err.response?.data || err.message);
  }
}

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

app.post('/webhook', async (req, res) => {
  console.log('Webhook hit!', JSON.stringify(req.body));
  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];

  if (message) {
    const from = message.from;
    const text = message.text?.body?.trim();
    console.log(`Message from ${from}: ${text}`);
    await handleMessage(from, text);
  }

  res.sendStatus(200);
});

async function handleMessage(from, text) {
  const convo = await getConversation(from);

  if (!convo) {
    await saveConversation(from, { state: 'ASK_NAME' });
    await sendWhatsAppMessage(
      from,
      "Welcome! 🦷 Let's get your appointment booked.\n\nWhat's your name?"
    );
    return;
  }

  switch (convo.state) {
    case 'ASK_NAME': {
      await saveConversation(from, { name: text, state: 'ASK_REASON' });
      await sendWhatsAppMessage(
        from,
        `Thanks, ${text}! What's the reason for your visit?\n\n1. Consultation\n2. Cleaning\n3. Other`
      );
      break;
    }

    case 'ASK_REASON': {
      const reasonMap = { '1': 'Consultation', '2': 'Cleaning', '3': 'Other' };
      const reason = reasonMap[text] || text;
      await saveConversation(from, { reason, state: 'ASK_SLOT_PLACEHOLDER' });
      await sendWhatsAppMessage(
        from,
        `Got it!\nName: ${convo.name}\nReason: ${reason}\n\n(Time slot booking is coming very soon — thanks for testing!)`
      );
      break;
    }

    default: {
      await sendWhatsAppMessage(
        from,
        "Thanks for your message! We're still setting things up — check back soon."
      );
    }
  }
}


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

