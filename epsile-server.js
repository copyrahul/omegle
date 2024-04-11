#!/usr/bin/env node
// epsile server
// created by djazz
'use strict';

// config
const port = 8001;

// load and initialize modules
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

server.listen(port, () => {
  console.log(`epsile server listening at port ${port}`);
});

app.use(express.static(__dirname + '/'));

// global variables, keeps the state of the app
const sockets = {};
const users = {};
let strangerQueue = false;
let peopleActive = 0;
let peopleTotal = 0;

// helper functions, for logging
function fillZero(val) {
  if (val > 9) return "" + val;
  return "0" + val;
}

function timestamp() {
  const now = new Date();
  return `[${fillZero(now.getHours())}:${fillZero(now.getMinutes())}:${fillZero(now.getSeconds())}]`;
}

// listen for connections
io.on('connection', (socket) => {
  // store the socket and info about the user
  sockets[socket.id] = socket;
  users[socket.id] = {
    connectedTo: -1,
    isTyping: false
  };

  // connect the user to another if strangerQueue isn't empty
  if (strangerQueue !== false) {
    users[socket.id].connectedTo = strangerQueue;
    users[socket.id].isTyping = false;
    users[strangerQueue].connectedTo = socket.id;
    users[strangerQueue].isTyping = false;
    socket.emit('conn');
    sockets[strangerQueue].emit('conn');
    strangerQueue = false;

  } else {
    strangerQueue = socket.id;
  }

  peopleActive++;
  peopleTotal++;
  console.log(timestamp(), peopleTotal, "connect");
  io.sockets.emit('stats', { people: peopleActive });

  socket.on("new", () => {
    // Got data from someone
    if (strangerQueue !== false) {
      users[socket.id].connectedTo = strangerQueue;
      users[strangerQueue].connectedTo = socket.id;
      users[socket.id].isTyping = false;
      users[strangerQueue].isTyping = false;
      socket.emit('conn');
      sockets[strangerQueue].emit('conn');
      strangerQueue = false;
    } else {
      strangerQueue = socket.id;
    }
    peopleActive++;
    io.sockets.emit('stats', { people: peopleActive });
  });

  // Conversation ended
  socket.on("disconn", () => {
    const connTo = users[socket.id].connectedTo;
    if (strangerQueue === socket.id || strangerQueue === connTo) {
      strangerQueue = false;
    }
    users[socket.id].connectedTo = -1;
    users[socket.id].isTyping = false;
    if (sockets[connTo]) {
      users[connTo].connectedTo = -1;
      users[connTo].isTyping = false;
      sockets[connTo].emit("disconn", { who: 2 });
    }
    socket.emit("disconn", { who: 1 });
    peopleActive -= 2;
    io.sockets.emit('stats', { people: peopleActive });
  });

  socket.on('chat', (message) => {
    if (users[socket.id].connectedTo !== -1 && sockets[users[socket.id].connectedTo]) {
      sockets[users[socket.id].connectedTo].emit('chat', message);
    }
  });

  socket.on('typing', (isTyping) => {
    if (users[socket.id].connectedTo !== -1 && sockets[users[socket.id].connectedTo] && users[socket.id].isTyping !== isTyping) {
      users[socket.id].isTyping = isTyping;
      sockets[users[socket.id].connectedTo].emit('typing', isTyping);
    }
  });

  socket.on("disconnect", (err) => {
    const connTo = (users[socket.id] && users[socket.id].connectedTo) || -1;
    if (connTo !== -1 && sockets[connTo]) {
      sockets[connTo].emit("disconn", { who: 2, reason: err && err.toString() });
      users[connTo].connectedTo = -1;
      users[connTo].isTyping = false;
      peopleActive -= 2;
    }

    delete sockets[socket.id];
    delete users[socket.id];

    if (strangerQueue === socket.id || strangerQueue === connTo) {
      strangerQueue = false;
      peopleActive--;
    }
    peopleTotal--;
    console.log(timestamp(), peopleTotal, "disconnect");
    io.sockets.emit('stats', { people: peopleActive });
  });
});
