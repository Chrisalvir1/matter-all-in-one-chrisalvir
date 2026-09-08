import React from "react";

interface DeviceCardArtProps {
  domain: string;
  state?: string;
  isDay?: boolean;
  attributes?: Record<string, any>;
}

export const DeviceCardArt: React.FC<DeviceCardArtProps> = ({
  domain,
  state = "off",
  isDay = true,
  attributes = {},
}) => {
  const isOn =
    state === "on" ||
    state === "heat" ||
    state === "cool" ||
    state === "open" ||
    state === "unlocked";

  // Night/Day ambiance palette
  const ambientSky = isDay
    ? "radial-gradient(ellipse at 85% 20%, rgba(56, 139, 253, 0.15) 0%, rgba(20, 24, 36, 0.05) 60%, transparent 80%)"
    : "radial-gradient(ellipse at 85% 20%, rgba(130, 80, 223, 0.12) 0%, rgba(15, 17, 24, 0.08) 60%, transparent 80%)";

  return (
    <div
      className={`card-art-backdrop ${isDay ? "mode-day" : "mode-night"} ${
        isOn ? "state-active" : "state-idle"
      }`}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        borderRadius: "inherit",
        background: ambientSky,
      }}
      aria-hidden="true"
    >
      {/* Deep dark gradient overlay that fades the illustration seamlessly into #0B0D13 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "220px",
          height: "100%",
          opacity: isOn ? 0.95 : 0.45,
          transition: "opacity 0.6s ease",
          maskImage:
            "linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 95%)",
          WebkitMaskImage:
            "linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 95%)",
        }}
      >
        {domain === "fan" && (
          <svg
            viewBox="0 0 160 140"
            width="100%"
            height="100%"
            preserveAspectRatio="xMaxYMid meet"
          >
            <defs>
              <linearGradient id="fanBaseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2A2D36" />
                <stop offset="100%" stopColor="#12141A" />
              </linearGradient>
              <linearGradient id="breezeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#007AFF" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Pedestal Fan Silhouette */}
            <rect x="110" y="80" width="8" height="55" rx="4" fill="url(#fanBaseGrad)" />
            <ellipse cx="114" cy="132" rx="26" ry="6" fill="#1C1E26" />
            <circle
              cx="114"
              cy="48"
              r="34"
              fill="rgba(255,255,255,0.03)"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="2"
            />
            {/* Airflow waves when running */}
            {isOn && (
              <g className="airflow-stream">
                <path
                  d="M75 36 C55 34 40 40 25 36"
                  fill="none"
                  stroke="url(#breezeGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="breeze-line-1"
                />
                <path
                  d="M72 48 C50 46 35 52 18 48"
                  fill="none"
                  stroke="url(#breezeGrad)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="breeze-line-2"
                />
                <path
                  d="M76 60 C58 58 45 64 30 60"
                  fill="none"
                  stroke="url(#breezeGrad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="breeze-line-3"
                />
              </g>
            )}
          </svg>
        )}

        {domain === "light" && (
          <svg
            viewBox="0 0 160 140"
            width="100%"
            height="100%"
            preserveAspectRatio="xMaxYMid meet"
          >
            <defs>
              <radialGradient id="lightCone" cx="50%" cy="0%" r="90%">
                <stop
                  offset="0%"
                  stopColor={isDay ? "#FFE5A3" : "#FFA94D"}
                  stopOpacity={isOn ? 0.35 : 0.05}
                />
                <stop offset="100%" stopColor="#0B0D13" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Pendant Lamp Cord & Dome */}
            <line x1="120" y1="0" x2="120" y2="35" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
            <path
              d="M102 48 C102 38 138 38 138 48 Z"
              fill="#262A34"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1.5"
            />
            {/* Light Cone radiating downwards */}
            {isOn && (
              <polygon
                points="102,48 138,48 158,140 82,140"
                fill="url(#lightCone)"
              />
            )}
          </svg>
        )}

        {domain === "climate" && (
          <svg
            viewBox="0 0 160 140"
            width="100%"
            height="100%"
            preserveAspectRatio="xMaxYMid meet"
          >
            {/* Modern Wall AC Unit */}
            <rect
              x="80"
              y="25"
              width="68"
              height="30"
              rx="5"
              fill="#20242E"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1.5"
            />
            {/* Vent blade */}
            <line
              x1="86"
              y1="48"
              x2="142"
              y2="48"
              stroke={isOn ? "#00E5FF" : "rgba(255,255,255,0.3)"}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Thermal waves */}
            {isOn && (
              <g className="thermal-stream">
                <path
                  d="M92 56 C90 70 96 82 92 98"
                  fill="none"
                  stroke={state === "heat" ? "rgba(255,149,0,0.5)" : "rgba(0,199,190,0.5)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M114 56 C112 70 118 82 114 98"
                  fill="none"
                  stroke={state === "heat" ? "rgba(255,149,0,0.5)" : "rgba(0,199,190,0.5)"}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M136 56 C134 70 140 82 136 98"
                  fill="none"
                  stroke={state === "heat" ? "rgba(255,149,0,0.5)" : "rgba(0,199,190,0.5)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </g>
            )}
          </svg>
        )}

        {domain === "cover" && (
          <svg
            viewBox="0 0 160 140"
            width="100%"
            height="100%"
            preserveAspectRatio="xMaxYMid meet"
          >
            {/* Window Frame with deep gradient background */}
            <rect
              x="85"
              y="15"
              width="62"
              height="110"
              rx="4"
              fill="rgba(15, 20, 30, 0.6)"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="1.6"
            />
            {/* Venetian Blinds */}
            <line x1="88" y1="28" x2="144" y2="28" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
            <line x1="88" y1="42" x2="144" y2="42" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
            <line x1="88" y1="56" x2="144" y2="56" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
            <line x1="88" y1="70" x2="144" y2="70" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
            <line x1="88" y1="84" x2="144" y2="84" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
          </svg>
        )}
      </div>
    </div>
  );
};
