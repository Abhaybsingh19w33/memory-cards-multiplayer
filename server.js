/**
 * @file server.js
 * @description Main application server bootstrap.
 * Starts the HTTP server on configured PORT.
 */

const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const { server } = createApp();

server.listen(PORT, () => {
  console.log(`Memory Cards server listening on :${PORT}`);
});
