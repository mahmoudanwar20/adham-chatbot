const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// اختبار البوت شغال ولا لأ
app.get("/", (req, res) => {
  res.send("✅ Adham Chatbot is running");
});

// تحقق من Webhook من فيسبوك
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("🟢 Webhook verified");
    res.status(200).send(challenge);
  } else {
    console.log("🔴 Webhook verification failed");
    res.sendStatus(403);
  }
});

// استقبال رسائل المستخدم من فيسبوك
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const sender_psid = event.sender.id;

      if (event.message?.text) {
        const userMessage = event.message.text;

        try {
          const response = await axios.post(
            `https://api.openai.com/v1/assistants/${process.env.ASSISTANT_ID}/messages`,
            {
              messages: [{ role: "user", content: userMessage }]
            },
            {
              headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json"
              }
            }
          );

          const reply = response.data.choices?.[0]?.message?.content || "معرفتش أرد دلوقتي.";
          await sendMessage(sender_psid, reply);

        } catch (error) {
          console.error("🛑 OpenAI Error:", error.message);
          await sendMessage(sender_psid, "حصلت مشكلة مؤقتة، حاول تاني بعد شوية.");
        }
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// إرسال الرسالة من البوت للمستخدم على فيسبوك
async function sendMessage(sender_psid, message) {
  const body = {
    recipient: { id: sender_psid },
    message: { text: message },
  };

  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
      body
    );
  } catch (error) {
    console.error("🛑 Error sending message:", error.message);
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
