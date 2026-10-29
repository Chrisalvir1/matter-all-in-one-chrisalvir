import type { CameraRealEntity } from "../types";

/** Presentation follows the entity type; unknown entities never imply motion. */
export function describeCameraControl(entity: CameraRealEntity) {
  const feeding =
    ["switch", "button"].includes(entity.domain) &&
    /aliment|feed|porcion|portion/i.test(`${entity.id} ${entity.name}`);
  if (feeding)
    return {
      icon: "🍽️",
      description: "Control de alimentación de Home Assistant.",
      stateLabel: entity.state ? "Activado" : "Desactivado",
    };
  if (
    entity.domain === "sensor" ||
    entity.domain === "number" ||
    entity.domain === "select"
  )
    return {
      icon: "ℹ️",
      description: `Lectura ${entity.domain} del proveedor (solo consulta).`,
      stateLabel: entity.rawState ?? "No verificado",
    };
  if (entity.domain === "button")
    return {
      icon: "🔘",
      description: "Acción de pulsación de Home Assistant.",
      stateLabel: "Botón",
    };
  if (entity.domain === "switch")
    return {
      icon: "🔘",
      description: "Interruptor de Home Assistant.",
      stateLabel: entity.state ? "Activado" : "Desactivado",
    };
  switch (entity.type) {
    case "light":
      return {
        icon: "💡",
        description: "Control de luz del proveedor.",
        stateLabel: entity.state ? "Encendida" : "Apagada",
      };
    case "siren":
      return {
        icon: "🚨",
        description: "Control de sirena del proveedor.",
        stateLabel: entity.state ? "Activada" : "Desactivada",
      };
    case "switch":
      return {
        icon: "🔘",
        description: "Interruptor de Home Assistant.",
        stateLabel: entity.state ? "Activado" : "Desactivado",
      };
    case "motion":
      return {
        icon: "🏃",
        description: "Estado de movimiento informado por el proveedor.",
        stateLabel: entity.state ? "Movimiento" : "En reposo",
      };
    case "doorbell":
      return {
        icon: "🔔",
        description: "Evento de timbre del proveedor.",
        stateLabel: entity.state ? "Activo" : "En reposo",
      };
    default:
      return {
        icon: "ℹ️",
        description: `Entidad ${entity.domain} del proveedor.`,
        stateLabel: entity.state ? "Activo" : "Inactivo",
      };
  }
}
