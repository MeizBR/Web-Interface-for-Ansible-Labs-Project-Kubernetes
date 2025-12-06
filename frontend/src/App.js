import React, { useState } from "react";
import "./App.css";

const ANSIBLE_LAB_URL = process.env.REACT_APP_ANSIBLE_LAB_URL;

export default function App() {
  const [status, setStatus] = useState("");
  const [showSshButton, setShowSshButton] = useState(false);
  const [sshUrl, setSshUrl] = useState(ANSIBLE_LAB_URL);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState(null);

  const fetchTerraformLogs = async () => {
  setStatus("Fetching Terraform logs... ⏳");

  try {
    const res = await fetch("/api/print-tf-logs");
    const data = await res.json();

    if (res.ok) {
      setLogs(data);
      setStatus("Terraform logs fetched successfully! 📄");
    } else {
      setStatus("Error fetching logs ❌");
    }
    } catch (err) {
        setStatus("Could not reach backend ❌");
    }
  };

  const launchInfrastructure = async () => {
    setStatus("Launching infrastructure... Please wait ⏳");
    setLoading(true);
    try {
      const res = await fetch("/api/launch", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.status === "finished") {
        setStatus("Infrastructure launched successfully! 🚀");
        // show SSH/button
        setShowSshButton(true);

        // fetch and show terraform logs
        await fetchTerraformLogs();

        // If backend returns a dynamic URL, use it:
        if (data.ssh_url) {
          setSshUrl(data.ssh_url);
        }
      } else if (res.ok) {
        // res.ok but not "finished" — still an error case for us
        setStatus("Launch finished with warnings or partial failure ❗");
      } else {
        setStatus("Error launching infrastructure ❌");
      }
    } catch (err) {
      setStatus("Could not reach backend ❌");
    } finally {
      setLoading(false);
    }
  };

  const destroyInfrastructure = async () => {
    setStatus("Destroying infrastructure... Please wait 🛑⏳");
    setLoading(true);
    try {
      const res = await fetch("/api/destroy", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.status === "finished") {
        setStatus("Infrastructure destroyed successfully! 💥");
        // hide SSH/button after destroy
        setShowSshButton(false);
      } else if (res.ok) {
        setStatus("Destroy finished with warnings or partial failure ❗");
      } else {
        setStatus("Error destroying infrastructure ❌");
      }
    } catch (err) {
      setStatus("Could not reach backend ❌");
    } finally {
      setLoading(false);
    }
  };

  const openSshTab = () => {
    if (!sshUrl) return;
    // open new tab safely
    window.open(sshUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="container">
      <h1 className="title">Meiez KodeKloud</h1>
      <h2 className="subtitle">Ansible Labs</h2>

      <button
        className="button"
        onClick={launchInfrastructure}
        disabled={loading}
      >
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

      {/* SSH button: only visible when showSshButton is true */}
      {(
        <button
          className="button ssh-btn"
          onClick={openSshTab}
          style={{ backgroundColor: "goldenrod", marginTop: "10px" }}
        >
          Access the Ansible lab
        </button>
      )}

      {showSshButton && logs && (
        <div className="logs-box">
            <h2>Use these credentails to connect to the machine and start playing with <span style={{color: "red", textDecoration: "underline"}}>Ansible</span></h2>
            <h3>The username for all the machines is: ec2-user</h3>
            <h3>Master Node</h3>
            <p><strong>Name:</strong> {logs.master.name}</p>
            <p><strong>Public IP:</strong> {logs.master.public_ip}</p>
            <p><strong>Password:</strong> {logs.master.random_password}</p>

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

      {status && <p className="status">{status}</p>}
    </div>
  );
}