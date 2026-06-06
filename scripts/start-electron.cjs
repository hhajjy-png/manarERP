'use strict';

const { spawn } = require('child_process');

delete process.env.ELECTRON_RUN_AS_NODE;
process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';

const electronBin = require('electron');

const child = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
