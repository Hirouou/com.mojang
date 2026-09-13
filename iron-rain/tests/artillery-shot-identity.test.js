import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../modules/integration-live.js', import.meta.url), 'utf8');

assert.match(source, /let shotSerial = 0;/, 'replicated shots should use a monotonic local serial');
assert.match(source, /const shotSession = globalThis\.crypto\?\.randomUUID\?\.\(\) \|\|/, 'shot identity should include a per-page session discriminator');
assert.match(source, /function nextShotIdentity\(runtime\)/, 'shot identity should be derived at the live replication seam');
assert.match(source, /shotId: `\$\{mamuteId\}:\$\{shooterId\}:\$\{shotSession\}:\$\{shotSerial\}`/, 'shot identity should scope serial by Mamute, shooter and page session');
assert.match(source, /runtime\.issueCommand\('fire', liveShotPayload\(\)\)/, 'identity-bearing fire payload must pass through command authority');
assert.doesNotMatch(source, /runtime\.emitEffect\('fire'/, 'presentation must not publish fire before authority accepts it');
assert.doesNotMatch(source, /runtime\.emitEffect\('reload'/, 'presentation must not publish reload before authority accepts fire');
assert.doesNotMatch(source, /from ['"]\.\/ballistics\.js['"]/, 'replication must not create a second ballistics source');

console.log('artillery shot identity integration ok');
