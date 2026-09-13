/**
 * @file app.js
 * @description Express and Socket.IO application initialization and middleware configuration.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { registerSocketHandlers } = require('./sockets/socketHandlers');

/**
 * Creates and configures the Express and Socket.IO application.
 * @returns {{ app: Express, server: http.Server, io: Server }}
 */
function createApp() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  // Serve static assets from public/ directory
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Register all Socket.IO real-time event handlers
  registerSocketHandlers(io);

  return { app, server, io };
}

module.exports = { createApp };

