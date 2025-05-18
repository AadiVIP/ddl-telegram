const express = require('express');
const { Telegraf } = require('telegraf');
const { nanoid } = require('nanoid');
const fs = require('fs');
const path = require('path');

// Simple file-based storage
const DB_FILE = 'storage.json';
let fileStore = {};

// Initialize storage
const initializeStorage = () => {
  try {
    fileStore = fs.existsSync(DB_FILE) 
      ? JSON.parse(fs.readFileSync(DB_FILE))
      : { files: {} };
  } catch (e) {
    fileStore = { files: {} };
  }
};

// Get environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const RENDER_URL = process.env.RENDER_URL;

// Initialize services
initializeStorage();
const app = express();
const bot = new Telegraf(BOT_TOKEN);

// Auto-save every 30 seconds
setInterval(() => {
  fs.writeFileSync(DB_FILE, JSON.stringify(fileStore));
}, 30000);

// Handle files
bot.on(['document', 'photo', 'video', 'audio'], (ctx) => {
  const file = ctx.message.document || 
              ctx.message.photo?.pop() || 
              ctx.message.video || 
              ctx.message.audio;

  const slug = nanoid(8);
  const filename = file.file_name || `file_${Date.now()}`;

  fileStore.files[slug] = {
    file_id: file.file_id,
    name: filename,
    timestamp: Date.now()
  };

  const ddlLink = `${RENDER_URL}/${slug}`;
  ctx.replyWithHTML(`🌐 <b>Download Link</b>:\n<a href="${ddlLink}">${ddlLink}</a>`);
});

// Redirect endpoint
app.get('/:slug', async (req, res) => {
  const fileData = fileStore.files[req.params.slug];
  
  if (!fileData) return res.status(404).send('File not found');
  
  try {
    const fileLink = await bot.telegram.getFileLink(fileData.file_id);
    res.redirect(fileLink.href);
  } catch (error) {
    res.status(410).send('Link expired');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bot.launch();
});
