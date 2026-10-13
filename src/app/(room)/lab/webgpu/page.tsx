import type { Metadata } from "next";
import WebGPULab from "./lab";

// The WebGPU particle engine lab (phase A skeleton — docs/webgpu-engine-plan.md).
// Not linked from anywhere; open /lab/webgpu on the kiosk to measure.
export const metadata: Metadata = {
  title: "WebGPU particle lab",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <WebGPULab />;
}
