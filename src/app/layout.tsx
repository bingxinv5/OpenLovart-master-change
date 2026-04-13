import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-provider";

export const metadata: Metadata = {
  title: "PixelForge-AI创作工作台",
  description: "团队级 AI 图像与视频创作工作台，高效管理画布、图片与视频项目",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
