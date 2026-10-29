/**
 * TODO: Global error handler
 *
 * Handle different error types:
 *
 * 1. Multer file size error (err.code === 'LIMIT_FILE_SIZE'):
 *    - Return 400 with { error: { message: 'File size exceeds 5MB limit' } }
 *
 * 2. Multer file type error (err.message includes 'Invalid file type'):
 *    - Return 400 with { error: { message: err.message } }
 *
 * 3. Mongoose validation error (err.name === 'ValidationError'):
 *    - Extract messages from err.errors
 *    - Return 400 with { error: { message: 'combined messages' } }
 *
 * 4. Mongoose duplicate key error (err.code === 11000):
 *    - Return 409 with { error: { message: 'Resource already exists' } }
 *
 * 5. Default error:
 *    - Return status from err.status or 500
 *    - { error: { message: err.message || 'Internal server error' } }
 */
export function errorHandler(err, req, res, next) {
  // When multer rejects a file it stops reading the request. Answering while part of the body
  // is still unread makes Node reset the connection, so the client never sees our 400.
  // Discard the rest of the body first, then respond.
  if (!req.readableEnded && !req.destroyed) {
    let handled = false;
    const respond = () => {
      if (handled) return;
      handled = true;
      sendError(err, res);
    };
    req.once('end', respond);
    req.once('close', respond);
    req.resume();
    return;
  }

  return sendError(err, res);
}

function sendError(err, res) {
  if (res.headersSent) return;

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: { message: 'File size exceeds 5MB limit' } });
  }

  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ error: { message: err.message } });
  }

  // Other upload problems (wrong field name, too many files, ...) are client errors too.
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: { message: err.message } });
  }

  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((fieldError) => fieldError.message)
      .join(', ');
    return res.status(400).json({ error: { message } });
  }

  if (err.code === 11000) {
    return res.status(409).json({ error: { message: 'Resource already exists' } });
  }

  const status = err.status || err.statusCode || 500;
  return res.status(status).json({ error: { message: err.message || 'Internal server error' } });
}
