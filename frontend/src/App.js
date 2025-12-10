// frontend/src/App.js
import React, { useEffect, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";

const ANSIBLE_LAB_URL =
  window._env_?.REACT_APP_ANSIBLE_LAB_URL || "/terminal/ssh/";

export default function App() {
  const [status, setStatus] = useState("");
  const [infraStatus, setInfraStatus] = useState("zero");
  const [showSshButton, setShowSshButton] = useState(false);
  const [sshUrl, setSshUrl] = useState(ANSIBLE_LAB_URL);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState(null);
  const [rawLogLines, setRawLogLines] = useState([]);

  // connect socket.io to path proxied by nginx: path '/api/socket.io'
  const socket = React.useMemo(() => io("/", { path: "/api/socket.io", transports: ["websocket"] }), []);

  useEffect(() => {
    // tf-log events come as raw text lines; we'll accumulate them
    socket.on("tf-log", (msg) => {
      // ignore empty messages
      if (!msg) return;
      // intercept special exit code message
      if (msg.startsWith("__COMMAND_EXIT_CODE__:")) {
        const code = msg.split(":")[1];
        setStatus((s) => s + `\n[Terraform exit code: ${code}]`);
        setRawLogLines((prev) => [...prev, `[EXIT_CODE] ${code}`]);
        // show SSH button on success (code 0) — but we don't parse success here; UI handles it after fetch logs
        return;
      }

      // push new lines
      setRawLogLines((prev) => [...prev, msg]);
      setStatus((s) => msg); // show the last line as short status
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connect error:", err);
    });

    return () => {
      socket.off("tf-log");
      socket.close();
    };
  }, [socket]);

  const fetchTerraformLogs = async () => {
    setStatus("Fetching Terraform logs... ⏳");
    try {
      const res = await fetch("/api/print-tf-logs");
      const data = await res.json();
      if (res.ok) {
        setLogs(data);
        setStatus("Terraform logs fetched successfully! 📄");
        setShowSshButton(true); // show ssh if logs exist
      } else {
        setStatus("Error fetching logs ❌");
      }
    } catch (err) {
      setStatus("Could not reach backend ❌");
    }
  };

  const launchInfrastructure = async () => {
    setStatus("Launching infrastructure... ⏳");
    setLoading(true);

    try {
      const res = await fetch("/api/launch", { method: "POST" });
      const data = await res.json();
      
      if (data.status === "started") {
        setStatus("Infrastructure launching — logs incoming 🚀");
        
        // Wait for websocket event
        socket.on("tf-finished", async () => {
          setStatus("Terraform finished! Fetching logs...");
          await fetchTerraformLogs();
          setInfraStatus("launched");
        });

      } else {
        setStatus("Unexpected backend response ❌");
      }

    } catch (err) {
      setStatus("Backend unreachable ❌");
    }

    setLoading(false);
  };

  const destroyInfrastructure = async () => {
    setStatus("Destroying infrastructure... Please wait 🛑⏳");
    setLoading(true);
    try {
      const res = await fetch("/api/destroy", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "started") {
        setStatus("Destroy started — streaming logs... 🛑");
        // logs via socket
      } else {
        setStatus("Error starting destroy ❌");
      }
    } catch (err) {
      setStatus("Could not reach backend ❌");
    } finally {
      setLoading(false);
    }
  };

  const openSshTab = () => {
    if (!sshUrl) return;
    window.open(sshUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="container">
      <h1 className="title">Meiez KodeKloud</h1>
      <h2 className="subtitle">Ansible Labs</h2>

      <button className="button" onClick={launchInfrastructure} disabled={loading}>
        {loading ? "Working..." : "Launch Infrastructure"}
      </button>

      <button
        className="button destroy-btn"
        onClick={destroyInfrastructure}
        style={{ backgroundColor: "#d9534f", marginTop: "10px" }}
        disabled={loading}
      >
        Destroy Infrastructure
      </button>

      {showSshButton && (
        <button className="button ssh-btn" onClick={openSshTab} style={{ backgroundColor: "goldenrod", marginTop: "10px" }}>
          Access the Ansible lab
        </button>
      )}

      {showSshButton && logs && (
        <div className="logs-box">
          <h2>
            Use these credentials to connect to the machine and start playing with{" "}
            <span style={{ color: "red", textDecoration: "underline" }}>Ansible</span>
          </h2>
          <h3>The username for all the machines is: ec2-user</h3>
          <h3>Master Node</h3>
          <p>
            <strong>Name:</strong> {logs.master.name}
          </p>
          <p>
            <strong>Public IP:</strong> {logs.master.public_ip}
          </p>
          <p>
            <strong>Password:</strong> {logs.master.random_password}
          </p>

          <h3>Clients</h3>
          <ul>
            {logs.clients.map((client, index) => (
              <li key={index}>{client}</li>
            ))}
          </ul>

          <h3>Raw File Output</h3>
          <pre>{logs.raw}</pre>
        </div>
      )}

      {/* Live streaming raw log lines */}
      {rawLogLines.length > 0 && (
        <div className="logs-box">
          <h3>Live Terraform Output</h3>
          <pre style={{ maxHeight: 300, overflow: 'auto' }}>
            {rawLogLines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </pre>
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
