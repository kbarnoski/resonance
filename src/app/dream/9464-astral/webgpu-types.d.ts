// Pulls the WebGPU global type augmentations (navigator.gpu, GPUDevice, WGSL
// binding types, etc.) into this prototype's compilation. TS's default lib.dom
// does not yet ship the WebGPU globals, so this folder-local triple-slash
// reference makes them available without touching the shared tsconfig — the
// same idiom the other WebGPU prototypes in this gallery use.
/// <reference types="@webgpu/types" />
