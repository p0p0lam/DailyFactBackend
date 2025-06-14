// api/controllers/fact.controller.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Construct paths relative to the current file
const systemPromptPath = path.join(__dirname, '../../prompts/system-prompt.md');
const userPromptPath = path.join(__dirname, '../../prompts/user-prompt.md');

exports.getRandomFact = async (req, res) => {
  const language = (req.headers['accept-language'] || "en").split(',')[0].split(';')[0];
  console.log(`Request for fact in language: ${language}`);

  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'Server configuration error: API key is missing.' });
  }

  try {
    let systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
    let userPrompt = fs.readFileSync(userPromptPath, 'utf8').replace('%%LANGUAGE%%', language);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.SITE_URL || "http://localhost:8080",
        "X-Title": "NodeJS Simple Fact API"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat:free",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('OpenRouter API Error:', response.status, errorBody);
      return res.status(response.status).json({ error: 'Error from OpenRouter API', details: errorBody });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Internal server error in getRandomFact:', error);
    res.status(500).json({ error: 'An internal server error occurred', details: error.message });
  }
};