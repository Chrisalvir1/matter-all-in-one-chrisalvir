import React from "react";
import type { CameraUiCameraItem } from "../types";
import { CameraConfigModal } from "./CameraConfigModal";

interface CameraUiPairingModalProps {
  camera: CameraUiCameraItem | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenGlobalSettings: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

/** Retained compatibility entry point; all camera pairing uses the same UI. */
export const CameraUiPairingModal: React.FC<CameraUiPairingModalProps> = (
  props,
) => (
  <CameraConfigModal
    camera={props.camera}
    onClose={props.onClose}
    onRefresh={props.onRefresh}
    showToast={props.showToast}
  />
);
