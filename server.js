const express = require('express');
const { Telegraf } = require('telegraf');
const { nanoid } = require('nanoid');
const fs = require('fs');
const axios = require('axios');

const DB_FILE = 'storage.json';
let fileStore = {};

// Initialize storage with compression
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
const MAX_FILE_SIZE = 2147483648; // 2GB

initializeStorage();
const app = express();
const bot = new Telegraf(BOT_TOKEN);

// Enhanced storage saving
const saveStorage = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(fileStore));
  } catch (e) {
    console.error('Storage save error:', e);
  }
};
setInterval(saveStorage, 30000);

// File handler with size validation
const handleFile = async (ctx) => {
  try {
    const file = ctx.message.document || 
                ctx.message.photo?.pop() || 
                ctx.message.video || 
                ctx.message.audio;

    if (!file) return;

    // Check file size
    if (file.file_size > MAX_FILE_SIZE) {
      return ctx.reply('❌ File exceeds 2GB limit');
    }

    // Get file info with retries
    let fileInfo;
    let retries = 3;
    while (retries--) {
      try {
        fileInfo = await bot.telegram.getFile(file.file_id);
        break;
      } catch (e) {
        if (retries === 0) throw e;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Generate filename
    let filename = file.file_name || 
                  fileInfo.file_path?.split('/').pop() || 
                  `file_${Date.now()}`;

    filename = filename
      .replace(/[^\w.-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 255);

    // Add extension
    const ext = filename.includes('.') 
      ? filename.split('.').pop()
      : fileInfo.file_path?.split('.').pop() || 
        file.mime_type?.split('/')[1] || 
        'dat';
        
    if (!filename.includes('.')) filename += `.${ext}`;

    // Store metadata
    const slug = nanoid(8);
    fileStore.files[slug] = {
      file_id: file.file_id,
      file_path: fileInfo.file_path,
      name: filename,
      size: file.file_size,
      mime_type: file.mime_type || 'application/octet-stream',
      timestamp: Date.now()
    };

    ctx.replyWithHTML(
      `📥 <b>Download Ready</b>\n` +
      `📁 ${filename}\n` +
      `🔗 <a href="${RENDER_URL}/${slug}">Direct Download Link</a>\n` +
      `📦 Size: ${(file.file_size / 1024 / 1024).toFixed(2)} MB`
    );

  } catch (error) {
    console.error('File error:', error);
    ctx.reply('❌ Failed to process file. Please send as document (not forward)');
  }
};

// Message handlers
bot.on(['document', 'photo', 'video', 'audio'], handleFile);
bot.on('media_group', async (ctx) => {
  await Promise.all(ctx.message.media_group.map(msg => 
    handleFile({ ...ctx, message: msg })
  );
});

// Download endpoint with chunked streaming
app.get('/:slug', async (req, res) => {
  try {
    const fileData = fileStore.files[req.params.slug];
    if (!fileData) return res.status(404).send('File not found');

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.file_path}`;
    
    const { headers } = await axios.head(fileUrl);
    const fileSize = parseInt(headers['content-length'], 10);

    res.setHeader('Content-Disposition', `attachment; filename="${fileData.name}"`);
    res.setHeader('Content-Type', fileData.mime_type);
    res.setHeader('Content-Length', fileSize);

    const { data } = await axios.get(fileUrl, { responseType: 'stream' });
    data.pipe(res);

  } catch (error) {
    console.error('Download failed:', error);
    res.status(410).send('Link expired');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bot.launch();
});
