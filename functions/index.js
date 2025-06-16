const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { onCall } = require("firebase-functions/v2/https");
const axios = require("axios");


admin.initializeApp();

// --- FUNCTION 1: For your old Shortcut ---
exports.addEntry = functions.https.onRequest(async (req, res) => {
    // Enable CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const { token, data } = req.body;

        if (!token) {
            res.status(400).json({ error: 'Missing shortcut token' });
            return;
        }
        if (!data) {
            res.status(400).json({ error: 'Missing data' });
            return;
        }
        
        console.log("Data received from shortcut:", JSON.stringify(data, null, 2));

        const usersSnapshot = await admin.firestore().collection('users').where('shortcutToken', '==', token).limit(1).get();
        if (usersSnapshot.empty) {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }

        const userId = usersSnapshot.docs[0].id;
        
        // --- THIS IS THE CORRECTED PART ---
        // It now includes all the fields from Claude's response.
        const entryData = {
            title: data.title || 'Untitled',
            summary: data.summary || '',
            content: data.content || '',
            tags: data.tags || [],
            address: data.address || null,
            calendar_link: data.calendar_link || null,
            product_name: data.product_name || null,
            amazon_search_url: data.amazon_search_url || null,
            confidence: data.confidence || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await admin.firestore().collection('users').doc(userId).collection('entries').add(entryData);
        
        console.log(`Entry added with ID: ${docRef.id} via shortcut`);
        res.status(200).json({ success: true, id: docRef.id });

    } catch (error) {
        console.error('Error adding entry:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});


// --- FUNCTION 2: For your new iOS App ---
// This is now at the top level, outside of addEntry. making sure to remove secrets
exports.analyzeImage   = onCall(
    { timeoutSeconds: 300, region: "us-central1" },
    async (request) => {
        if (!request.auth) {
          throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
        }
        const imagePath = request.data.imagePath;
        if (!imagePath) {
          throw new functions.https.HttpsError("invalid-argument", "The function must be called with an 'imagePath' argument.");
        }

        try {
          const bucket = admin.storage().bucket();
          const file = bucket.file(imagePath);
          const [imageBuffer] = await file.download();
          const base64Image = imageBuffer.toString("base64");
          const claudeApiKey = process.env.CLAUDE_API_KEY;
          
          // -----> PASTE YOUR DETAILED PROMPT FROM YOUR SHORTCUT HERE <-----
          const userPrompt = `Based on this image and extracted text from a image respond with ONLY a valid JSON object (no other text, no markdown, no explanation):\n\n{\n \"title\": \"concise descriptive title max 10 words\",\n \"summary\": \"one sentence summary\",\n \"content\": \"bullet points as single string with commas between points\",\n \"tags\": [\"tag1\", \"tag2\", \"tag3\"],\n \"calendar_link\": \"Google Calendar URL if event detected, otherwise null\",\n \"address\": \"full street address if detected, otherwise null\",\n \"product_name\": \"specific product name if identified, otherwise null\",\n \"amazon_search_url\": \"Amazon search URL if product identified, otherwise null\",\n \"confidence\": \"high/medium/low if product identified, otherwise null\"\n}\n\nIf you detect any event with date/time/location info, create a Google Calendar link using: https://calendar.google.com/calendar/render?action=TEMPLATE&text=EVENT_TITLE&dates=START_TIME/END_TIME&location=LOCATION\n\nIf you detect any physical address (street address, not just city/state), include the complete address in the address field.\n\nFor product identification: Look for clear, identifiable products (clothing, electronics, books, furniture, etc.). Focus on the most prominent product. If identified, create Amazon search URL: https://amazon.com/s?k=[product-description-with-plus-signs-for-spaces]. Example: \"Blue Nike sneakers\" = \"https://amazon.com/s?k=blue+nike+sneakers\". Only include if reasonably confident.`;

          const response = await axios.post(
            "https://api.anthropic.com/v1/messages",
            { model: "claude-3-5-haiku-20241022", max_tokens: 1000, messages: [ { role: "user", content: [ { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } }, { type: "text", text: userPrompt } ] } ] },
            { headers: { "x-api-key": claudeApiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" } }
          );

          const claudeResponseText = response.data.content[0].text;
          const jsonString = claudeResponseText.replace(/```json\n|```/g, '').trim();
          const parsedData = JSON.parse(jsonString);

          const finalEntry = {
              ...parsedData,
              userId: request.auth.uid,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
          };
          
          const userId = request.auth.uid;
          const writeResult = await admin.firestore().collection('users').doc(userId).collection('entries').add(finalEntry);
          
          await file.delete();

          return { status: "success", entryId: writeResult.id };

        } catch (error) {
          console.error("An error occurred:", error.response ? error.response.data : error.message);
          throw new functions.https.HttpsError("internal", "An error occurred while processing the image.", error.message);
        }
      }
);