// Pulls the WebGPU global type augmentations (navigator.gpu, GPUDevice, the WGSL
// binding types, etc.) into this prototype's compilation. TS's default lib.dom
// does not yet ship the WebGPU globals, so this folder-local triple-slash
// reference makes them available without touching the shared tsconfig — the same
// idiom every other raw-WebGPU prototype in this gallery uses.
/// <reference types="@webgpu/types" />
