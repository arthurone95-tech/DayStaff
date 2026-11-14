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

With the expanded face crop, field measurements are about `0.85 – 0.95` for the
same person and `0.55 – 0.80` for different people (including lookalikes). The
app blocks duplicate registration at `0.85`, auto-confirms at `0.80` (with a
top-1/top-2 margin of `0.06`), and asks for the staff PIN below that. Tune
from the `[face-match]` logcat lines.
