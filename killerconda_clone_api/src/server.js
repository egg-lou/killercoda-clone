const { WebSocketServer } = require("ws");
const { spawn } = require("child_process");
const express = require("express");
const { stdout, stderr } = require("process");
const http = require("http");
const path = require("path");

const app = express();
const port = process.env.PORT || 4000;

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const MAX_CONNECTIONS = 10;
let currentConnections = 0;

wss.on("connection", (ws) => {
  if (currentConnections >= MAX_CONNECTIONS) {
    const errorMsg = JSON.stringify({
      type: "error",
      data: "Server at capacity. Try again later.",
    });
    console.log("Sending:", errorMsg);
    ws.send(errorMsg);
    ws.close();
    return;
  }

  currentConnections++;

  const containerName = `busybox-${Date.now()}`;
  const dockerProcess = spawn("docker", [
    "run",
    "--rm",
    "--name",
    containerName,
    "-i",
    "--memory=64m",
    "--cpus=0.5",
    "--network=none",
    "busybox",
    "sh",
  ]);

  console.log(
    `New client connected, BusyBox container started ${containerName}`
  );

  let currentDir = "/";
  const promptSymbol = "$";

  const sendPrompt = (ws) => {
    const prompt = `${promptSymbol} ${currentDir} `;
    ws.send(JSON.stringify({ type: "data", data: prompt }));
  };

  sendPrompt(ws);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === "command") {
        const sanitizedCommand = data.data.replace(/[;&|]/g, "");
        const commandParts = sanitizedCommand.split(" ");

        if (commandParts[0] === "cd") {
          const folder = commandParts.slice(1).join(" ").trim();
          let newDir;

          if (folder === "..") {
            newDir = path.resolve(currentDir, "..");
          } else {
            newDir = path.resolve(currentDir, folder);
          }

          const checkDirCommand = `ls ${currentDir}`;
          dockerProcess.stdin.write(checkDirCommand + "\n");

          dockerProcess.stdout.on("data", (data) => {
            const dirs = data
              .toString()
              .split("\n")
              .map((dir) => dir.trim());
            if (folder === "..") {
              if (currentDir !== "/") {
                currentDir = path.dirname(currentDir);
                const successMsg = JSON.stringify({
                  type: "data",
                  data: `Changed directory to: ${currentDir}`,
                });
                ws.send(successMsg);
              } else {
                const errorMsg = JSON.stringify({
                  type: "error",
                  data: `Already at root directory: ${currentDir}`,
                });
                ws.send(errorMsg);
              }
            } else if (dirs.includes(folder)) {
              currentDir = path.join(currentDir, folder);
              const successMsg = JSON.stringify({
                type: "data",
                data: `Changed directory to: ${currentDir}`,
              });
              ws.send(successMsg);
            } else {
              const errorMsg = JSON.stringify({
                type: "error",
                data: `No such directory: ${folder}`,
              });
              ws.send(errorMsg);
            }
            sendPrompt(ws);
          });
        } else if (sanitizedCommand === "clear") {
          const clearMsg = JSON.stringify({
            type: "clear",
          });
          ws.send(clearMsg);
          sendPrompt(ws);
        } else if (commandParts[0] === "mkdir") {
          const folderToCreate = commandParts[1];
          const createDirCommand = `mkdir ${folderToCreate}`;
          dockerProcess.stdin.write(createDirCommand + "\n");
          const successMsg = JSON.stringify({
            type: "data",
            data: `Directory created: ${folderToCreate}`,
          });
          ws.send(successMsg);
          sendPrompt(ws);
        } else {
          const fullCommand = `cd ${currentDir} && ${sanitizedCommand}`;
          dockerProcess.stdin.write(fullCommand + "\n");
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
      const errorMsg = JSON.stringify({
        type: "error",
        data: "Invalid message format",
      });
      ws.send(errorMsg);
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
    currentConnections--;

    const { exec } = require("child_process");
    exec(`docker rm -f ${containerName}`, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error removing Docker container: ${err}`);
        return;
      }

      console.log(`Docker container ${containerName} removed: ${stdout}`);
    });
  });

  dockerProcess.stdout.on("data", (data) => {
    const output = data.toString();
    if (output) {
      const outputMsg = JSON.stringify({
        type: "data",
        data: output,
      });
      ws.send(outputMsg);
    }
  });

  dockerProcess.stderr.on("data", (data) => {
    const errorMsg = JSON.stringify({
      type: "error",
      data: data.toString(),
    });
    ws.send(errorMsg);
  });
});

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
