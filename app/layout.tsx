import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Gami Engine — GPT-Native 3D HTML Game Engine',
  description: '用生成参考图学习 3D 造型，以生成材质驱动可互动浏览器场景。',
  openGraph: {
    title: 'Gami Engine — GPT-Native 3D HTML Game Engine',
    description: '原创四层住宅 Demo、生成材质、独立交互部件、角色动画与可推门物理。',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'Gami Engine 四层住宅 3D 演示' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gami Engine — GPT-Native 3D HTML Game Engine',
    description: '生成参考图学习造型，生成材质驱动真实可互动的 3D 浏览器场景。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
