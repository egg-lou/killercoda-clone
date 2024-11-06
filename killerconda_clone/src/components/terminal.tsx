import React, { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

const XTerminal = () => {
  const terminalRef = useRef(null);
  const ws = useRef(null);
  const inputBufferRef = useRef("");

  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: "#282828",
        foreground: "#00FF00",
      },
      cursorBlink: true,
      cursorStyle: "underline",
      cursorWidth: 2,
      macOptionIsMeta: true,
      scrollback: 100,
      allowTransparency: true,
      fontFamily: "Fira Code, JetBrains Mono, Menlo, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      fontWeight: "normal",
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    ws.current = new WebSocket("ws://localhost:4000");

    ws.current.onopen = () => {
      console.log("WebSocket connection established");
      term.write("Connected to server. Type your commands and press Enter.\r\n");
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "data" || message.type === "error") {
        term.write(message.data + "\r\n");
      } else if (message.type === "clear") {
        term.clear();
      }
    };

    term.onKey(({ key, domEvent }) => {
      const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey;

      if (domEvent.keyCode === 13) {
        term.write("\r\n");
        const input = inputBufferRef.current.trim();
        if (input.length > 0) {
          ws.current.send(JSON.stringify({ type: "command", data: input }));
          inputBufferRef.current = "";
        } else {
          term.write("$ ");
        }
      } else if (domEvent.keyCode === 8) {
        if (inputBufferRef.current.length > 0) {
          term.write("\b \b");
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        }
      } else if (printable) {
        term.write(key);
        inputBufferRef.current += key;
      }
    });

    term.onResize((size) => {
      console.log(`Terminal resized to ${size.rows} rows and ${size.cols} columns`);
    });

    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      term.dispose();
      if (ws.current) {
        ws.current.close();
      }
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <div ref={terminalRef} style={{ height: "100vh", width: "100%" }} />;
};

export default XTerminal;
