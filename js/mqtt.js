"use strict";

import { SETTINGS } from "../config/settings.js";
import { isValidSensorPayload, safeJsonParse, sanitizeText } from "./utils.js";
import { applyConfigAck } from "./config.js";
import { getConfiguredNamespace, getTopics } from "./topics.js";
import {
  logInvalidPayload,
  renderSensorPayload,
  setEspOnline,
  setMqttConnectionStatus,
  updateHealthCard,
  updateSystemState
} from "./dashboard.js";
import { showToast } from "./ui.js";

let client = null;
let connecting = false;
let subscribed = false;
let reconnectAttempts = 0;
let reconnectTimer = 0;
let healthTimer = 0;
let connectTimer = 0;
let pendingSensorFrame = 0;
let queuedSensorPayload = null;
let activeTopics = getTopics();

const runtime = {
  status: "",
  lastBrokerPacketAt: 0,
  lastSensorAt: 0,
  packetCount: 0,
  espOnline: false
};

let messageHandlers = {
  onConnected: null,
  onDisconnected: null
};

export function initMqtt(handlers = {}) {
  messageHandlers = { ...messageHandlers, ...handlers };
  startHealthMonitor();
  connectMqtt();
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("dashboard:namespace-changed", handleNamespaceChange);
  window.addEventListener("beforeunload", destroyMqtt);
}

function updateRuntimeStatus(status) {
  runtime.status = status;
  setMqttConnectionStatus(status);
  updateHealthCard(getHealthMeta());
}

function getHealthMeta() {
  return {
    mqttStatus: runtime.status,
    espOnline: runtime.espOnline,
    lastPacketAt: runtime.lastSensorAt || runtime.lastBrokerPacketAt,
    packetCount: runtime.packetCount
  };
}

function touchBrokerActivity() {
  runtime.lastBrokerPacketAt = Date.now();
  runtime.packetCount += 1;
  updateHealthCard(getHealthMeta());
}

function queueSensorRender(payload) {
  queuedSensorPayload = payload;
  if (pendingSensorFrame) return;
  pendingSensorFrame = requestAnimationFrame(() => {
    pendingSensorFrame = 0;
    if (!queuedSensorPayload) return;
    const payload = queuedSensorPayload;
    queuedSensorPayload = null;
    runtime.lastSensorAt = Date.now();
    runtime.espOnline = true;
    setEspOnline(true);
    renderSensorPayload(payload, getHealthMeta());
  });
}

function handleDataTopic(text) {
  const payload = safeJsonParse(text);
  if (!isValidSensorPayload(payload)) {
    logInvalidPayload(activeTopics.DATA);
    return;
  }
  queueSensorRender(payload);
}

function handleStateTopic(text) {
  const state = sanitizeText(text, 32).toUpperCase();
  if (!SETTINGS.SYSTEM_STATES.includes(state)) {
    logInvalidPayload(activeTopics.STATE);
    return;
  }
  updateSystemState(state);
  updateHealthCard(getHealthMeta());
}

function handleConfigAckTopic(text) {
  const payload = safeJsonParse(text);
  if (!payload) {
    logInvalidPayload(activeTopics.CONFIG_ACK);
    return;
  }
  applyConfigAck(payload);
}

function subscribeTopics(activeClient) {
  if (subscribed) return;
  activeClient.subscribe(
    [activeTopics.DATA, activeTopics.STATE, activeTopics.CONFIG_ACK],
    { qos: 0 },
    (error) => {
      if (error) {
        subscribed = false;
        showToast("Subscription failed - reconnecting", "warning");
        scheduleReconnect();
        return;
      }
      subscribed = true;
    }
  );
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }
}

function clearConnectTimer() {
  if (connectTimer) {
    window.clearTimeout(connectTimer);
    connectTimer = 0;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || connecting) return;
  const delay = Math.min(
    SETTINGS.RECONNECT_BASE_MS * (2 ** reconnectAttempts),
    SETTINGS.RECONNECT_MAX_MS
  );
  reconnectAttempts += 1;
  updateRuntimeStatus(SETTINGS.MQTT_STATUS.RECONNECTING);
  showToast("MQTT reconnecting", "warning");
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    connectMqtt();
  }, delay);
}

function failConnection(activeClient, message) {
  if (client !== activeClient) return;
  clearConnectTimer();
  client = null;
  connecting = false;
  subscribed = false;
  runtime.espOnline = false;
  setEspOnline(false);
  updateRuntimeStatus(SETTINGS.MQTT_STATUS.DISCONNECTED);
  showToast(message, "danger");
  messageHandlers.onDisconnected?.();
  scheduleReconnect();
}

function disconnectClient() {
  subscribed = false;
  clearConnectTimer();
  if (!client) return;
  const currentClient = client;
  client = null;
  currentClient.removeAllListeners();
  if (currentClient.connected || currentClient.reconnecting) {
    currentClient.end(true);
  }
}

