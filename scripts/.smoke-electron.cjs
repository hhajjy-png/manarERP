'use strict';
const { spawn } = require('child_process');
delete process.env.ELECTRON_RUN_AS_NODE;
process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
const electronBin = require('electron');
spawn(electronBin, ['.', '--remote-debugging-port=9333'], { stdio: 'inherit', env: process.env });
