import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDirectory } from '../src/market/directory.ts';
import { REGISTER_NAMES, registerName } from '../src/market/registerNames.ts';

const words = (text) => text.toUpperCase().replace(/,/g, ' ').split(/\s+/).filter(Boolean).sort();

test('every tenant in the directory has its register name, and nothing else is listed', () => {
  const names = new Set(buildDirectory().tenancies.map((t) => t.name));
  for (const name of names) assert.ok(REGISTER_NAMES[name], `${name} has no register name`);
  for (const name of Object.keys(REGISTER_NAMES)) assert.ok(names.has(name), `${name} is not in the directory`);
});

test('a register name only reorders and capitalises the directory name', () => {
  for (const [name, register] of Object.entries(REGISTER_NAMES)) {
    assert.equal(register, register.toUpperCase(), `${register} is in capitals`);
    assert.equal(register.split(',').length, 2, `${register} has one comma`);
    assert.deepEqual(words(register), words(name), `${register} holds the words of ${name}`);
  }
});

test('names written either way round in the directory come out the same', () => {
  assert.equal(registerName('Narcisa Redona'), 'REDONA, NARCISA');
  assert.equal(registerName('Operio Jenefer'), 'OPERIO, JENEFER');
  assert.equal(registerName('Jade Modesto'), registerName('Modesto Jade'));
  assert.equal(registerName('  Corazon   Dela Cruz '), 'DELA CRUZ, CORAZON');
});

test('a name typed later is set out from its comma, or from its last word', () => {
  assert.equal(registerName('Salve, Nida Monte'), 'SALVE, NIDA MONTE');
  assert.equal(registerName('Juan Dela Cruz'), 'DELA CRUZ, JUAN');
  assert.equal(registerName('Pedro De Los Reyes Jr.'), 'DE LOS REYES, PEDRO JR.');
  assert.equal(registerName('Maria Santos (P)'), 'SANTOS, MARIA (P)');
  assert.equal(registerName('Cher'), 'CHER');
  assert.equal(registerName(''), '');
});
