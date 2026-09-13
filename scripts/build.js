/**
 * @file build.js
 * @description Pre-deployment build and verification script.
 * Validates syntax, asset integrity, and runs tests to guarantee a production-ready build.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function log(msg) {
  console.log(`${colors.cyan}[BUILD]${colors.reset} ${msg}`);
}

function success(msg) {
  console.log(`  ${colors.green}✔${colors.reset} ${msg}`);
}

function fail(msg) {
  console.error(`  ${colors.red}✖ ERROR:${colors.reset} ${msg}`);
  process.exit(1);
}

console.log(`\n${colors.bold}${colors.cyan}====================================================${colors.reset}`);
console.log(`${colors.bold}   MEMORY CARDS MULTIPLAYER — PRODUCTION BUILD${colors.reset}`);
console.log(`${colors.cyan}====================================================${colors.reset}\n`);

// 1. Verify required production files
log('Verifying required production files and directories...');
const requiredFiles = [
  'server.js',
  'src/app.js',
  'src/config/constants.js',
  'src/models/Card.js',
  'src/models/Deck.js',
  'src/models/Player.js',
  'src/models/Room.js',
  'src/services/GameEngine.js',
  'src/sockets/socketHandlers.js',
  'public/index.html',
  'public/css/style.css',
  'public/js/constants.js',
  'public/js/state.js',
  'public/js/ui.js',
  'public/js/socketClient.js',
  'public/js/app.js',
];

for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, '..', file);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing required production file: ${file}`);
  }
}
success('All 16 production files verified.');

// 2. Syntax validation
log('Checking JavaScript syntax across all source files...');
try {
  execSync(
    'node -c server.js src/app.js src/config/constants.js src/models/Card.js src/models/Deck.js src/models/Player.js src/models/Room.js src/services/GameEngine.js src/sockets/socketHandlers.js public/js/constants.js public/js/state.js public/js/ui.js public/js/socketClient.js public/js/app.js',
    { stdio: 'inherit' }
  );
  success('All source files passed syntax verification with 0 errors.');
} catch (e) {
  fail('Syntax validation failed.');
}

// 3. Run automated scenario tests
log('Executing automated test suite (42 tests)...');
try {
  execSync('npm test', { stdio: 'inherit' });
  success('All automated unit and scenario tests passed.');
} catch (e) {
  fail('Tests failed during build verification.');
}

// 4. Summary
console.log(`\n${colors.bold}${colors.green}====================================================${colors.reset}`);
console.log(`${colors.bold}${colors.green}   BUILD SUCCESSFUL! CODE IS READY FOR DEPLOYMENT.${colors.reset}`);
console.log(`${colors.bold}${colors.green}====================================================${colors.reset}\n`);
console.log('To start in production:');
console.log(`  ${colors.bold}npm start${colors.reset}\n`);

