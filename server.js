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

// Debugging logger
const logger = (msg) => {
  console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`);
  fs.appendFileSync('debug.log', `${new Date().toISOString()} - ${msg}\n`);
};

// Auto-save every 30 seconds
setInterval(() => {
  fs.writeFileSync(DB_FILE, JSON.stringify(fileStore));
}, 30000);

// Universal file handler with enhanced logging
const handleFile = async (ctx) => {
  try {
    logger(`Received message: ${JSON.stringify(ctx.message)}`);
    
    const file = ctx.message.document || 
                ctx.message.photo?.pop() || 
                ctx.message.video || 
                ctx.message.audio;

    if (!file) {
      logger('No file found in message');
      return;
    }

    // Get full file details from Telegram
    let fileInfo;
    try {
      fileInfo = await bot.telegram.getFile(file.file_id);
      logger(`File info: ${JSON.stringify(fileInfo)}`);
    } catch (error) {
      logger(`File info error: ${error.message}`);
      throw new Error('Could not retrieve file information');
    }

    // Generate filename with multiple fallbacks
    let filename = file.file_name || 
                  fileInfo.file_path?.split('/').pop() || 
                  `file_${Date.now()}`;

    filename = filename
      .replace(/[^\w.-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 255);

    // Add extension if missing
    if (!filename.includes('.')) {
      const ext = fileInfo.file_path?.split('.').pop() || 
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
    logger(`Link generated: ${ddlLink}`);

  } catch (error) {
    logger(`Error: ${error.stack}`);
    ctx.reply('❌ Error: Could not create link. Please send as document (not forward)');
  }
};

// Message handlers
bot.on(['document', 'photo', 'video', 'audio'], handleFile);
bot.on('media_group', async (ctx) => {
  await Promise.all(
    ctx.message.media_group.map(msg => 
      handleFile({ ...ctx, message: msg })
    )
  );
});

// Download endpoint
app.get('/:slug', async (req, res) => {
  try {
    const fileData = fileStore.files[req.params.slug];
    if (!fileData) return res.status(404).send('File not found');

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.file_path}`;
    
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
