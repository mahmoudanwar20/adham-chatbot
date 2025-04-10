require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Webhook verification
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

// Webhook to receive messages
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const webhook_event = entry.messaging[0];
      const sender_psid = webhook_event.sender.id;

      if (webhook_event.message && webhook_event.message.text) {
        const userMessage = webhook_event.message.text;

        try {
          // Step 1: Create a thread
          const threadRes = await axios.post("https://api.openai.com/v1/threads", {}, {
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "OpenAI-Beta": "assistants=v1",
              "Content-Type": "application/json"
            }
          });

          const thread_id = threadRes.data.id;

          // Step 2: Add user message to the thread
          await axios.post(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
            role: "user",
            content: userMessage
          }, {
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "OpenAI-Beta": "assistants=v1",
              "Content-Type": "application/json"
            }
          });

          // Step 3: Run the assistant
          const runRes = await axios.post(`https://api.openai.com/v1/threads/${thread_id}/runs`, {
            assistant_id: process.env.ASSISTANT_ID
          }, {
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "OpenAI-Beta": "assistants=v1",
              "Content-Type": "application/json"
            }
          });

          const run_id = runRes.data.id;

          // Step 4: Poll until run is completed
          let status = "queued";
          while (status !== "completed" && status !== "failed") {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const statusRes = await axios.get(`https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`, {
              headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "assistants=v1"
              }
            });
            status = statusRes.data.status;
          }

          // Step 5: Get assistant response
          const messagesRes = await axios.get(`https://api.openai.com/v1/threads/${thread_id}/messages`, {
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "OpenAI-Beta": "assistants=v1"
            }
          });

          const messages = messagesRes.data.data;
          const lastMessage = messages.find(msg => msg.role === "assistant");

          const reply = lastMessage?.content?.[0]?.text?.value || "معرفتش أرد دلوقتي، جرب تاني.";

          await callSendAPI(sender_psid, reply);

        } catch (err) {
          console.error("Error during Assistant response:", err.message);
          await callSendAPI(sender_psid, "فيه مشكلة في السيرفر، جرب بعد شوية.");
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
