/**
 * HapExportModal — Modal para seleccionar y exportar una entidad como
 * accesorio HAP genérico (humidificador, TV, alarma, válvula, etc.)
 *
 * Se muestra cuando el usuario pulsa "Exportar como HAP HomeKit" en DeviceModal.
 * NO toca los dispositivos ya exportados como Matter o HAP cámara.
 */

import React, { useState, useEffect } from "react";
import { api } from "../api/client";
import { EntityRecord, HapProfile } from "../types";

interface HapExportModalProps {
  entity: EntityRecord;
  onClose: () => void;
  onSuccess: (pincode: string, port: number) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

/** Dominios que se exportan como Matter — NO deben ofrecerse como HAP */
const MATTER_ONLY_DOMAINS = new Set([
  "light",
  "switch",
  "fan",
  "lock",
  "sensor",
  "binary_sensor",
  "vacuum",
  "climate",
]);

/** Retorna true si el dominio debe ir sólo por Matter */
export function isMatterOnlyDomain(domain: string): boolean {
  return MATTER_ONLY_DOMAINS.has(domain);
}

/** Retorna true si el dominio puede exportarse como HAP genérico */
export function isHapEligible(domain: string): boolean {
  return !MATTER_ONLY_DOMAINS.has(domain) && domain !== "camera";
}

export const HapExportModal: React.FC<HapExportModalProps> = ({
  entity,
  onClose,
  onSuccess,
  showToast,
}) => {
  const [profiles, setProfiles] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedProfile, setSelectedProfile] = useState<HapProfile>("humidifier");
  const [isBusy, setIsBusy] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  useEffect(() => {
    api
      .getHapProfiles()
      .then((data) => {
        setProfiles(data);
        // Pre-seleccionar el perfil más probable según el dominio
        const domain = entity.domain;
        const defaultMap: Partial<Record<string, HapProfile>> = {
          humidifier: "humidifier",
          media_player: "television",
          valve: "valve_irrigation",
          alarm_control_panel: "security_system",
          cover: "garage_door",
          input_boolean: "switch_hap",
          input_select: "switch_hap",
          remote: "television",
          water_heater: "heater_cooler",
          number: "switch_hap",
          select: "switch_hap",
          button: "switch_hap",
          scene: "switch_hap",
          script: "switch_hap",
          automation: "switch_hap",
          input_number: "switch_hap",
        };
        if (defaultMap[domain]) setSelectedProfile(defaultMap[domain]!);
      })
      .catch(() => showToast("Error al cargar perfiles HAP", true))
      .finally(() => setLoadingProfiles(false));
  }, [entity.domain]);

  const handleExport = async () => {
    setIsBusy(true);
    try {
      const res = await api.registerHap(entity.entityId, selectedProfile);
      if (res.success) {
        showToast(
          `✓ ${entity.name || entity.entityId} publicado como "${profiles.find((p) => p.id === selectedProfile)?.label || selectedProfile}" vía HomeKit HAP (PIN: ${res.pincode})`,
        );
        onSuccess(res.pincode || "", res.port || 0);
      } else {
        showToast(res.error || "Error al publicar accesorio HAP", true);
      }
    } catch (err: any) {
      showToast(err.message || "Error al publicar accesorio HAP", true);
    } finally {
      setIsBusy(false);
    }
  };

  const modalBg: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const modalBox: React.CSSProperties = {
    background: "#1a1a2e",
    border: "1px solid rgba(245,158,11,0.35)",
    borderRadius: 16,
    padding: "28px 32px",
    maxWidth: 480,
    width: "90%",
    boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
    color: "#e5e7eb",
  };

  return (
    <div style={modalBg} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <span style={{ fontSize: 22 }}>🏠</span>{" "}
            <span style={{ fontWeight: 700, fontSize: 18, color: "#fcd34d" }}>
              Exportar como HomeKit HAP
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#9ca3af",
              fontSize: 22,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Entity name */}
        <p style={{ margin: "0 0 16px", color: "#9ca3af", fontSize: 13 }}>
          Entidad:{" "}
          <span style={{ color: "#e5e7eb", fontWeight: 600 }}>
            {entity.name || entity.entityId}
          </span>{" "}
          <code style={{ background: "rgba(255,255,255,0.07)", borderRadius: 4, padding: "1px 6px", fontSize: 11 }}>
            {entity.entityId}
          </code>
        </p>

        {/* Profile selector */}
        <label
          style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 13, color: "#d1d5db" }}
        >
          Tipo de accesorio HomeKit
        </label>
        {loadingProfiles ? (
          <p style={{ color: "#6b7280", fontSize: 13 }}>Cargando perfiles…</p>
        ) : (
          <select
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value as HapProfile)}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 8,
              color: "#e5e7eb",
              fontSize: 14,
              marginBottom: 20,
              cursor: "pointer",
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id} style={{ background: "#1a1a2e" }}>
                {p.label}
              </option>
            ))}
          </select>
        )}

        {/* Info note */}
        <div
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 20,
            fontSize: 12,
            color: "#fbbf24",
          }}
        >
          🏠 Este accesorio aparecerá en Apple Home con el icono del tipo seleccionado.
          Escanea el código QR en la app <strong>Apple Home</strong> para vincularlo.
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 20px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              color: "#9ca3af",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleExport}
            disabled={isBusy || loadingProfiles}
            style={{
              padding: "9px 22px",
              background: "rgba(245,158,11,0.15)",
              border: "1px solid rgba(245,158,11,0.4)",
              borderRadius: 8,
              color: "#fcd34d",
              fontWeight: 700,
              cursor: isBusy ? "not-allowed" : "pointer",
              fontSize: 14,
              opacity: isBusy ? 0.6 : 1,
            }}
          >
            {isBusy ? "Publicando…" : "🏠 Publicar en HomeKit HAP"}
          </button>
        </div>
      </div>
    </div>
  );
};