function connectMqtt() {
  if (connecting) return;
  activeTopics = getTopics();
  const mqttLibrary = globalThis.mqtt;
  if (!mqttLibrary?.connect) {
    showToast("MQTT library failed to load", "danger");
    updateRuntimeStatus(SETTINGS.MQTT_STATUS.DISCONNECTED);
    return;
  }

  connecting = true;
  clearReconnectTimer();
  clearConnectTimer();
  disconnectClient();
  updateRuntimeStatus(reconnectAttempts > 0 ? SETTINGS.MQTT_STATUS.RECONNECTING : SETTINGS.MQTT_STATUS.CONNECTING);

  const namespace = getConfiguredNamespace();
  const clientId = `${namespace}-web-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
  const nextClient = mqttLibrary.connect(SETTINGS.BROKER_URL, {
    clientId,
    clean: true,
    connectTimeout: SETTINGS.CONNECT_TIMEOUT_MS,
    keepalive: SETTINGS.KEEPALIVE_SEC,
    reconnectPeriod: 0
  });

  client = nextClient;
  connectTimer = window.setTimeout(() => {
    failConnection(nextClient, "MQTT connection timed out");
    nextClient.end(true);
  }, SETTINGS.CONNECT_TIMEOUT_MS + 1000);

  nextClient.on("connect", () => {
    clearConnectTimer();
    connecting = false;
    reconnectAttempts = 0;
    touchBrokerActivity();
    updateRuntimeStatus(SETTINGS.MQTT_STATUS.CONNECTED);
    showToast("MQTT connected", "success");
    subscribeTopics(nextClient);
    messageHandlers.onConnected?.();
  });

  nextClient.on("message", (topic, message) => {
    if (client !== nextClient) return;
    touchBrokerActivity();
    const text = message.toString();

    if (topic === activeTopics.DATA) {
      handleDataTopic(text);
      return;
    }
    if (topic === activeTopics.STATE) {
      handleStateTopic(text);
      return;
    }
    if (topic === activeTopics.CONFIG_ACK) {
      handleConfigAckTopic(text);
    }
  });

  nextClient.on("packetreceive", () => {
    if (client !== nextClient) return;
    runtime.lastBrokerPacketAt = Date.now();
  });

  nextClient.on("close", () => {
    if (client !== nextClient) return;
    clearConnectTimer();
    connecting = false;
    subscribed = false;
    runtime.espOnline = false;
    setEspOnline(false);
    updateRuntimeStatus(SETTINGS.MQTT_STATUS.DISCONNECTED);
    showToast("MQTT disconnected", "danger");
    messageHandlers.onDisconnected?.();
    scheduleReconnect();
  });

  nextClient.on("offline", () => {
    if (client !== nextClient) return;
    updateRuntimeStatus(SETTINGS.MQTT_STATUS.DISCONNECTED);
    runtime.espOnline = false;
    setEspOnline(false);
  });

  nextClient.on("error", (error) => {
    if (client !== nextClient) return;
    const detail = error?.message ? `: ${sanitizeText(error.message, 80)}` : "";
    failConnection(nextClient, `MQTT connection failed${detail}`);
    nextClient.end(true);
  });
}

function startHealthMonitor() {
  if (healthTimer) return;
  healthTimer = window.setInterval(() => {
    if (!client?.connected) return;
    const now = Date.now();

    if (runtime.lastSensorAt && now - runtime.lastSensorAt > SETTINGS.STALE_SENSOR_MS) {
      if (runtime.espOnline) {
        runtime.espOnline = false;
        setEspOnline(false);
      }
    }

    if (now - runtime.lastBrokerPacketAt > SETTINGS.STALE_BROKER_MS) {
      showToast("Broker watchdog triggered reconnect", "warning");
      client.end(true);
    }

    updateHealthCard(getHealthMeta());
  }, SETTINGS.HEALTH_INTERVAL_MS);
}

function handleVisibilityChange() {
  if (document.visibilityState !== "visible") return;
  if ((!client || !client.connected) && !reconnectTimer && !connecting) {
    scheduleReconnect();
  }
}

function handleNamespaceChange() {
  activeTopics = getTopics();
  reconnectAttempts = 0;
  disconnectClient();
  connecting = false;
  subscribed = false;
  runtime.espOnline = false;
  setEspOnline(false);
  updateRuntimeStatus(SETTINGS.MQTT_STATUS.CONNECTING);
  connectMqtt();
}

export function publishConfig(config) {
  return new Promise((resolve, reject) => {
    if (!client?.connected) {
      reject(new Error("MQTT disconnected"));
      return;
    }
    client.publish(
      activeTopics.CONFIG,
      JSON.stringify(config),
      { qos: 0, retain: false },
      (error) => {
        if (error) {
          reject(new Error("MQTT publish failed"));
          return;
        }
        resolve();
      }
    );
  });
}

export function destroyMqtt() {
  clearReconnectTimer();
  clearConnectTimer();
  if (healthTimer) {
    window.clearInterval(healthTimer);
    healthTimer = 0;
  }
  if (pendingSensorFrame) {
    cancelAnimationFrame(pendingSensorFrame);
    pendingSensorFrame = 0;
  }
  disconnectClient();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("dashboard:namespace-changed", handleNamespaceChange);
  window.removeEventListener("beforeunload", destroyMqtt);
}

export function getMqttRuntime() {
  return { ...runtime, connected: Boolean(client?.connected) };
}
