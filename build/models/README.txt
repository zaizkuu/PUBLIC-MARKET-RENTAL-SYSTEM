Drop a GGUF language model file (*.gguf) in this folder before building the
installer and it will be packaged with the app.

After installation, a model can also be dropped in without rebuilding:
  Help > Assistant Model Folder

The app never downloads a model. It reads whatever .gguf file it finds here or
in the data folder, and runs entirely offline. With no model present the
assistant still answers every question -- the figures are computed from the
records either way; only the wording is plainer.
