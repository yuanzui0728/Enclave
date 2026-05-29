import type { ReactNode } from "react";

interface FarmSkyProps {
  children: ReactNode;
}

export function FarmSky({ children }: FarmSkyProps) {
  return (
    <div className="farm-sky relative h-full overflow-hidden">
      <div aria-hidden className="farm-sky__bg pointer-events-none absolute inset-0">
        <div className="farm-sky__gradient absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-sky-200 via-sky-100 to-emerald-50" />
        <div className="farm-sky__grass absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-b from-emerald-50 via-emerald-100 to-emerald-200" />
        <div className="farm-sky__hill absolute inset-x-0 bottom-0 h-24 bg-emerald-300/40" style={{ clipPath: "ellipse(70% 70% at 50% 100%)" }} />

        <span className="farm-sky__sun absolute right-6 top-6 select-none text-4xl drop-shadow-md">
          ☀️
        </span>

        <span className="farm-sky__cloud farm-sky__cloud--a select-none text-4xl">☁️</span>
        <span className="farm-sky__cloud farm-sky__cloud--b select-none text-3xl">☁️</span>
        <span className="farm-sky__cloud farm-sky__cloud--c select-none text-5xl">☁️</span>
      </div>

      <div className="relative z-10 h-full overflow-y-auto">{children}</div>

      <style>{`
        .farm-sky__sun {
          animation: farm-sky-sun 22s linear infinite;
          transform-origin: center;
          filter: drop-shadow(0 2px 6px rgba(142, 113, 222, 0.55));
        }
        .farm-sky__cloud {
          position: absolute;
          opacity: 0.75;
          filter: drop-shadow(0 2px 4px rgba(255, 255, 255, 0.6));
          will-change: transform;
        }
        .farm-sky__cloud--a {
          top: 8%;
          animation: farm-sky-cloud-drift 64s linear infinite;
        }
        .farm-sky__cloud--b {
          top: 16%;
          animation: farm-sky-cloud-drift 88s linear infinite;
          animation-delay: -22s;
          opacity: 0.6;
        }
        .farm-sky__cloud--c {
          top: 4%;
          animation: farm-sky-cloud-drift 110s linear infinite;
          animation-delay: -55s;
          opacity: 0.5;
        }
        @keyframes farm-sky-cloud-drift {
          0%   { transform: translate3d(-20vw, 0, 0); }
          100% { transform: translate3d(120vw, 0, 0); }
        }
        @keyframes farm-sky-sun {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .farm-sky__sun,
          .farm-sky__cloud {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
