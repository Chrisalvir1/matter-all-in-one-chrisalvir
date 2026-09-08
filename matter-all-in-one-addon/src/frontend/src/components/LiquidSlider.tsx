import React, { useState, useEffect, useRef } from "react";
import { api } from "../api/client";

interface LiquidSliderProps {
  entityId: string;
  domain: string;
  initialValue: number;
  min?: number;
  max?: number;
  step?: number;
  color?: string;
  label?: string;
  unit?: string;
  onRefresh?: () => void;
}

export const LiquidSlider: React.FC<LiquidSliderProps> = ({
  entityId,
  domain,
  initialValue,
  min = 0,
  max = 100,
  step = 1,
  color,
  label,
  unit = "%",
  onRefresh,
}) => {
  const [val, setVal] = useState<number>(initialValue);
  const [isDragging, setIsDragging] = useState(false);
  const debounceTimer = useRef<any>(null);

  useEffect(() => {
    if (!isDragging) {
      setVal(initialValue);
    }
  }, [initialValue, isDragging]);

  const sliderColor =
    color ||
    (domain === "light"
      ? "var(--apple-yellow, #ffd159)"
      : domain === "fan"
      ? "var(--apple-cyan, #007aff)"
      : "var(--apple-blue, #38bdf8)");

  const sliderIcon =
    domain === "light" ? "☼" : domain === "fan" ? "🌀" : "◈";

  const handleChange = (newVal: number) => {
    setVal(newVal);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        await api.setEntityValue(entityId, newVal);
        onRefresh?.();
      } catch (err) {
        console.error("Error setting slider value:", err);
      }
    }, 120);
  };

  return (
    <div
      className="liquid-slider-wrapper"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginTop: "6px",
        padding: "5px 8px",
        background: "rgba(0, 0, 0, 0.28)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "12px",
        boxSizing: "border-box",
        cursor: "default",
        userSelect: "none",
        zIndex: 5,
      }}
    >
      <div
        style={{
          position: "relative",
          flex: 1,
          height: "8px",
          background: "rgba(255, 255, 255, 0.12)",
          borderRadius: "999px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.max(0, Math.min(100, val))}%`,
            background: sliderColor,
            borderRadius: "999px",
            transition: isDragging ? "none" : "width 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
            boxShadow: `0 0 10px ${sliderColor}44`,
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "0.74rem",
          fontWeight: 600,
          color: "#cbd5e1",
          minWidth: "46px",
          justifyContent: "flex-end",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{sliderIcon}</span>
        <span>
          {val}
          {unit}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        onMouseDown={() => setIsDragging(true)}
        onTouchStart={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        onTouchEnd={() => setIsDragging(false)}
        onChange={(e) => handleChange(Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
        title={label ? `${label}: ${val}${unit}` : `${val}${unit}`}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
          margin: 0,
          zIndex: 10,
        }}
      />
    </div>
  );
};
