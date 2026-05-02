export default function VisualizerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh w-screen overflow-hidden bg-black">
      {children}
    </div>
  );
}
