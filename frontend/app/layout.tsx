import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReceptorMapper",
  description: "Drug-target interaction prediction platform",
};

const quotes = [
  "The good physician treats the disease; the great physician treats the patient who has the disease. — William Osler",
  "Medicine is a science of uncertainty and an art of probability. — William Osler",
  "The art of medicine consists of amusing the patient while nature cures the disease. — Voltaire",
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  return (
    <html lang="en" className="bg-gray-950">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased flex flex-col">
        <header className="border-b border-gray-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="ReceptorMapper Logo"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-semibold tracking-tight text-indigo-400">
                ReceptorMapper
              </span>
              <span className="text-xs text-gray-500 uppercase tracking-widest">
                DTI Prediction Platform
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-10 flex-1">{children}</main>

        <footer className="border-t border-gray-800 px-6 py-8 mt-auto">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo.png"
                  alt="ReceptorMapper Logo"
                  width={32}
                  height={32}
                  className="rounded-lg opacity-80"
                />
                <span className="text-sm font-medium text-gray-400">ReceptorMapper</span>
              </div>

              <blockquote className="max-w-xl text-sm italic text-gray-500 leading-relaxed">
                &ldquo;{randomQuote}&rdquo;
              </blockquote>

              <div className="flex flex-col items-center gap-2 text-xs text-gray-500">
                <p>
                  Made with{" "}
                  <span className="text-red-400">&#10084;</span>
                  {" "}in Nepal
                </p>
                <p className="text-gray-600">
                  &copy; {new Date().getFullYear()} ReceptorMapper. Advancing drug discovery through AI.
                </p>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
