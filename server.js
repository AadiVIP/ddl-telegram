const express = require('express');
const { Telegraf } = require('telegraf');
const { nanoid } = require('nanoid');
const fs = require('fs');
const axios = require('axios');

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

const BOT_TOKEN = process.env.BOT_TOKEN;
const RENDER_URL = process.env.RENDER_URL;

initializeStorage();
const app = express();
const bot = new Telegraf(BOT_TOKEN);

// Auto-save every 30 seconds
setInterval(() => {
  fs.writeFileSync(DB_FILE, JSON.stringify(fileStore));
}, 30000);

// Handle all file types including forwarded
const handleFile = async (ctx) => {
  try {
    const file = ctx.message.document || 
                ctx.message.photo?.pop() || 
                ctx.message.video || 
                ctx.message.audio;

    if (!file) return;

    const slug = nanoid(8);
    const originalFile = await bot.telegram.getFile(file.file_id);
    
    // Get original filename or generate one
    let filename = file.file_name || `file_${Date.now()}`;
    filename = filename
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/\s+/g, '_');

    // Preserve extension from MIME type if missing
    if (!filename.includes('.')) {
      const ext = originalFile.file_path?.split('.').pop() || 
                 file.mime_type?.split('/')[1] || 
                 'dat';
      filename += `.${ext}`;
    }

    fileStore.files[slug] = {
      file_id: file.file_id,
      file_path: originalFile.file_path,
      name: filename,
      mime_type: file.mime_type,
      timestamp: Date.now()
    };

    const ddlLink = `${RENDER_URL}/${slug}`;
    ctx.replyWithHTML(`✅ <b>Permanent Link</b>:\n<a href="${ddlLink}">${filename}</a>`);
  } catch (error) {
    console.error('Error handling file:', error);
    ctx.reply('❌ Failed to create link. Please send the file directly (not forwarded).');
  }
};

// Handle media groups and single files
bot.on(['document', 'photo', 'video', 'audio'], handleFile);
bot.on('media_group', async (ctx) => {
  await Promise.all(ctx.message.media_group.map(msg => handleFile({ ...ctx, message: msg })));
});

// Download endpoint
app.get('/:slug', async (req, res) => {
  try {
    const fileData = fileStore.files[req.params.slug];
    if (!fileData) return res.status(404).send('File not found');

    const fileLink = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.file_path}`;
    
    // Stream file with proper headers
    const response = await axios.get(fileLink, { responseType: 'stream' });
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.name}"`);
    res.setHeader('Content-Type', fileData.mime_type || 'application/octet-stream');
    response.data.pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(410).send('Link expired or invalid');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bot.launch();
});
