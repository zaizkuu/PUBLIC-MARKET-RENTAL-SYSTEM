// Local language model for the Market Assistant.
//
// OFFLINE BY CONSTRUCTION. This module never reaches the network:
//   * `node-llama-cpp` is loaded lazily and only if it is already installed.
//   * The model is read from a file already on this computer. The library's
//     own model-resolving helpers (`resolveModelFile` and friends) download
//     from Hugging Face on a miss and are deliberately NOT used here.
//   * There is no fetch, no update check, and no telemetry.
// If either the library or the model file is absent the assistant simply runs
// without one — every figure it reports is computed from the records either
// way, so nothing is lost but the phrasing.

const fs = require('node:fs');
const path = require('node:path');

// Where a model may be dropped in. First match wins.
//   1. resources/models  — shipped alongside a packaged build
//   2. <userData>/models — dropped in by the office after installation
function modelSearchPaths(app) {
  const packaged = path.join(process.resourcesPath || '', 'models');
  const userDir = path.join(app.getPath('userData'), 'models');
  // Running from source, resourcesPath belongs to Electron itself, so the
  // model in the repo would be invisible. Look there too when unpackaged.
  const dev = app.isPackaged ? null : path.join(app.getAppPath(), 'build', 'models');
  return dev ? [packaged, userDir, dev] : [packaged, userDir];
}

function findModelFile(app) {
  for (const dir of modelSearchPaths(app)) {
    try {
      if (!fs.existsSync(dir)) continue;
      const hit = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.gguf'));
      if (hit) return path.join(dir, hit);
    } catch { /* unreadable directory is the same as no model */ }
  }
  return null;
}

let state = { tried: false, session: null, modelPath: null, error: null };

async function getSession(app) {
  if (state.tried) return state.session;
  state.tried = true;

  const modelPath = findModelFile(app);
  if (!modelPath) { state.error = 'no model file'; return null; }

  try {
    // Lazy, and optional: a build without the library still runs.
    // The library is ESM-only, so it is pulled in with a dynamic import --
    // require() throws ERR_REQUIRE_ESM here.
    const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });
    const context = await model.createContext({ contextSize: 2048 });
    state.session = new LlamaChatSession({ contextSequence: context.getSequence() });
    state.modelPath = modelPath;
  } catch (err) {
    state.error = err && err.message ? err.message : String(err);
    state.session = null;
  }
  return state.session;
}

// Qwen3 and its kin reason out loud unless told not to. `/no_think` is the
// soft switch these models accept; the tag stripping is the belt to that
// braces, since a model that ignores the switch would otherwise leak its
// working into the answer shown to the officer.
const NO_THINK = ' /no_think';

function stripThinking(text) {
  if (typeof text !== 'string') return null;
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
}

// A model that stalls must never hang the assistant; the caller falls back to
// the computed wording.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('model timed out')), ms)),
  ]);
}

async function ready(app) {
  return !!(await getSession(app));
}

function modelName() {
  return state.modelPath ? path.basename(state.modelPath) : null;
}

// Picks which of the assistant's questions was asked. The model chooses from a
// closed list and anything outside it is discarded by the caller.
async function classify(app, question, intents) {
  const session = await getSession(app);
  if (!session) return null;
  // Measured against this model, asking for a bare number beats asking for a
  // key, and beats few-shot examples, which push it towards answering 0. Even
  // then it is right well under half the time, which is why the keyword matcher
  // in the page decides first and this only ever runs as the fallback.
  const menu = intents.map((i, n) => (n + 1) + '. ' + i.question).join('\n');
  const prompt = [
    'Below is a numbered list of questions a market office system can answer.',
    '',
    menu,
    '',
    'Which single numbered question best matches this request?',
    'Request: "' + question + '"',
    '',
    'Answer with the number alone. If none match, answer 0.',
  ].join('\n');
  try {
    const raw = stripThinking(await withTimeout(session.prompt(prompt + NO_THINK, { maxTokens: 8, temperature: 0 }), 30000)) || '';
    const digits = raw.match(/[0-9]+/);
    const picked = digits ? Number.parseInt(digits[0], 10) : 0;
    if (!Number.isFinite(picked) || picked < 1 || picked > intents.length) return null;
    return intents[picked - 1].key;
  } catch {
    return null;
  }
}

// Rewrites an already-computed answer as a sentence. The renderer checks every
// digit that comes back against the figures it supplied, so a model that
// invents a number gets its wording thrown away rather than displayed.
async function phrase(app, question, headline, lines) {
  const session = await getSession(app);
  if (!session) return null;
  const prompt = [
    'You are a clerk at a public market office in Tanauan, Leyte.',
    'Rewrite the ANSWER below as one or two plain sentences for a colleague.',
    'Use only the numbers, names and dates given. Never calculate, estimate or add a figure.',
    'If you are unsure, repeat the answer as it is written.',
    '',
    `QUESTION: ${question}`,
    `ANSWER: ${headline}`,
    lines.length ? `DETAIL:\n${lines.map((l) => `- ${l}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
  try {
    const raw = await withTimeout(session.prompt(prompt + NO_THINK, { maxTokens: 220, temperature: 0.2 }), 60000);
    return stripThinking(raw) || null;
  } catch {
    return null;
  }
}

module.exports = { ready, classify, phrase, modelName, findModelFile, modelSearchPaths };
