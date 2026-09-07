/** @format */

const rooms = new Map();
const HOST_TIMEOUT_MS = Number(process.env.BROADCAST_HOST_TIMEOUT_MS || 45000);

let endHandler = null;

export function setBroadcastEndHandler(handler) {
  endHandler = handler;
}

function getRoom(broadcastId) {
  const id = Number(broadcastId);
  if (!rooms.has(id)) {
    rooms.set(id, {
      clients: new Set(),
      listenerUsers: new Set(),
      hostTimers: new Map(),
      hostConnected: false,
      micOn: false,
    });
  }
  return rooms.get(id);
}

export function getMicOn(broadcastId) {
  return Boolean(rooms.get(Number(broadcastId))?.micOn);
}

export function setMicOn(broadcastId, micOn) {
  const room = getRoom(broadcastId);
  room.micOn = Boolean(micOn);
  broadcastEvent(broadcastId, { type: "mic_state", micOn: room.micOn });
}

export function addClient(broadcastId, ws, { userId, isHost }) {
  const room = getRoom(broadcastId);
  const client = { ws, userId: Number(userId), isHost: Boolean(isHost) };
  room.clients.add(client);

  if (client.isHost) {
    room.hostConnected = true;
    const timer = room.hostTimers.get(client.userId);
    if (timer) {
      clearTimeout(timer);
      room.hostTimers.delete(client.userId);
    }
  } else {
    room.listenerUsers.add(client.userId);
  }

  return client;
}

export function removeClient(broadcastId, client) {
  const id = Number(broadcastId);
  const room = rooms.get(id);
  if (!room || !client) return { listenerCount: 0, hostTimedOut: false };

  room.clients.delete(client);

  if (!client.isHost) {
    const stillListening = [...room.clients].some(
      (c) => !c.isHost && c.userId === client.userId
    );
    if (!stillListening) {
      room.listenerUsers.delete(client.userId);
    }
  } else {
    const hostStillHere = [...room.clients].some((c) => c.isHost);
    room.hostConnected = hostStillHere;
    if (!hostStillHere && endHandler) {
      const timer = setTimeout(() => {
        room.hostTimers.delete(client.userId);
        if (![...room.clients].some((c) => c.isHost)) {
          endHandler(id, "host_timeout");
        }
      }, HOST_TIMEOUT_MS);
      room.hostTimers.set(client.userId, timer);
    }
  }

  return {
    listenerCount: room.listenerUsers.size,
    hostTimedOut: false,
  };
}

export function listenerCount(broadcastId) {
  return rooms.get(Number(broadcastId))?.listenerUsers.size ?? 0;
}

export function broadcastEvent(broadcastId, payload) {
  const room = rooms.get(Number(broadcastId));
  if (!room) return;
  const data = JSON.stringify(payload);
  for (const client of room.clients) {
    if (client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
}

export function closeRoom(broadcastId, payload) {
  const id = Number(broadcastId);
  const room = rooms.get(id);
  if (!room) return;
  if (payload) {
    const data = JSON.stringify(payload);
    for (const client of room.clients) {
      if (client.ws.readyState === 1) {
        client.ws.send(data);
      }
      try {
        client.ws.close();
      } catch {
        /* ignore */
      }
    }
  }
  for (const timer of room.hostTimers.values()) {
    clearTimeout(timer);
  }
  rooms.delete(id);
}
