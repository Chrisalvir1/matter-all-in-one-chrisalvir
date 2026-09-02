import type { ChildProcess } from "node:child_process";
import type { Socket } from "node:dgram";
import type { RTCPeerConnection } from "werift";

export interface SessionMetrics {
  videoPackets: number;
  audioPackets: number;
  iceConnectionState: string;
  bytesReceived?: number;
  lastPacketAt?: number;
}

export interface MatterActiveSession {
  sessionId: number;
  streamUsage: number;
  videoStreamId?: number;
  audioStreamId?: number;
  createdAt: number;
  lastActivity: number;
  offerSdp?: string;
  answerSdp?: string;
  iceCandidates: any[];
  state: "active" | "ended";
  remoteEndpointId?: number;

  // Real resources managed per active WebRTC session
  peerConnection?: RTCPeerConnection;
  ffmpegProcess?: ChildProcess;
  videoSocket?: Socket;
  audioSocket?: Socket;
  videoPort?: number;
  audioPort?: number;
  inactivityTimer?: NodeJS.Timeout;

  metrics: SessionMetrics;
}

export class CameraSessionManager {
  private nextSessionId = 1;
  private nextStreamId = 1;
  private sessions = new Map<number, MatterActiveSession>();
  private maxConcurrentSessions = 2;
  private inactivityTimeoutMs = 30000; // 30 seconds

  public allocateSession(
    streamUsage = 3,
    remoteEndpointId?: number,
  ): MatterActiveSession {
    if (this.sessions.size >= this.maxConcurrentSessions) {
      // Clean up oldest inactive session if limit reached
      const oldest = Array.from(this.sessions.values()).sort(
        (a, b) => a.lastActivity - b.lastActivity,
      )[0];
      if (oldest) {
        void this.cleanupSession(oldest.sessionId);
      }
    }

    const sessionId = this.nextSessionId++;
    const videoStreamId = this.nextStreamId++;

    const session: MatterActiveSession = {
      sessionId,
      streamUsage,
      videoStreamId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      iceCandidates: [],
      state: "active",
      remoteEndpointId,
      metrics: {
        videoPackets: 0,
        audioPackets: 0,
        iceConnectionState: "new",
      },
    };

    this.sessions.set(sessionId, session);
    this.resetInactivityTimer(sessionId);
    return session;
  }

  public getSession(sessionId: number): MatterActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  public touchSession(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (session && session.state === "active") {
      session.lastActivity = Date.now();
      this.resetInactivityTimer(sessionId);
    }
  }

  public resetInactivityTimer(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.inactivityTimer) {
      clearTimeout(session.inactivityTimer);
      session.inactivityTimer = undefined;
    }

    session.inactivityTimer = setTimeout(() => {
      void this.cleanupSession(sessionId);
    }, this.inactivityTimeoutMs);
  }

  public async cleanupSession(sessionId: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = "ended";
    this.sessions.delete(sessionId);

    if (session.inactivityTimer) {
      clearTimeout(session.inactivityTimer);
      session.inactivityTimer = undefined;
    }

    // 1. Terminate FFmpeg process safely
    if (session.ffmpegProcess) {
      try {
        session.ffmpegProcess.kill("SIGTERM");
        const proc = session.ffmpegProcess;
        setTimeout(() => {
          try {
            if (proc.exitCode === null && !proc.killed) {
              proc.kill("SIGKILL");
            }
          } catch {}
        }, 300);
      } catch {}
      session.ffmpegProcess = undefined;
    }

    // 2. Close local UDP sockets
    if (session.videoSocket) {
      try {
        session.videoSocket.close();
      } catch {}
      session.videoSocket = undefined;
    }

    if (session.audioSocket) {
      try {
        session.audioSocket.close();
      } catch {}
      session.audioSocket = undefined;
    }

    // 3. Close WebRTC PeerConnection
    if (session.peerConnection) {
      try {
        await session.peerConnection.close();
      } catch {}
      session.peerConnection = undefined;
    }
  }

  public async cleanupAllSessions(): Promise<void> {
    const activeIds = Array.from(this.sessions.keys());
    await Promise.all(activeIds.map((id) => this.cleanupSession(id)));
  }

  public endSession(sessionId: number): void {
    void this.cleanupSession(sessionId);
  }

  public getActiveSessions(): MatterActiveSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.state === "active",
    );
  }
}
