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
  "Wherever the art of medicine is loved, there is also a love of humanity. — Hippocrates",
  "Science and everyday life cannot and should not be separated. — Rosalind Franklin",
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  return (
    <html lang="en" className="bg-stone-50">
      <body className="min-h-screen bg-stone-50 text-stone-800 antialiased flex flex-col relative">
        {/* DNA Helix decoration on left side */}
        <div className="fixed left-0 top-0 h-full w-80 pointer-events-none z-0 opacity-40">
          <Image
            src="/dna-helix.png"
            alt=""
            fill
            className="object-cover object-right"
            priority
          />
        </div>
        
        <header className="border-b border-stone-200 px-6 py-4 bg-white/80 backdrop-blur-sm relative z-10">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="ReceptorMapper Logo"
              width={40}
              height={40}
              className="rounded-lg"
            />
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-semibold tracking-tight text-green-700">
                ReceptorMapper
              </span>
              <span className="text-xs text-stone-500 uppercase tracking-widest">
                DTI Prediction Platform
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-10 flex-1 relative z-10">{children}</main>

        <footer className="border-t border-stone-200 px-6 py-8 mt-auto bg-white/80 backdrop-blur-sm relative z-10">
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
                <span className="text-sm font-medium text-stone-600">ReceptorMapper</span>
              </div>

              <blockquote className="max-w-xl text-sm italic text-stone-500 leading-relaxed">
                &ldquo;{randomQuote}&rdquo;
              </blockquote>

              <div className="flex flex-col items-center gap-2 text-xs text-stone-500">
                <p>
                  Made with{" "}
                  <span className="text-red-500">&#10084;</span>
                  {" "}in Nepal
                </p>
                <p className="text-stone-400">
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
