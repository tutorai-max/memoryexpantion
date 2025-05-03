import './globals.css';
export const metadata = { title: 'Memory Expansion', description: 'AI Chat MVP' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-100 text-gray-800">{children}</body>
    </html>
  );
}