// server.js (updated with dotenv)

// Load environment variables from .env file
// This should be at the VERY TOP of your file
require('dotenv').config();

const fs = require('fs');
const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 8080;

// This line now automatically gets the key from your .env file
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// The rest of the code remains exactly the same
app.post('/getRandomFact', async (req, res) => {
  console.log('Received request for /getRandomFact');
  const languageHeader = req.headers['accept-language'] || "en;q=1";
  const language = languageHeader.split(',')[0].split(';')[0];
  console.log('Extracted language:', language);
  if (!OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY is not defined in the .env file.');
    return res.status(500).json({
      error: 'Server configuration is incomplete: OpenRouter API key is missing.'
    });
  }

  try {
    let systemPrompt = fs.readFileSync('prompts/system-prompt.md', 'utf8');
    let userPrompt = fs.readFileSync('prompts/user-prompt.md', 'utf8');
    systemPrompt = systemPrompt.replace('%%LANGUAGE%%', language);
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8080",
        "X-Title": "Node8 Simple Fact API"
      },
      body: JSON.stringify({
        "model": "deepseek/deepseek-chat:free",
        "messages": [
          {
            "role": "system",
            "content": systemPrompt
          },
          {
            "role": "user",
            "content": userPrompt
          }
        ]
      }),
    });

    if (!openRouterResponse.ok) {
      const errorBody = await openRouterResponse.text();
      console.error('Error from OpenRouter API:', openRouterResponse.status, errorBody);
      return res.status(openRouterResponse.status).json({
        error: 'Error when requesting from OpenRouter API',
        details: errorBody
      });
    }

    const body = await openRouterResponse.json();
    console.log('Successfully received response from OpenRouter. Sending to client.');
    res.status(200).json(body);

  } catch (error) {
    console.error('An internal server error occurred:', error);
    res.status(500).json({
      error: 'An internal server error occurred',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running and listening on port ${PORT}`);
  console.log('To test, send a POST request to http://localhost:8080/getRandomFact');
});