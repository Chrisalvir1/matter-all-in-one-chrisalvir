import React from "react";
import { extractLightColor, rgbToHex } from "../utils/colors";

interface AppleHomeIconProps {
  domain: string;
  state?: string;
  attributes?: Record<string, any>;
  size?: number;
  className?: string;
  isDay?: boolean;
}

export const AppleHomeIcon: React.FC<AppleHomeIconProps> = ({
  domain,
  state = "off",
  attributes = {},
  size = 32,
  className = "",
  isDay = true,
}) => {
  const isOn = state === "on" || state === "heat" || state === "cool" || state === "open" || state === "unlocked";

  // Fan speed calculation
  const percentage = typeof attributes.percentage === "number" ? attributes.percentage : isOn ? 100 : 0;
  const fanDurationSec = percentage > 0 ? Math.max(0.18, Math.min(2.4, (100 / Math.max(10, percentage)) * 0.55)) : 0;

  // Exact Light color calculation from Kelvin or RGB
  const lightRgb = extractLightColor(attributes);
  const lightColor = rgbToHex(lightRgb);

  // Common SVG wrapper style
  const svgStyle: React.CSSProperties = {
    width: size,
    height: size,
    display: "inline-block",
    verticalAlign: "middle",
    flexShrink: 0,
  };

  switch (domain) {
    case "fan": {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-fan ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Ventilador"
        >
          <defs>
            <radialGradient id="fanHubGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8E8E93" />
              <stop offset="100%" stopColor="#48484A" />
            </radialGradient>
          </defs>
          {/* Outer Protective Guard Ring */}
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke={isOn ? "rgba(0, 122, 255, 0.45)" : "rgba(255, 255, 255, 0.2)"}
            strokeWidth="1.6"
          />
          {/* Rotating Blades */}
          <g
            className={`fan-blades ${isOn ? "spinning" : ""}`}
            style={{
              transformOrigin: "18px 18px",
              animationDuration: isOn ? `${fanDurationSec}s` : undefined,
            }}
          >
            {/* Blade 1 (0 deg) */}
            <path
              d="M18 18 C17 12 11 6 15 3 C19 1 21 8 18 18 Z"
              fill={isOn ? "#007AFF" : "#8E8E93"}
              opacity={isOn ? 0.95 : 0.65}
            />
            {/* Blade 2 (120 deg) */}
            <path
              d="M18 18 C23 15 31 15 31 20 C31 24 23 21 18 18 Z"
              fill={isOn ? "#007AFF" : "#8E8E93"}
              opacity={isOn ? 0.95 : 0.65}
            />
            {/* Blade 3 (240 deg) */}
            <path
              d="M18 18 C16 24 12 30 7 28 C3 25 9 20 18 18 Z"
              fill={isOn ? "#007AFF" : "#8E8E93"}
              opacity={isOn ? 0.95 : 0.65}
            />
          </g>
          {/* Center Hub */}
          <circle cx="18" cy="18" r="3.5" fill="url(#fanHubGrad)" stroke="#1C1C1E" strokeWidth="1" />
        </svg>
      );
    }

    case "light": {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-light ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Luz"
        >
          <defs>
            <radialGradient id="bulbGlow" cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor={lightColor} stopOpacity="0.85" />
              <stop offset="65%" stopColor={lightColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={lightColor} stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Glow Halo when active */}
          {isOn && <circle cx="18" cy="15" r="14" fill="url(#bulbGlow)" />}
          {/* Bulb Outline & Glass */}
          <path
            d="M12 14 C12 7.5 24 7.5 24 14 C24 18 21 20.5 20.5 23 L15.5 23 C15 20.5 12 18 12 14 Z"
            fill={isOn ? lightColor : "none"}
            fillOpacity={isOn ? 0.35 : 0}
            stroke={isOn ? lightColor : "rgba(255, 255, 255, 0.45)"}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Filament */}
          {isOn && (
            <path
              d="M16 16 L17.5 12 L18.5 12 L20 16"
              fill="none"
              stroke="#FFF"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          )}
          {/* Base / Socket */}
          <path
            d="M15 24 L21 24 M15.5 26 L20.5 26 M16.5 28 L19.5 28"
            stroke={isOn ? "#8E8E93" : "rgba(255, 255, 255, 0.3)"}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    case "climate": {
      const isHeating = state === "heat";
      const isCooling = state === "cool";
      const themeColor = isHeating ? "#FF9500" : isCooling ? "#00C7BE" : isOn ? "#FF9F0A" : "rgba(255, 255, 255, 0.4)";
      const tempDisplay = attributes.current_temperature
        ? `${Math.round(attributes.current_temperature)}°`
        : isOn
        ? "ON"
        : "OFF";

      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-climate ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Clima"
        >
          {/* Dial track */}
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="none"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="2.5"
            strokeDasharray="65 25"
            strokeDashoffset="12"
            strokeLinecap="round"
          />
          {/* Active arc */}
          {isOn && (
            <circle
              cx="18"
              cy="18"
              r="14"
              fill="none"
              stroke={themeColor}
              strokeWidth="2.8"
              strokeDasharray="45 45"
              strokeDashoffset="12"
              strokeLinecap="round"
            />
          )}
          {/* Center temperature display */}
          <text
            x="18"
            y="22"
            textAnchor="middle"
            fill={isOn ? "#FFF" : "rgba(255, 255, 255, 0.5)"}
            fontSize="9"
            fontWeight="600"
            fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif"
          >
            {tempDisplay}
          </text>
        </svg>
      );
    }

    case "switch": {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-switch ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Interruptor"
        >
          {/* Wall plate / Enclosure */}
          <rect
            x="8"
            y="6"
            width="20"
            height="24"
            rx="5"
            fill={isOn ? "rgba(48, 209, 88, 0.15)" : "rgba(255, 255, 255, 0.06)"}
            stroke={isOn ? "#30D158" : "rgba(255, 255, 255, 0.3)"}
            strokeWidth="1.6"
          />
          {/* Rocker switch body */}
          <rect
            x="12"
            y={isOn ? "9" : "17"}
            width="12"
            height="10"
            rx="2.5"
            fill={isOn ? "#30D158" : "#636366"}
          />
          {/* Power indicator light */}
          <circle
            cx="18"
            cy={isOn ? "14" : "22"}
            r="1.5"
            fill={isOn ? "#FFF" : "rgba(255, 255, 255, 0.4)"}
          />
        </svg>
      );
    }

    case "cover": {
      const pos = typeof attributes.current_position === "number" ? attributes.current_position : isOn ? 100 : 0;
      const slatCount = 4;
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-cover ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Persiana"
        >
          {/* Window Frame */}
          <rect
            x="7"
            y="6"
            width="22"
            height="24"
            rx="3"
            fill="none"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="1.6"
          />
          {/* Roller housing top */}
          <rect x="7" y="6" width="22" height="4" rx="1.5" fill="#636366" />
          {/* Slats adjusting to position (0 closed, 100 open) */}
          {Array.from({ length: slatCount }).map((_, i) => {
            const yOffset = 12 + i * 4;
            const slatVisible = (pos / 100) * slatCount <= i;
            return (
              <line
                key={i}
                x1="9"
                y1={yOffset}
                x2="27"
                y2={yOffset}
                stroke={slatVisible ? (isOn ? "#0A84FF" : "#8E8E93") : "rgba(255, 255, 255, 0.1)"}
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      );
    }

    case "lock": {
      const isLocked = state === "locked" || !isOn;
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-lock ${isLocked ? "is-locked" : "is-unlocked"} ${className}`}
          aria-label="Cerradura"
        >
          {/* Shackle */}
          <path
            d={isLocked ? "M13 16 V11 C13 8 23 8 23 11 V16" : "M13 16 V11 C13 7 23 7 23 11 V13"}
            fill="none"
            stroke={isLocked ? "#30D158" : "#FF453A"}
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Padlock Body */}
          <rect
            x="10"
            y="15"
            width="16"
            height="15"
            rx="3"
            fill={isLocked ? "#30D158" : "#FF453A"}
            opacity={0.9}
          />
          {/* Keyhole */}
          <circle cx="18" cy="21" r="1.5" fill="#1C1C1E" />
          <line x1="18" y1="22" x2="18" y2="25" stroke="#1C1C1E" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    }

    case "camera": {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-camera ${className}`}
          aria-label="Cámara"
        >
          {/* Camera housing */}
          <rect
            x="6"
            y="10"
            width="18"
            height="16"
            rx="3"
            fill="rgba(255, 255, 255, 0.15)"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="1.6"
          />
          {/* Lens triangle / cone */}
          <path
            d="M24 14 L30 11 V25 L24 22 Z"
            fill="rgba(255, 255, 255, 0.3)"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          {/* Lens glass circle */}
          <circle cx="15" cy="18" r="4.5" fill="#0A84FF" opacity={0.8} />
          <circle cx="15" cy="18" r="2" fill="#FFF" opacity={0.9} />
        </svg>
      );
    }

    case "sensor":
    case "binary_sensor": {
      const isTriggered = isOn || state === "problem" || state === "smoke" || state === "motion";
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-sensor ${isTriggered ? "is-active" : ""} ${className}`}
          aria-label="Sensor"
        >
          {/* Center emitter dot */}
          <circle cx="18" cy="18" r="4" fill={isTriggered ? "#FF9F0A" : "#8E8E93"} />
          {/* Waves */}
          <path
            d="M12 12 C8 15 8 21 12 24"
            fill="none"
            stroke={isTriggered ? "#FF9F0A" : "rgba(255, 255, 255, 0.25)"}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M24 12 C28 15 28 21 24 24"
            fill="none"
            stroke={isTriggered ? "#FF9F0A" : "rgba(255, 255, 255, 0.25)"}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    case "vacuum": {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-vacuum ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Aspiradora"
        >
          <circle
            cx="18"
            cy="18"
            r="14"
            fill={isOn ? "rgba(225, 29, 72, 0.15)" : "rgba(255, 255, 255, 0.08)"}
            stroke={isOn ? "#E11D48" : "rgba(255, 255, 255, 0.3)"}
            strokeWidth="1.6"
          />
          {/* Front Bumper arc */}
          <path
            d="M 6 18 A 12 12 0 0 1 30 18"
            fill="none"
            stroke={isOn ? "#FB7185" : "rgba(255, 255, 255, 0.2)"}
            strokeWidth="1.8"
          />
          {/* LiDAR Turret */}
          <circle
            cx="18"
            cy="21"
            r="4.5"
            fill={isOn ? "#E11D48" : "#48484A"}
            stroke="#1C1C1E"
            strokeWidth="1.2"
          />
          {/* Status LED / Laser dot */}
          <circle cx="18" cy="21" r="1.5" fill={isOn ? "#FFF" : "#8E8E93"} />
        </svg>
      );
    }

    case "humidifier": {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-humidifier ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Humidificador"
        >
          <path
            d="M 18 6 C 18 6 10 17 10 23 A 8 8 0 0 0 26 23 C 26 17 18 6 18 6 Z"
            fill={isOn ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.08)"}
            stroke={isOn ? "#38BDF8" : "rgba(255, 255, 255, 0.3)"}
            strokeWidth="1.8"
          />
          {isOn && (
            <circle cx="18" cy="23" r="3.5" fill="#38BDF8" opacity={0.8} />
          )}
        </svg>
      );
    }

    case "media_player": {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-media-player ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Reproductor Multimedia"
        >
          <rect
            x="6"
            y="9"
            width="24"
            height="16"
            rx="3"
            fill={isOn ? "rgba(10, 132, 255, 0.2)" : "rgba(255, 255, 255, 0.08)"}
            stroke={isOn ? "#0A84FF" : "rgba(255, 255, 255, 0.3)"}
            strokeWidth="1.6"
          />
          {isOn ? (
            <polygon points="15,13 23,17 15,21" fill="#0A84FF" />
          ) : (
            <line x1="12" y1="28" x2="24" y2="28" stroke="rgba(255, 255, 255, 0.3)" strokeWidth="1.6" strokeLinecap="round" />
          )}
        </svg>
      );
    }

    case "chandelier": {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-chandelier ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Candelabro"
        >
          <line x1="18" y1="4" x2="18" y2="10" stroke={isOn ? lightColor : "rgba(255,255,255,0.4)"} strokeWidth="1.5" />
          <path d="M12 16 C12 22 24 22 24 16" fill="none" stroke={isOn ? lightColor : "rgba(255,255,255,0.4)"} strokeWidth="1.5" />
          <path d="M8 14 C8 25 28 25 28 14" fill="none" stroke={isOn ? lightColor : "rgba(255,255,255,0.3)"} strokeWidth="1.5" />
          <circle cx="8" cy="12" r="2" fill={isOn ? lightColor : "#8E8E93"} />
          <circle cx="18" cy="10" r="2.5" fill={isOn ? lightColor : "#8E8E93"} />
          <circle cx="28" cy="12" r="2" fill={isOn ? lightColor : "#8E8E93"} />
          {/* Hanging crystal drops */}
          <line x1="18" y1="22" x2="18" y2="28" stroke={isOn ? lightColor : "rgba(255,255,255,0.3)"} strokeWidth="1.2" />
          <circle cx="18" cy="29" r="1.5" fill={isOn ? lightColor : "rgba(255,255,255,0.4)"} />
        </svg>
      );
    }

    case "doorbell": {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-doorbell ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Timbre"
        >
          <rect x="11" y="6" width="14" height="24" rx="4" fill="rgba(255,255,255,0.1)" stroke={isOn ? "#0A84FF" : "rgba(255,255,255,0.3)"} strokeWidth="1.6" />
          <circle cx="18" cy="12" r="3" fill="#0C0E14" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
          <circle cx="18" cy="22" r="3.5" fill={isOn ? "#0A84FF" : "rgba(255,255,255,0.25)"} style={{ filter: isOn ? "drop-shadow(0 0 4px #0A84FF)" : undefined }} />
        </svg>
      );
    }

    default: {
      return (
        <svg
          viewBox="0 0 36 36"
          style={svgStyle}
          className={`apple-home-icon icon-generic ${isOn ? "is-on" : "is-off"} ${className}`}
          aria-label="Dispositivo"
        >
          <circle
            cx="18"
            cy="18"
            r="14"
            fill="rgba(255, 255, 255, 0.08)"
            stroke={isOn ? "#0A84FF" : "rgba(255, 255, 255, 0.3)"}
            strokeWidth="1.6"
          />
          <path
            d="M18 10 V18 M14 13 C11 15 11 21 14 23 C17 25 21 24 22 21 C23 18 21 14 18 13"
            fill="none"
            stroke={isOn ? "#0A84FF" : "rgba(255, 255, 255, 0.5)"}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    }
  }
};
