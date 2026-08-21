// The only bridge between the page and the desktop shell.
//
// It exposes four calls, all of which run entirely on this computer, and
// nothing else — no filesystem, no shell, no Node. `contextIsolation` stays on
// and `nodeIntegration` stays off; this is the whole surface.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('marketAssistant', {
  // Is a local language model loaded and usable?
  ready: () => ipcRenderer.invoke('assistant:ready'),
  // Which of the assistant's known questions is this? Returns a key or null.
  classify: (question, intents) => ipcRenderer.invoke('assistant:classify', question, intents),
  // Reword an already-computed answer. The page verifies every figure it
  // returns before showing it.
  phrase: (question, headline, lines) => ipcRenderer.invoke('assistant:phrase', question, headline, lines),
  // The model file in use, for the badge on screen.
  modelName: () => ipcRenderer.invoke('assistant:model-name'),
});
