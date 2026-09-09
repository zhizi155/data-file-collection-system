import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    absolute: '数据文件收集系统 - 管理后台登录',
  },
};

export default function AdminLoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
