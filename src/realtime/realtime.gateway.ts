import { Injectable } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import * as jwt from 'jsonwebtoken';
import type WebSocket from 'ws';
import { JWT_SECRET } from '../auth/jwt-secret';

interface AuthedSocket extends WebSocket {
  memberId?: string;
}

// The one shared WebSocket transport for every live-update path in the app — 1:1 messaging
// (type: 'message') and every domain notification (type: 'notification'). Each authenticated
// connection is tracked by memberId so any service can push straight to a member instead of
// them having to poll. Auth reuses the same JWT the REST API already trusts, read off the
// upgrade request (header, or ?token= for clients — like a browser — that can't set headers on
// a WebSocket handshake).
@Injectable()
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private sockets = new Map<string, Set<AuthedSocket>>();

  handleConnection(client: AuthedSocket, request: IncomingMessage) {
    const authHeader = request.headers['authorization'];
    const headerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const queryToken = new URL(request.url || '/', 'http://internal').searchParams.get('token');
    const token = headerToken || queryToken;
    if (!token) { client.close(4001, 'missing token'); return; }
    try {
      const payload: any = jwt.verify(token, JWT_SECRET);
      const memberId = payload.sub || payload.id;
      if (!memberId) throw new Error('token has no subject');
      client.memberId = memberId;
      if (!this.sockets.has(memberId)) this.sockets.set(memberId, new Set());
      this.sockets.get(memberId)!.add(client);
    } catch {
      client.close(4001, 'invalid token');
    }
  }

  handleDisconnect(client: AuthedSocket) {
    if (!client.memberId) return;
    const set = this.sockets.get(client.memberId);
    set?.delete(client);
    if (set && set.size === 0) this.sockets.delete(client.memberId);
  }

  sendToMember(memberId: string, payload: unknown) {
    const set = this.sockets.get(memberId);
    if (!set || set.size === 0) return;
    const data = JSON.stringify(payload);
    for (const sock of set) {
      if (sock.readyState === sock.OPEN) sock.send(data);
    }
  }
}
