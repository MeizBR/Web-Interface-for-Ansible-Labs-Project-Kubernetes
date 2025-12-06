const express = require('express');
const { Client } = require('ssh2');
const fs = require('fs');
const cors = require('cors');
require("dotenv").config();

const app = express();

let terraformReady = false;

// ==== SSH CONFIG ====
const sshConfig = {
  host: process.env.SSH_HOST,
  username: process.env.SSH_USERNAME,
  privateKey: fs.readFileSync(process.env.SSH_PRIVATE_KEY_PATH)
};

const TERRAFORM_DIR = process.env.TERRAFORM_DIR;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

// ====== TEST ENDPOINT ======
app.get('/api/', (req, res) => {
  res.send('Express server (SSH version) is running!');
});

async function initializeTerraform() {
  return new Promise((resolve) => {
    console.log("🔧 Initializing Terraform on remote server...");

    const conn = new Client();

    conn.on("ready", () => {
      const cmd = `
        cd ${TERRAFORM_DIR} && \
        terraform init -input=false
      `;

      conn.exec(cmd, (err, stream) => {
        if (err) {
          console.error("❌ Terraform init failed:", err.message);
          terraformReady = false;
          conn.end();
          return resolve();
        }

        let output = "";

        stream.on("data", (chunk) => output += chunk.toString());
        stream.stderr.on("data", (chunk) => output += chunk.toString());

        stream.on("close", (code) => {
          if (code === 0) {
            terraformReady = true;
            console.log("✅ Terraform initialized successfully!");
          } else {
            terraformReady = false;
            console.error("❌ Terraform init exited with error code:", code);
            console.error(output);
          }

          conn.end();
          resolve();
        });
      });
    });

    conn.on("error", (err) => {
      console.error("❌ SSH connection failed:", err.message);
      terraformReady = false;
      return resolve();
    });

    conn.connect(sshConfig);
  });
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  if (terraformReady) res.status(200).send("OK");
  else res.status(503).send("Not Ready");
});

// ===================================================
// 1️⃣ PRINT TF LOGS (reads logs from remote VM)
// ===================================================
app.get('/api/print-tf-logs', (req, res) => {
  const conn = new Client();

  conn.on('ready', () => {
    conn.exec(`cat ${TERRAFORM_DIR}/terraform_logs.txt`, (err, stream) => {
      if (err) return res.status(500).json({ error: err.message });

      let data = '';

      stream.on('data', chunk => data += chunk.toString());
      stream.stderr.on('data', chunk => data += chunk.toString());

      stream.on('close', () => {
        // Parse the logs just like before
        const response = {
          master: {},
          clients: [],
          raw: data
        };

        data.split("\n").forEach(line => {
          if (line.includes("Master Instance Name:"))
            response.master.name = line.split(":")[1].trim();

          if (line.includes("Master Public IP:"))
            response.master.public_ip = line.split(":")[1].trim();

          if (line.includes("- client-"))
            response.clients.push(line.replace("- ", "").trim());

          if (line.includes("Random Password:"))
            response.master.random_password = line.split(":")[1].trim();
        });

        res.json(response);
        conn.end();
      });
    });
  });

  conn.connect(sshConfig);
});


// ===================================================
// 2️⃣ TERRAFORM APPLY  (launch infra)
// ===================================================
app.post('/api/launch', (req, res) => {
  const conn = new Client();

  conn.on('ready', () => {
    const cmd = `
      cd ${TERRAFORM_DIR} && \
      terraform apply -auto-approve && \
      aws s3 cp terraform.tfstate s3://ansible-labs/terraform.tfstate
    `;

    conn.exec(cmd, (err, stream) => {
      if (err) return res.status(500).send({ error: err.message });

      let output = '';

      stream.on('data', chunk => output += chunk.toString());
      stream.stderr.on('data', chunk => output += chunk.toString());

      stream.on('close', () => {
        res.send({ status: 'finished', output });
        conn.end();
      });
    });
  });

  conn.connect(sshConfig);
});


// ===================================================
// 3️⃣ TERRAFORM DESTROY
// ===================================================
app.post('/api/destroy', (req, res) => {
  const conn = new Client();

  conn.on('ready', () => {
    const cmd = `
      cd ${TERRAFORM_DIR} && \
      terraform destroy -auto-approve
    `;

    conn.exec(cmd, (err, stream) => {
      if (err) return res.status(500).send({ error: err.message });

      let output = '';

      stream.on('data', chunk => output += chunk.toString());
      stream.stderr.on('data', chunk => output += chunk.toString());

      stream.on('close', () => {
        res.send({ status: 'finished', output });
        conn.end();
      });
    });
  });

  conn.connect(sshConfig);
});


// ===================================================
// 4️⃣ NEW ENDPOINT → TERRAFORM PLAN
// ===================================================
app.post('/api/plan', (req, res) => {
  const conn = new Client();

  conn.on('ready', () => {
    const cmd = `
      cd ${TERRAFORM_DIR} && \
      terraform plan
    `;

    conn.exec(cmd, (err, stream) => {
      if (err) return res.status(500).send({ error: err.message });

      let output = '';

      stream.on('data', chunk => output += chunk.toString());
      stream.stderr.on('data', chunk => output += chunk.toString());

      stream.on('close', () => {
        res.send({ status: 'finished', output });
        conn.end();
      });
    });
  });

  conn.connect(sshConfig);
});

// ===============================
// 🚀 START BACKEND SERVER
// ===============================

const server = app.listen(5000, async () => {
  console.log("🚀 Backend API running on port 5000");

  console.log("🔧 Running initial Terraform setup...");
  await initializeTerraform();

  if (terraformReady) {
    console.log("✅ Terraform is READY for plan/apply/destroy");
  } else {
    console.log("⚠ Terraform initialization FAILED — check SSH or remote directory");
  }
});

// extend timeout → 30 minutes for long terraform operations
server.setTimeout(30 * 60 * 1000); // 30 minutes
