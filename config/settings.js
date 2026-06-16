"use strict";

export const MQTT_CONFIG = {
  BROKER_URL: "wss://broker.emqx.io:8084/mqtt",
  PROJECT_NAMESPACE: "alsa"
};

export const SETTINGS = {
  BROKER_URL: MQTT_CONFIG.BROKER_URL,
  PROJECT_NAMESPACE_STORAGE_KEY: "iot-dashboard-project-namespace",
  SYSTEM_STATES: ["NORMAL", "HEATING", "WARNING", "DANGER"],
  SENSOR_KEYS: ["mq2", "mq4", "mq135", "temp", "hum"],
  GAS_SENSORS: ["mq2", "mq4", "mq135"],
  CHART_KEYS: ["mq2", "mq4", "mq135", "temp", "hum"],
  CHART_LABELS: {
    mq2: "MQ2",
    mq4: "MQ4",
    mq135: "MQ135",
    temp: "Temperature",
    hum: "Humidity"
  },
  CHART_COLORS: {
    mq2: "#06b6d4",
    mq4: "#22c55e",
    mq135: "#a78bfa",
    temp: "#facc15",
    hum: "#ef4444"
  },
  MAX_CHART_POINTS: 100,
  MAX_EVENT_LOG: 200,
  RECONNECT_BASE_MS: 1000,
  RECONNECT_MAX_MS: 30000,
  HEALTH_INTERVAL_MS: 5000,
  STALE_BROKER_MS: 30000,
  STALE_SENSOR_MS: 15000,
  FRESH_DATA_MS: 5000,
  CONNECT_TIMEOUT_MS: 8000,
  KEEPALIVE_SEC: 20,
  THEME_STORAGE_KEY: "iot-dashboard-theme",
  DEFAULT_THRESHOLDS: {
    mq2: { enabled: true, on: 2500, off: 1800 },
    mq4: { enabled: true, on: 2500, off: 1800 },
    mq135: { enabled: true, on: 2500, off: 1800 },
    dht22: { enabled: true, tempWarn: 40 },
    buzzerEnabled: true
  },
  TEMP_DANGER_C: 50,
  SENSOR_STATUS: {
    ACTIVE: "ACTIVE",
    DISABLED: "DISABLED",
    FAULT: "FAULT"
  },
  MQTT_STATUS: {
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
    RECONNECTING: "RECONNECTING",
    DISCONNECTED: "DISCONNECTED"
  },
  FAULT_PAYLOAD_KEYS: {
    mq2: ["mq2Fault", "mq2_fault", "faults.mq2"],
    mq4: ["mq4Fault", "mq4_fault", "faults.mq4"],
    mq135: ["mq135Fault", "mq135_fault", "faults.mq135"],
    dht: ["dhtFault", "dht22Fault", "dht_fault", "faults.dht22", "faults.dht"]
  },
  HEATING_PAYLOAD_KEYS: {
    progress: ["heatingProgress", "heatProgress", "heatingPct"],
    remaining: ["heatingRemaining", "heatRemaining", "heatingSecondsLeft"],
    duration: ["heatingDuration", "heatDuration", "heatingTotal"]
  }
};

export default SETTINGS;
