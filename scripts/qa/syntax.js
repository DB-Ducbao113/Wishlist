// Extracts every inline <script> from wishlist.html and syntax-checks it,
// plus flags the harness gotcha where literal backslash-n sequences get
// written into the file instead of real newlines.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.join(process.argv[2] || path.join(__dirname, '..', '..'), 'wishlist.html');
const html = fs.readFileSync(file, 'utf8');

const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
let n = 0;
let bad = 0;
const types = [];
while ((m = re.exec(html)) !== null) {
  n++;
  const attrs = m[1] || '';
  const code = m[2];
  const typeMatch = /\btype\s*=\s*"([^"]+)"/i.exec(attrs);
  types.push(typeMatch ? typeMatch[1] : '(classic)');
  if (typeMatch && /json|text\/template/i.test(typeMatch[1])) continue;
  try {
    new vm.Script(code, { filename: 'wishlist.html#script' + n });
  } catch (e) {
    bad++;
    console.log('SYNTAX FAIL in script #' + n + ': ' + e.message);
  }
}

const literalBackslashN = (html.match(/\\n/g) || []).length;
const literalBackslashU = (html.match(/\\\\u[0-9a-fA-F]{4}/g) || []).length;

console.log('inline script blocks : ' + n + '  types: ' + JSON.stringify(types));
console.log('syntax failures      : ' + bad);
console.log('literal backslash-n  : ' + literalBackslashN);
console.log('doubled \\u escapes  : ' + literalBackslashU);
console.log('html bytes           : ' + Buffer.byteLength(html, 'utf8'));
if (bad === 0) console.log('SYNTAX OK');
process.exit(bad === 0 ? 0 : 1);
