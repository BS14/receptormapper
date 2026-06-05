"use client";

export default function DNAHelix() {
  return (
    <div className="fixed left-0 top-0 h-full w-20 pointer-events-none overflow-hidden opacity-20 z-0">
      <svg
        viewBox="0 0 80 800"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="dnaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#22c55e" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        
        {/* DNA Double Helix Pattern */}
        {Array.from({ length: 40 }).map((_, i) => {
          const y = i * 20;
          const phase = i * 0.5;
          const x1 = 40 + Math.sin(phase) * 25;
          const x2 = 40 + Math.sin(phase + Math.PI) * 25;
          
          return (
            <g key={i}>
              {/* Left strand node */}
              <circle
                cx={x1}
                cy={y}
                r="4"
                fill="url(#dnaGradient)"
              />
              {/* Right strand node */}
              <circle
                cx={x2}
                cy={y}
                r="4"
                fill="url(#dnaGradient)"
              />
              {/* Connecting base pair */}
              {i % 2 === 0 && (
                <line
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke="url(#dnaGradient)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
              {/* Strand connections */}
              {i > 0 && (
                <>
                  <line
                    x1={40 + Math.sin((i - 1) * 0.5) * 25}
                    y1={(i - 1) * 20}
                    x2={x1}
                    y2={y}
                    stroke="url(#dnaGradient)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <line
                    x1={40 + Math.sin((i - 1) * 0.5 + Math.PI) * 25}
                    y1={(i - 1) * 20}
                    x2={x2}
                    y2={y}
                    stroke="url(#dnaGradient)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
