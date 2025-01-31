const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const ACTIONS = require("./Actions");
require('dotenv').config();
app.use(bodyParser.json()); // Parse JSON payloads
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
const server = http.createServer(app);

const io = new Server(server);

const userSocketMap = {};
const getAllConnectedClients = (roomId) => {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => {
      return {
        socketId,
        username: userSocketMap[socketId],
      };
    }
  );
};

io.on("connection", (socket) => {
  // console.log('Socket connected', socket.id);
  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    userSocketMap[socket.id] = username;
    socket.join(roomId);
    const clients = getAllConnectedClients(roomId);
    // notify that new user join
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit(ACTIONS.JOINED, {
        clients,
        username,
        socketId: socket.id,
      });
    });
  });

  // sync the code
  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });
  // when new user join the room all the code which are there are also shows on that persons editor
  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });
  socket.on(ACTIONS.CODE_EXECUTION_RESULT, ({ roomId, output }) => {
    socket.in(roomId).emit(ACTIONS.CODE_EXECUTION_RESULT, { output });
  });
  

  // leave room
  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms];
    // leave all the room
    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });

    delete userSocketMap[socket.id];
    socket.leave();
  });
});
//Handle code submission
app.post("/api/submit-code", async (req, res) => {
  const { sourceCode, languageId, stdin } = req.body;

  // Join multiple inputs into one string with newline separator
  const stdinStr = Array.isArray(stdin) ? stdin.join('\n') : stdin;

  const options = {
    method: "POST",
    url: "https://judge029.p.rapidapi.com/submissions",
    params: { wait: "false", fields: "*" },
    headers: {
      "x-rapidapi-key": process.env.RAPID_API_KEY,
      "x-rapidapi-host": "judge029.p.rapidapi.com",
      "Content-Type": "application/json",
    },
    data: {
      source_code: sourceCode,  // Send raw sourceCode
      language_id: languageId,  // Send languageId directly
      stdin: stdinStr,          // Send stdin as a single string (multiple lines supported)
    },
  };

  try {
    const response = await axios.request(options);
    res.status(200).json({ submissionId: response.data.token });
  } catch (error) {
    console.error("Error in code submission:", error.response?.data || error.message);
    res.status(500).json({
      error: "Code submission failed",
      details: error.response?.data || error.message,
    });
  }
});








// Handle fetching submission results
app.get("/api/submission-result/:id", async (req, res) => {
  const submissionId = req.params.id;

  const options = {
    method: "GET",
    url: `https://judge029.p.rapidapi.com/submissions/${submissionId}`,
    params: { fields: "*",base64_encoded: "false" },
    headers: {
      "x-rapidapi-key": process.env.RAPID_API_KEY,
      "x-rapidapi-host": "judge029.p.rapidapi.com",
    },
  };

  try {
    const response = await axios.request(options);
    res.status(200).json(response.data);
    console.log(response.data,"m data hu");
  } catch (error) {
    console.error("Error fetching submission result:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch submission result",
      details: error.response?.data || error.message,
    });
  }
});
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

