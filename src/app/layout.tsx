import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  title: {
    default: '数据文件收集系统',
    template: '%s | 数据文件收集系统',
  },
  description:
    '数据文件收集系统 - 便捷的文件上传与管理平台，支持自定义命名规则、店铺管理等功能。',
  keywords: [
    '数据文件收集系统',
    '数据文件管理',
    '数据文件上传',
    '文件版本管理',
    '店铺文件管理',
  ],
  authors: [{ name: '数据文件收集系统' }],
  generator: 'Coze Code',
  icons: {
    icon: '/favicon.png',
  },
  openGraph: {
    title: '数据文件收集系统',
    description:
      '便捷的数据文件上传与管理平台，支持自定义命名规则、店铺管理和文件版本管理。',
    siteName: '数据文件收集系统',
    locale: 'zh_CN',
    type: 'website',
    // images: [
    //   {
    //     url: '',
    //     width: 1200,
    //     height: 630,
    //     alt: '扣子编程 - 你的 AI 工程师',
    //   },
    // ],
  },
  // twitter: {
  //   card: 'summary_large_image',
  //   title: 'Coze Code | Your AI Engineer is Here',
  //   description:
  //     'Build and deploy full-stack applications through AI conversation. No env setup, just flow.',
  //   // images: [''],
  // },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        <AuthProvider>
          {isDev && <Inspector />}
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
