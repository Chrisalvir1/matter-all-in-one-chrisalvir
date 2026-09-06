import React, { useState, useEffect } from "react";
import { CameraRecord, DeviceRecord } from "../types";
import { CameraCard } from "./CameraCard";

interface CameraBrandGroupProps {
  brand: string;
  scryptedCameras: CameraRecord[];
  haCameras: DeviceRecord[];
  onConfigureCamera: (cam: CameraRecord) => void;
  onConfigureHaDevice: (dev: DeviceRecord) => void;
}

function getInitialCollapsed(brand: string): boolean {
  try {
    const raw = localStorage.getItem("matter_collapsed_camera_brands");
    const set = new Set(JSON.parse(raw || "[]"));
    return set.has(brand.toLowerCase().trim());
  } catch {
    return false;
  }
}

function saveCollapsed(brand: string, collapsed: boolean) {
  try {
    const raw = localStorage.getItem("matter_collapsed_camera_brands");
    const set = new Set<string>(JSON.parse(raw || "[]"));
    const key = brand.toLowerCase().trim();
    if (collapsed) {
      set.add(key);
    } else {
      set.delete(key);
    }
    localStorage.setItem("matter_collapsed_camera_brands", JSON.stringify([...set]));
  } catch {}
}

export const CameraBrandGroup: React.FC<CameraBrandGroupProps> = ({
  brand,
  scryptedCameras,
  haCameras,
  onConfigureCamera,
  onConfigureHaDevice,
}) => {
  const [isOpen, setIsOpen] = useState(() => !getInitialCollapsed(brand));
  const totalCount = scryptedCameras.length + haCameras.length;

  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const openState = (e.target as HTMLDetailsElement).open;
    setIsOpen(openState);
    saveCollapsed(brand, !openState);
  };

  return (
    <details className="camera-brand-group" open={isOpen} onToggle={handleToggle}>
      <summary className="camera-brand-group__header">
        <h3>📹 {brand}</h3>
        <span className="brand-camera-count">
          {totalCount} {totalCount === 1 ? "cámara" : "cámaras"} {isOpen ? "▾" : "▸"}
        </span>
      </summary>
      <div className="cameras-grid">
        {scryptedCameras.map((cam) => (
          <CameraCard
            key={`scrypted-${cam.cameraId}`}
            camera={cam}
            onConfigure={() => onConfigureCamera(cam)}
          />
        ))}
        {haCameras.map((dev) => (
          <CameraCard
            key={`ha-${dev.id}`}
            haDevice={dev}
            onConfigure={() => onConfigureHaDevice(dev)}
          />
        ))}
      </div>
    </details>
  );
};
