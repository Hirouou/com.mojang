import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

assert.match(source, /let shotSerial = 0;/, 'replicated shots should use a monotonic local serial');
assert.match(source, /function nextShotIdentity\(runtime\)/, 'shot identity should be derived at the live replication seam');
assert.match(source, /shotId: `\$\{mamuteId\}:\$\{shooterId\}:\$\{shotSerial\}`/, 'shot identity should scope serial by Mamute and shooter');
assert.match(source, /const shot = liveShotPayload\(\);/, 'identity must be captured with the committed shot payload');
assert.match(source, /runtime\.emitEffect\('fire', shot\)/, 'fire replication must carry the identity-bearing shot payload');
assert.match(source, /runtime\.emitEffect\('reload', \{ duration: 2\.8, phase: 'extract', shell: shot\.shell \}\)/, 'reload compatibility contract must remain unchanged');
assert.doesNotMatch(source, /from ['"]\.\/ballistics\.js['"]/, 'replication must not create a second ballistics source');

console.log('artillery shot identity integration ok');
