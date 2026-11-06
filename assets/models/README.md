# Face embedding model

`facenet512.tflite` is a single-input FaceNet (Inception-ResNet-v1) TensorFlow
Lite model used by `@nitro-mlkit/face-recognition`. The native module detects and
crops the largest face with ML Kit, then this model turns the 160 x 160 crop into
a 512-dimensional embedding. Two embeddings are compared with cosine similarity.

- TFLite file: https://github.com/shubham0204/FaceRecognition_With_FaceNet_Android (`app/src/main/assets/facenet_512.tflite`)
- Original FaceNet weights: https://github.com/davidsandberg/facenet (MIT)
- Keras model used for the conversion: https://github.com/nyoki-mtl/keras-facenet
- SHA-256: `4FF97D406893BC4AAE2D922C28287045D58FA9FBCBFEB731B975FD2DEBBF1A80`
- Input: `[1, 160, 160, 3]` float32 RGB, normalised as `(pixel - 127.5) / 128`
- Output: `[1, 512]` float32 embedding
- License: MIT (see `LICENSE` in this directory)

The model is bundled so face recognition works offline. It must remain a
single-input model: the native module only feeds input tensor 0 and expects one
embedding in the output. Multi-input models (for example Qualcomm AI Hub's
`img1`/`img2` export) are not compatible.

## Verification

The `.tflite` file was checked with the TFLite Python schema parser:

```text
input  input_1     [1, 160, 160, 3] float32
output Identity    [1, 512]         float32
```

A local check with aligned face crops produced cosine similarity of about `0.85`
for two photos of the same person and below `0.1` for a different person. The
app's auto-confirm threshold is `0.70`, with suggestions from `0.55`.
