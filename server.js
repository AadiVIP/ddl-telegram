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

const handleFile = async (ctx) => {
  try {
    const isForwarded = !!ctx.message.forward_date;
    let file = null;

    if (isForwarded) {
      file = ctx.message.document || 
            ctx.message.photo?.pop() || 
            ctx.message.video || 
            ctx.message.audio;
    } else {
      file = ctx.message.document || 
            ctx.message.photo?.pop() || 
            ctx.message.video || 
            ctx.message.audio;
    }

    if (!file) return ctx.reply('❌ No file found');

    const fileInfo = await bot.telegram.getFile(file.file_id);
    
    let filename = file.file_name || 
                  fileInfo.file_path?.split('/').pop() || 
                  `file_${Date.now()}`;

    filename = filename
      .replace(/[^\w.-]/g, '_')
      .substring(0, 255);

    if (!filename.includes('.')) {
      const ext = fileInfo.file_path?.split('.').pop() || 'dat';
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
    ctx.replyWithHTML(`✅ <a href="${ddlLink}">${filename}</a>`);

  } catch (error) {
    ctx.reply('❌ Error processing file');
  }
};

// Fixed media group handler with proper parentheses
bot.on(['document', 'photo', 'video', 'audio'], handleFile);
bot.on('media_group', async (ctx) => {
  await Promise.all(
    ctx.message.media_group.map(msg => 
      handleFile({ ...ctx, message: msg })
    ) // Correct closing parenthesis
  );
});

bot.command('ddl', async (ctx) => {
  if (ctx.message.reply_to_message) {
    await handleFile({
      ...ctx,
      message: ctx.message.reply_to_message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  bot.launch();
});
