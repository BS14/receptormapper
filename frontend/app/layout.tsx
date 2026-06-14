import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Audiowide, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const audiowide = Audiowide({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-audiowide",
  display: "swap",
});

const ibmPlexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ibm-plex-serif",
  display: "swap",
});

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
    <html lang="en" className={`bg-cream ${audiowide.variable} ${ibmPlexSerif.variable}`}>
      <body className="min-h-screen bg-cream text-ink antialiased flex flex-col font-serif">

        {/* ── Header ── */}
        <header className="border-b border-cream-dark/60 bg-cream px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Image
                src="/logo.png"
                alt="ReceptorMapper Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <div className="flex items-baseline gap-3">
                <span
                  className="text-lg font-semibold tracking-tight text-teal-dark"
                  style={{ fontFamily: "var(--font-audiowide)" }}
                >
                  ReceptorMapper
                </span>
                <span className="text-xs text-ink-faint uppercase tracking-widest hidden sm:inline">
                  DTI Prediction Platform
                </span>
              </div>
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl w-full px-6 py-10 flex-1">{children}</main>

        {/* ── Footer ── */}
        <footer className="border-t border-cream-dark/60 bg-cream-dark/30 px-6 py-8 mt-auto">
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 text-center">
            <div className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="ReceptorMapper Logo"
                width={28}
                height={28}
                className="rounded-lg opacity-70"
              />
              <span
                className="text-sm font-medium text-ink-muted"
                style={{ fontFamily: "var(--font-audiowide)" }}
              >
                ReceptorMapper
              </span>
            </div>

            <blockquote className="max-w-xl text-sm italic text-ink-faint leading-relaxed">
              &ldquo;{randomQuote}&rdquo;
            </blockquote>

            <div className="flex flex-col items-center gap-1.5 text-xs text-ink-faint">
              <p>
                Made with{" "}
                <span className="text-coral">&#10084;</span>
                {" "}in Nepal
              </p>
              <p className="text-ink-faint/70">
                &copy; {new Date().getFullYear()} ReceptorMapper. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
