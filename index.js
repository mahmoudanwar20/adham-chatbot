
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Adham Chatbot is running");
});

app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        const userMessage = webhook_event.message.text;

        // Call OpenAI Assistant
        try {
          const openaiRes = await axios.post(
            "https://api.openai.com/v1/assistants/" + process.env.ASSISTANT_ID + "/messages",
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

          const reply = openaiRes.data.choices?.[0]?.message?.content || "معرفتش أرد على سؤالك دلوقتي.";
          await callSendAPI(sender_psid, reply);

        } catch (err) {
          console.error("Error from OpenAI:", err.message);
          await callSendAPI(sender_psid, "حصلت مشكلة في السيرفر، حاول تاني بعد شوية.");
        }
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

async function callSendAPI(sender_psid, response) {
  const request_body = {
    recipient: { id: sender_psid },
    message: { text: response },
  };

  try {
    await axios.post(`https://graph.facebook.com/v17.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`, request_body);
  } catch (err) {
    console.error("Unable to send message:", err.message);
  }
}

app.listen(PORT, () => {
  console.log("Server is running on port", PORT);
});
