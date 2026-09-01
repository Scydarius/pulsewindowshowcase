import "./globals.css";

export const metadata = {
  title: "PulseWindow | Remote health insights",
  description: "A clearer way to support remote check-ins with camera-based pulse and breathing trends.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
