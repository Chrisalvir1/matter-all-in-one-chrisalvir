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
}

export class CameraSessionManager {
  private nextSessionId = 1;
  private nextStreamId = 1;
  private sessions = new Map<number, MatterActiveSession>();
  private maxConcurrentSessions = 2;

  public allocateSession(streamUsage = 1): MatterActiveSession {
    if (this.sessions.size >= this.maxConcurrentSessions) {
      // Clean up oldest inactive session if limit reached
      const oldest = Array.from(this.sessions.values()).sort(
        (a, b) => a.lastActivity - b.lastActivity,
      )[0];
      if (oldest) this.sessions.delete(oldest.sessionId);
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
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  public getSession(sessionId: number): MatterActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  public touchSession(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (session) session.lastActivity = Date.now();
  }

  public endSession(sessionId: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = "ended";
      this.sessions.delete(sessionId);
    }
  }

  public getActiveSessions(): MatterActiveSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.state === "active",
    );
  }
}
