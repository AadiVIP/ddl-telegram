const express = require('express');
const { Telegraf } = require('telegraf');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { nanoid } = require('nanoid');

// Initialize database with sync check
const adapter = new JSONFile('db.json');
const db = new Low(adapter);

// Immediately initialize database before anything else
(async () => {
  await db.read();
  if (!db.data || typeof db.data !== 'object') {
    db.data = { files: {} };
    await db.write();
  }
})();

// Get environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const RENDER_URL = process.env.RENDER_URL;

// Initialize Express and Telegraf
const app = express();
const bot = new Telegraf(BOT_TOKEN);

// Handle file messages
bot.on(['document', 'photo', 'video', 'audio'], async (ctx) => {
  const file = ctx.message.document || 
              ctx.message.photo?.pop() || 
              ctx.message.video || 
              ctx.message.audio;

  if (!file) return;

  const slug = nanoid(8);
  const fileType = file.file_name?.split('.').pop() || 'file';
  
  db.data.files[slug] = {
    file_id: file.file_id,
    original_name: file.file_name || `file_${Date.now()}.${fileType}`,
    timestamp: Date.now()
  };
  
  await db.write();

  const ddlLink = `${RENDER_URL}/${slug}`;
  ctx.replyWithHTML(`🌐 <b>Permanent Download Link</b>:\n\n` +
                    `<a href="${ddlLink}">${ddlLink}</a>\n\n` +
                    `📁 File: ${db.data.files[slug].original_name}`);
});

// Redirect endpoint
app.get('/:slug', async (req, res) => {
  const fileData = db.data.files[req.params.slug];

  if (!fileData) {
    return res.status(404).send('File not found');
  }

  try {
    const fileLink = await bot.telegram.getFileLink(fileData.file_id);
    res.redirect(302, fileLink.href);
  } catch (error) {
    console.error('Error:', error);
    res.status(410).send('Link expired or invalid');
  }
});

// Start services
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bot.launch();
  console.log('Bot started');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
