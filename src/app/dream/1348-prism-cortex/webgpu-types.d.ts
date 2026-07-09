// Pulls the WebGPU global type augmentations (navigator.gpu, GPUDevice, WGSL
// binding types, etc.) into this prototype's compilation. The @webgpu/types
// package is already installed; TS's default lib.dom does not yet ship WebGPU
// globals, so this triple-slash reference makes them available folder-locally
// without touching the shared tsconfig.
/// <reference types="@webgpu/types" />
