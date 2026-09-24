import React, { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../api/client";
import { copyToClipboard } from "../utils/clipboard";
import { StatusResponse } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, isError?: boolean) => void;
  status?: StatusResponse | null;
  stats?: {
    totalDevices: number;
    exportedNodes: number;
    pairedTotal: number;
    issues: number;
  };
  onRefresh?: () => void;
}

function getLogSeverity(line: string): "error" | "warn" | "info" | "default" {
  const lower = line.toLowerCase();
  if (/\b(error|failed|failure|exception|unable|crash|fatal)\b/.test(lower)) return "error";
  if (/\b(warn|warning|timeout|retry|deprecated)\b/.test(lower)) return "warn";
  if (/\b(info|notice|debug|connected|registered|online)\b/.test(lower)) return "info";
  return "default";
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  showToast,
  status,
  stats,
  onRefresh,
}) => {
  const [mqttHost, setMqttHost] = useState("");
  const [mqttPort, setMqttPort] = useState(1883);
  const [mqttUser, setMqttUser] = useState("");
  const [mqttPass, setMqttPass] = useState("");
  const [isSavingMqtt, setIsSavingMqtt] = useState(false);

  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState<"all" | "error" | "warn" | "info">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);

  const logsContainerRef = useRef<HTMLDivElement>(null);

  const handleLoadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await api.getLogs();
      setSystemLogs(res.logs || []);
    } catch (err: any) {
      showToast(err.message || "Error al cargar logs", true);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // Fetch existing MQTT config
    api
      .getMqttConfig()
      .then((cfg) => {
        if (cfg) {
          setMqttHost(cfg.host || "");
          setMqttPort(cfg.port || 1883);
          setMqttUser(cfg.username || cfg.user || "");
          setMqttPass(cfg.password || "");
        }
      })
      .catch(() => {});

    // Automatically load logs when modal opens
    handleLoadLogs();
  }, [isOpen]);

  // Calculate counts for filters
  const counts = useMemo(() => {
    let errors = 0;
    let warns = 0;
    let infos = 0;
    for (const log of systemLogs) {
      const sev = getLogSeverity(log);
      if (sev === "error") errors++;
      else if (sev === "warn") warns++;
      else if (sev === "info") infos++;
    }
    return { all: systemLogs.length, errors, warns, infos };
  }, [systemLogs]);

  // Filter logs by active tab and search query
  const filteredLogs = useMemo(() => {
    let result = systemLogs;
    if (logFilter !== "all") {
      result = result.filter((line) => getLogSeverity(line) === logFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((line) => line.toLowerCase().includes(q));
    }
    return result;
  }, [systemLogs, logFilter, searchQuery]);

  // Auto-scroll when logs change if autoScroll is active
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  if (!isOpen) return null;

  const handleSaveMqtt = async () => {
    setIsSavingMqtt(true);
    try {
      await api.saveMqttConfig({
        host: mqttHost,
        port: Number(mqttPort),
        user: mqttUser,
        username: mqttUser,
        password: mqttPass,
      });
      showToast("✓ Configuración MQTT guardada");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al guardar MQTT", true);
    } finally {
      setIsSavingMqtt(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm("¿Deseas reiniciar el servicio de Matter All-in-One?")) return;
    try {
      await api.restartService();
      showToast("Reiniciando servicio...");
      onClose();
    } catch (err: any) {
      showToast(err.message || "Error al reiniciar servicio", true);
    }
  };

  const handleFactoryReset = async () => {
    const ok = confirm(
      "¿Estás seguro de que deseas restablecer de fábrica el plugin? Se eliminarán todos los accesorios Matter y requerirá volver a emparejar."
    );
    if (!ok) return;
    try {
      await api.factoryReset();
      showToast("Restablecimiento de fábrica iniciado...");
      onClose();
    } catch (err: any) {
      showToast(err.message || "Error al restablecer", true);
    }
  };

  const handleCopyLogs = async () => {
    try {
      const text = filteredLogs.join("\n");
      if (!text) {
        showToast("No hay registros para copiar", true);
        return;
      }
      const ok = await copyToClipboard(text);
      if (ok) {
        showToast(`✓ ${filteredLogs.length} líneas copiadas al portapapeles`);
      } else {
        showToast("⚠️ No se pudo acceder al portapapeles", true);
      }
    } catch (err: any) {
      showToast(err.message || "Error al copiar logs", true);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("¿Deseas vaciar el historial de registros del Add-on?")) return;
    try {
      await api.clearLogs();
      setSystemLogs([]);
      showToast("✓ Registros del sistema vaciados");
    } catch (err: any) {
      showToast(err.message || "Error al vaciar logs", true);
    }
  };

  return (
    <div
      className="modal-backdrop open"
      id="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <section className="modal modal-settings-wide">
        <button
          className="icon-button"
          id="settings-modal-close"
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
        >
          ×
        </button>

        {/* Header with Title & Telemetry Pills */}
        <div className="settings-modal-header">
          <div className="settings-modal-header-left">
            <span className="settings-sparkle">⚙️</span>
            <div>
              <div className="settings-header-badge-row">
                <span className="settings-badge-eyebrow">MANTENIMIENTO & SISTEMA</span>
                <span className="settings-ha-status-pill">
                  {status?.haStatus === "conectado" ? (
                    <span className="pill-healthy">✓ HA Conectado</span>
                  ) : (
                    <span className="pill-warning">⚠️ HA Desconectado</span>
                  )}
                </span>
                <span className="settings-version-pill">v{status?.version || "1.5.76"}</span>
              </div>
              <h2 id="settings-title">Ajustes del Servicio & Registros</h2>
            </div>
          </div>
        </div>

        {/* Dual-column horizontal layout */}
        <div className="settings-grid-layout">
          {/* Left Column: Telemetry, MQTT, Operations & Danger Zone */}
          <div className="settings-left-col">
            {/* Card 1: System Telemetry */}
            <div className="settings-card-glass">
              <div className="settings-card-title">
                <span>📊</span> Telemetría del Servicio
              </div>
              <div className="settings-telemetry-grid">
                <div className="telemetry-item">
                  <span className="telemetry-label">Servicio Bridge</span>
                  <strong className="telemetry-value" title={status?.bridgeName}>
                    {status?.bridgeName || "Matter All-in-One"}
                  </strong>
                </div>
                <div className="telemetry-item">
                  <span className="telemetry-label">Nodos Activos</span>
                  <strong className="telemetry-value">
                    {stats?.exportedNodes ?? status?.exportedNodes ?? 0}
                  </strong>
                </div>
                <div className="telemetry-item">
                  <span className="telemetry-label">Emparejados</span>
                  <strong className="telemetry-value text-green">
                    {stats?.pairedTotal ?? status?.commissionedNodes ?? 0}
                  </strong>
                </div>
                <div className="telemetry-item">
                  <span className="telemetry-label">Incidencias</span>
                  <strong
                    className={`telemetry-value ${(stats?.issues ?? 0) > 0 ? "text-amber" : "text-green"}`}
                  >
                    {stats?.issues ?? 0}
                  </strong>
                </div>
              </div>
            </div>

            {/* Card 2: MQTT Auto-Discovery */}
            <div className="settings-card-glass">
              <div className="settings-card-title">
                <span>📡</span> Configuración MQTT (Auto-Discovery)
              </div>
              <p className="settings-card-desc">
                Habilita la integración de dispositivos MQTT directamente en el ecosistema Matter.
              </p>
              <div className="mqtt-form-grid">
                <div className="input-group">
                  <label htmlFor="mqtt-host">Broker IP / Host</label>
                  <input
                    type="text"
                    id="mqtt-host"
                    placeholder="ej. 192.168.110.147"
                    aria-label="MQTT Host"
                    className="form-input"
                    value={mqttHost}
                    onChange={(e) => setMqttHost(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="mqtt-port">Puerto</label>
                  <input
                    type="number"
                    id="mqtt-port"
                    placeholder="1883"
                    aria-label="MQTT Port"
                    className="form-input"
                    value={mqttPort}
                    onChange={(e) => setMqttPort(Number(e.target.value))}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="mqtt-user">Usuario (opcional)</label>
                  <input
                    type="text"
                    id="mqtt-user"
                    placeholder="Usuario MQTT"
                    aria-label="MQTT User"
                    className="form-input"
                    value={mqttUser}
                    onChange={(e) => setMqttUser(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="mqtt-pass">Contraseña (opcional)</label>
                  <input
                    type="password"
                    id="mqtt-pass"
                    placeholder="Contraseña"
                    aria-label="MQTT Password"
                    className="form-input"
                    value={mqttPass}
                    onChange={(e) => setMqttPass(e.target.value)}
                  />
                </div>
              </div>
              <button
                className="button button-primary button-full"
                id="mqtt-save-button"
                type="button"
                onClick={handleSaveMqtt}
                disabled={isSavingMqtt}
              >
                {isSavingMqtt ? "Guardando..." : "💾 Guardar Configuración MQTT"}
              </button>
            </div>

            {/* Card 3: Service Operations */}
            <div className="settings-card-glass">
              <div className="settings-card-title">
                <span>⚡</span> Operaciones del Servicio
              </div>
              <div className="operations-row">
                <div>
                  <strong>Reiniciar servicio</strong>
                  <p>Recarga el runtime y restablece conexiones activas.</p>
                </div>
                <button
                  className="button button-secondary"
                  id="restart-button"
                  type="button"
                  onClick={handleRestart}
                >
                  🔄 Reiniciar
                </button>
              </div>
            </div>

            {/* Card 4: Danger Zone */}
            <div className="settings-card-glass danger-card">
              <div className="settings-card-title danger-title">
                <span>⚠️</span> Zona de Mantenimiento Crítico
              </div>
              <div className="operations-row">
                <div>
                  <strong className="text-red">Restablecimiento de fábrica</strong>
                  <p>Elimina toda la configuración y obligará a volver a emparejar.</p>
                </div>
                <button
                  className="button button-danger"
                  id="factory-reset-button"
                  type="button"
                  onClick={handleFactoryReset}
                >
                  Restablecer
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Glass Terminal & Console */}
          <div className="settings-right-col">
            <div className="glass-terminal-wrapper">
              {/* Terminal Header & Toolbar */}
              <div className="terminal-header">
                <div className="terminal-header-title">
                  <span className="terminal-dot red" />
                  <span className="terminal-dot yellow" />
                  <span className="terminal-dot green" />
                  <span className="terminal-title-text">REGISTROS DEL SISTEMA (CONSOLE LOGS)</span>
                </div>

                <div className="terminal-header-actions">
                  <label className="terminal-search-box">
                    <span>⌕</span>
                    <input
                      type="search"
                      placeholder="Buscar en logs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="search-clear-btn"
                        title="Borrar búsqueda"
                      >
                        ×
                      </button>
                    )}
                  </label>

                  <button
                    className={`terminal-action-btn ${autoScroll ? "active" : ""}`}
                    type="button"
                    onClick={() => setAutoScroll(!autoScroll)}
                    title={autoScroll ? "Auto-scroll activado" : "Auto-scroll pausado"}
                  >
                    {autoScroll ? "⬇ Auto-scroll" : "⏸ Pausado"}
                  </button>

                  <button
                    className="terminal-action-btn"
                    type="button"
                    onClick={handleLoadLogs}
                    disabled={isLoadingLogs}
                    title="Recargar registros"
                  >
                    <span className={isLoadingLogs ? "spin" : ""}>↻</span>
                    {isLoadingLogs ? "Cargando…" : "Actualizar"}
                  </button>

                  <button
                    className="terminal-action-btn"
                    type="button"
                    onClick={handleCopyLogs}
                    title="Copiar registros visibles al portapapeles"
                  >
                    📋 Copiar
                  </button>

                  <button
                    className="terminal-action-btn btn-danger-subtle"
                    type="button"
                    onClick={handleClearLogs}
                    title="Vaciar historial de logs del Add-on"
                  >
                    🗑️ Limpiar
                  </button>
                </div>
              </div>

              {/* Severity Filter Tabs */}
              <div className="terminal-filters-row">
                <button
                  type="button"
                  className={`filter-tab-pill ${logFilter === "all" ? "active" : ""}`}
                  onClick={() => setLogFilter("all")}
                >
                  Todos <span className="pill-count">{counts.all}</span>
                </button>
                <button
                  type="button"
                  className={`filter-tab-pill pill-error ${logFilter === "error" ? "active" : ""}`}
                  onClick={() => setLogFilter("error")}
                >
                  ❌ Errores <span className="pill-count">{counts.errors}</span>
                </button>
                <button
                  type="button"
                  className={`filter-tab-pill pill-warn ${logFilter === "warn" ? "active" : ""}`}
                  onClick={() => setLogFilter("warn")}
                >
                  ⚠️ Advertencias <span className="pill-count">{counts.warns}</span>
                </button>
                <button
                  type="button"
                  className={`filter-tab-pill pill-info ${logFilter === "info" ? "active" : ""}`}
                  onClick={() => setLogFilter("info")}
                >
                  ℹ️ Info / Eventos <span className="pill-count">{counts.infos}</span>
                </button>

                <span className="terminal-status-counter">
                  Mostrando: <strong>{filteredLogs.length}</strong> de {systemLogs.length}
                </span>
              </div>

              {/* Terminal Body */}
              <div className="glass-terminal-body" ref={logsContainerRef}>
                {filteredLogs.length === 0 ? (
                  <div className="terminal-empty-state">
                    {isLoadingLogs ? (
                      <>
                        <span className="spinner" />
                        <p>Cargando registros del sistema…</p>
                      </>
                    ) : (
                      <p>
                        {searchQuery
                          ? `No se encontraron registros que coincidan con "${searchQuery}".`
                          : "No hay registros disponibles para este filtro."}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="terminal-lines-list">
                    {filteredLogs.map((logLine, idx) => {
                      const sev = getLogSeverity(logLine);
                      return (
                        <div key={idx} className={`terminal-line line-${sev}`}>
                          <span className="line-num">{idx + 1}</span>
                          <span className="line-content">{logLine}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
