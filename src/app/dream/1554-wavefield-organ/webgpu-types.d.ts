// Folder-local WebGPU global types (navigator.gpu, GPUDevice, GPUBufferUsage,
// the WGSL binding globals, etc.). TS's default lib.dom does not yet ship the
// WebGPU globals; the @webgpu/types package is installed, so this triple-slash
// reference pulls them into this prototype's compilation without touching the
// shared tsconfig. Mirrors the pattern used by 1348-prism-cortex.
/// <reference types="@webgpu/types" />
