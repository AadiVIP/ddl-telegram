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

// Universal file handler for forwarded files
const handleFile = async (ctx) => {
  try {
    const file = ctx.message.document || 
                ctx.message.photo?.pop() || 
                ctx.message.video || 
                ctx.message.audio;

    if (!file) return;

    // Get full file details from Telegram
    const fileInfo = await bot.telegram.getFile(file.file_id);
    
    // Generate filename from multiple sources
    let filename = file.file_name || 
                  fileInfo.file_path?.split('/').pop() || 
                  `file_${Date.now()}`;

    // Clean filename
    filename = filename
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') // Trim underscores
      .substring(0, 255); // Limit length

    // Handle empty filename case
    if (!filename) filename = `unknown_file_${Date.now()}`;

    // Get file extension
    let ext = filename.split('.').pop();
    if (!ext || ext === filename) {
      ext = fileInfo.file_path?.split('.').pop() || 
           file.mime_type?.split('/')[1] || 
           'dat';
      filename += `.${ext}`;
    }

    const slug = nanoid(8);
    
    fileStore.files[slug] = {
      file_id: file.file_id,
      file_path: fileInfo.file_path,
      name: filename,
      mime_type: file.mime_type || 'application/octet-stream',
      timestamp: Date.now()
    };

    const ddlLink = `${RENDER_URL}/${slug}`;
    ctx.replyWithHTML(`✅ <b>Download Link</b>:\n<a href="${ddlLink}">${filename}</a>`);

  } catch (error) {
    console.error('File handling error:', error);
    ctx.reply('❌ Error: Could not create link. Please try again.');
  }
};

// Handle all message types including forwards
bot.on(['document', 'photo', 'video', 'audio'], handleFile);
bot.on('media_group', async (ctx) => {
  await Promise.all(ctx.message.media_group.map(msg => 
    handleFile({ ...ctx, message: msg })
  );
});

// Download endpoint
app.get('/:slug', async (req, res) => {
  try {
    const fileData = fileStore.files[req.params.slug];
    if (!fileData) return res.status(404).send('File not found');

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.file_path}`;
    
    // Stream with proper headers
    const response = await axios.get(fileUrl, { responseType: 'stream' });
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.name}"`);
    res.setHeader('Content-Type', fileData.mime_type);
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
