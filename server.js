const handleFile = async (ctx) => {
  try {
    // Detect forwarded messages
    const isForwarded = !!ctx.message.forward_date;
    let file = null;

    // Check both original and forwarded message structures
    if (isForwarded) {
      file = ctx.message.document || 
            ctx.message.photo?.pop() || 
            ctx.message.video || 
            ctx.message.audio ||
            (ctx.message.forward_from_message && (
              ctx.message.forward_from_message.document ||
              ctx.message.forward_from_message.photo?.pop() ||
              ctx.message.forward_from_message.video ||
              ctx.message.forward_from_message.audio
            ));
    } else {
      file = ctx.message.document || 
            ctx.message.photo?.pop() || 
            ctx.message.video || 
            ctx.message.audio;
    }

    if (!file) {
      return ctx.reply('❌ Please send the file directly as a document (not as a forward)');
    }

    // Handle forwarded files with missing metadata
    const fileInfo = await bot.telegram.getFile(file.file_id);
    
    // Generate filename with multiple fallbacks
    let filename = file.file_name || 
                  fileInfo.file_path?.split('/').pop() || 
                  `file_${Date.now()}`;

    // Clean filename
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
    
    // Store both original and forwarded metadata
    fileStore.files[slug] = {
      file_id: file.file_id,
      file_path: fileInfo.file_path,
      name: filename,
      mime_type: file.mime_type || 'application/octet-stream',
      is_forwarded: isForwarded,
      timestamp: Date.now()
    };

    const ddlLink = `${RENDER_URL}/${slug}`;
    ctx.replyWithHTML(`✅ <b>Download Link</b>:\n<a href="${ddlLink}">${filename}</a>`);

  } catch (error) {
    console.error('Error handling file:', error);
    ctx.reply('❌ Failed to create link. Please try sending as a document (not forward)');
  }
};

// Add command to handle forwarded messages
bot.command('ddl', async (ctx) => {
  if (ctx.message.reply_to_message) {
    await handleFile({
      ...ctx,
      message: ctx.message.reply_to_message
    });
  } else {
    ctx.reply('❌ Please reply to a file message with /ddl');
  }
});
