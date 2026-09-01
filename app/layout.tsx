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
  title: 'FRAME — GPT Scene Engine',
  description: '为 GPT 分件生成资产设计的 HTML 游戏场景引擎。',
  openGraph: {
    title: 'FRAME — GPT Scene Engine',
    description: '原创多层住宅、分件生成资产、人物动画与可推门物理。',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'FRAME GPT Scene Engine 多层住宅演示' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FRAME — GPT Scene Engine',
    description: '原创多层住宅、分件生成资产、人物动画与可推门物理。',
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
