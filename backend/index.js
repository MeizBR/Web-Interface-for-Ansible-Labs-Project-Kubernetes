// backend/server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client } = require('ssh2');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST'] }));
app.use(express.json());

// Read env & basic validation
const SSH_HOST = process.env.SSH_HOST;
const SSH_USERNAME = process.env.SSH_USERNAME || 'ubuntu';
const SSH_PRIVATE_KEY_PATH = process.env.SSH_PRIVATE_KEY_PATH;
const TERRAFORM_DIR = process.env.TERRAFORM_DIR || '/home/ubuntu/Ansible-labs-with-Terraform';

if (!SSH_HOST || !SSH_PRIVATE_KEY_PATH) {
  console.warn('⚠ WARNING: SSH_HOST or SSH_PRIVATE_KEY_PATH not set. Check .env');
}

// prepare ssh config
const sshConfig = {
  host: SSH_HOST,
  username: SSH_USERNAME,
  privateKey: fs.existsSync(SSH_PRIVATE_KEY_PATH) ? fs.readFileSync(SSH_PRIVATE_KEY_PATH) : null,
  readyTimeout: 300000,
  keepaliveInterval: 10000,
  keepaliveCountMax: 10000
};

// Global readiness flag
let terraformReady = false;

// Simple initializeTerraform used at startup
async function initializeTerraform() {
  return new Promise((resolve) => {
    console.log('🔧 Initializing Terraform on remote server...');
    const conn = new Client();

    conn.on('ready', () => {
      const cmd = `cd ${TERRAFORM_DIR} && terraform init -input=false`;
      conn.exec(cmd, (err, stream) => {
        if (err) {
          console.error('❌ Terraform init failed:', err.message);
          terraformReady = false;
          conn.end();
          return resolve();
        }

        let out = '';
        stream.on('data', d => out += d.toString());
        stream.stderr.on('data', d => out += d.toString());

        stream.on('close', (code) => {
          if (code === 0) {
            terraformReady = true;
            console.log('✅ Terraform initialized successfully!');
          } else {
            terraformReady = false;
            console.error('❌ Terraform init exited with code', code);
            console.error(out);
          }
          conn.end();
          resolve();
        });
      });
    });

    conn.on('error', (err) => {
      console.error('❌ SSH connection failed at init:', err.message);
      terraformReady = false;
      resolve();
    });

    conn.connect(sshConfig);
  });
}

// -------------------
// REST endpoints (unchanged semantics)
// -------------------
app.get('/api/', (req, res) => res.send('Express server (SSH version) is running!'));

app.get('/api/health', (req, res) => {
  if (terraformReady) return res.status(200).send('OK');
  return res.status(503).send('Not Ready');
});

app.get('/api/print-tf-logs', (req, res) => {
  const conn = new Client();
  conn.on('ready', () => {
    conn.exec(`cat ${TERRAFORM_DIR}/terraform_logs.txt || echo ''`, (err, stream) => {
      if (err) {
        conn.end();
        return res.status(500).json({ error: err.message });
      }

      let data = '';
      stream.on('data', chunk => data += chunk.toString());
      stream.stderr.on('data', chunk => data += chunk.toString());

      stream.on('close', () => {
        const response = { master: {}, clients: [], raw: data };
        data.split('\n').forEach(line => {
          if (line.includes('Master Instance Name:')) response.master.name = line.split(':')[1]?.trim();
          if (line.includes('Master Public IP:')) response.master.public_ip = line.split(':')[1]?.trim();
          if (line.includes('- client-')) response.clients.push(line.replace('- ', '').trim());
          if (line.includes('Random Password:')) response.master.random_password = line.split(':')[1]?.trim();
        });
        conn.end();
        return res.json(response);
      });
    });
  });

  conn.on('error', (err) => {
    return res.status(500).json({ error: err.message || String(err) });
  });

  conn.connect(sshConfig);
});

