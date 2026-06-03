import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReceptorMapper",
  description: "Drug-target interaction prediction platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <header className="border-b border-gray-800 px-6 py-4">
          <span className="text-lg font-semibold tracking-tight text-indigo-400">
            ReceptorMapper
          </span>
          <span className="ml-3 text-xs text-gray-500 uppercase tracking-widest">
            DTI Prediction Platform
          </span>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