// -------------------
// Helper to stream via SSH and emit logs to socket.io
// -------------------
function streamCommandAndEmit(io, command, emitEvent = 'tf-log') {
  const conn = new Client();
  // connect then exec, stream stdout/stderr to io.emit
  conn.on('ready', () => {
    conn.exec(command, { pty: true }, (err, stream) => {
      if (err) {
        io.emit(emitEvent, `ERROR: ${err.message}`);
        conn.end();
        return;
      }

      stream.on('data', (chunk) => {
        io.emit(emitEvent, chunk.toString());
      });

      stream.stderr.on('data', (chunk) => {
        io.emit(emitEvent, chunk.toString());
      });

      stream.on('close', (code) => {
        io.emit(emitEvent, `__COMMAND_EXIT_CODE__:${code}`);
        conn.end();
      });
    });
  });

  conn.on('error', (err) => {
    io.emit(emitEvent, `ERROR: ${err.message}`);
  });

  conn.connect(sshConfig);
}

// -------------------
// POST /api/launch -> start apply and return immediately (frontend unchanged)
// logs streamed over socket.io (path proxied via NGINX to /api/socket.io)
// -------------------
app.post('/api/launch', (req, res) => {
  // return immediately
  res.json({ status: 'started' });

  const io = req.app.get('socketio');

  if (!io) {
    console.warn('Socket.IO not available');
    return;
  }

  io.emit('tf-log', '🚀 Terraform apply started...');

  const cmd = `
    cd ${TERRAFORM_DIR} && \
    terraform apply -auto-approve -input=false && \
    aws s3 cp terraform.tfstate s3://ansible-labs/terraform.tfstate
  `;

  const conn = new Client();
  conn.on("ready", () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        io.emit("tf-log", "❌ Error: " + err.message);
        return;
      }

      stream.on("data", chunk => io.emit("tf-log", chunk.toString()));
      stream.stderr.on("data", chunk => io.emit("tf-log", chunk.toString()));

      stream.on("close", () => {
        io.emit("tf-finished", "✅ Terraform apply completed");
        conn.end();
      });
    });
  });

  conn.connect(sshConfig);
});

// -------------------
// POST /api/destroy -> start destroy and return immediately, logs via socket
// -------------------
app.post('/api/destroy', (req, res) => {
  res.json({ status: 'started' });

  const io = req.app.get('socketio');
  if (!io) {
    console.warn('Socket.IO not available');
  } else {
    io.emit('tf-log', '🛑 Terraform destroy started...');
    const cmd = `cd ${TERRAFORM_DIR} && terraform destroy -auto-approve -input=false`;
    streamCommandAndEmit(io, cmd, 'tf-log');
  }
});

// -------------------
// Additional simple endpoint example: /api/ls (optional)
// -------------------
app.get('/api/ls', (req, res) => {
  const conn = new Client();
  conn.on('ready', () => {
    conn.exec(`ls -la ${TERRAFORM_DIR}`, (err, stream) => {
      if (err) { conn.end(); return res.status(500).json({error: err.message}); }
      let out = '';
      stream.on('data', d => out += d.toString());
      stream.stderr.on('data', d => out += d.toString());
      stream.on('close', () => { conn.end(); res.json({ output: out }); });
    });
  });
  conn.on('error', err => res.status(500).json({ error: err.message }));
  conn.connect(sshConfig);
});

// -------------------
// HTTP + Socket.IO server start
// -------------------
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  path: '/api/socket.io', // important: path matches NGINX proxying under /api/
  cors: { origin: '*' }
});

// make io accessible from express handlers via app.get('socketio')
app.set('socketio', io);

// optionally log new connections for debugging
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  socket.emit('tf-log', `connected to tf-logs socket (id=${socket.id})`);
  socket.on('disconnect', (reason) => {
    console.log('socket disconnected', socket.id, reason);
  });
});

// start server and run initializeTerraform at startup
httpServer.listen(5000, async () => {
  console.log(`🚀 Backend API + Socket.IO listening on 5000`);
  await initializeTerraform();
  console.log('Startup init done (terraformReady =', terraformReady, ')');
});

// keep long timeout for any HTTP requests if you accidentally call them to long-running ops
httpServer.setTimeout(30 * 60 * 1000);
