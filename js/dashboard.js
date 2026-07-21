"use strict";

import { SETTINGS } from "../config/settings.js";
import {
  clamp,
  computeAverage,
  createRenderCache,
  formatDuration,
  formatTime,
  formatUptime,
  formatValue,
  isFiniteNumber,
  normalizedSystemState,
  readPayloadFlag,
  readPayloadNumber
} from "./utils.js";
import { appendEventLogEntry, pulseAlarm } from "./ui.js";
import { pushChartBatch } from "./charts.js";

const render = createRenderCache();

const stats = {
  mq2: createStatBucket(),
  mq4: createStatBucket(),
  mq135: createStatBucket(),
  temp: createStatBucket(),
  hum: createStatBucket()
};

let elements = null;
let onEvent = null;
let lastSystemState = "NORMAL";
let lastEspOnline = false;
let lastMqttStatus = "";
let appStartedAt = Date.now();
let heatingTimer = 0;
let heatingRemainingSec = null;
const thresholdLatch = {
  mq2Off: false,
  mq2On: false,
  mq4Off: false,
  mq4On: false,
  mq135Off: false,
  mq135On: false,
  tempWarn: false,
  tempDanger: false
};

function createStatBucket() {
  return { min: null, max: null, sum: 0, count: 0, current: null };
}

function resetStatBucket(bucket) {
  bucket.min = null;
  bucket.max = null;
  bucket.sum = 0;
  bucket.count = 0;
  bucket.current = null;
}

export function initDashboard(refs, eventCallback) {
  elements = refs;
  onEvent = eventCallback;
  appStartedAt = Date.now();
  updateHealthCard({
    mqttStatus: SETTINGS.MQTT_STATUS.CONNECTING,
    espOnline: false,
    lastPacketAt: 0,
    packetCount: 0
  });
  updateHeatingUI("NORMAL", {});
  logEvent("Dashboard initialized");
}

function logEvent(message) {
  appendEventLogEntry(elements.eventLog, message);
  onEvent?.(message);
}

function resolveSensorStatus(enabled, fault) {
  if (fault) return SETTINGS.SENSOR_STATUS.FAULT;
  if (enabled === false) return SETTINGS.SENSOR_STATUS.DISABLED;
  return SETTINGS.SENSOR_STATUS.ACTIVE;
}

function isSensorFault(payload, sensorKey) {
  if (sensorKey === "temp" || sensorKey === "hum") {
    return readPayloadFlag(payload, SETTINGS.FAULT_PAYLOAD_KEYS.dht);
  }
  return readPayloadFlag(payload, SETTINGS.FAULT_PAYLOAD_KEYS[sensorKey] || []);
}

function updateSensorStatusBadge(node, status) {
  if (!node) return;
  render.setText(node, status);
  node.classList.toggle("disabled", status === SETTINGS.SENSOR_STATUS.DISABLED);
  node.classList.toggle("fault", status === SETTINGS.SENSOR_STATUS.FAULT);
  node.classList.toggle("active", status === SETTINGS.SENSOR_STATUS.ACTIVE);
}

function updateStatBucket(bucket, value) {
  if (!isFiniteNumber(value)) return;
  bucket.current = value;
  bucket.min = bucket.min == null ? value : Math.min(bucket.min, value);
  bucket.max = bucket.max == null ? value : Math.max(bucket.max, value);
  bucket.sum += value;
  bucket.count += 1;
}

function renderStatRow(prefix, bucket, decimals = 0) {
  render.setText(elements[`${prefix}Current`], formatValue(bucket.current, decimals));
  render.setText(elements[`${prefix}Min`], formatValue(bucket.min, decimals));
  render.setText(elements[`${prefix}Max`], formatValue(bucket.max, decimals));
  render.setText(elements[`${prefix}Avg`], formatValue(computeAverage(bucket.sum, bucket.count), decimals));
}

function emitThresholdEvent(latchKey, active, message) {
  if (active && !thresholdLatch[latchKey]) {
    thresholdLatch[latchKey] = true;
    logEvent(message);
    return;
  }
  if (!active) thresholdLatch[latchKey] = false;
}

function checkThresholdEvents(payload) {
  const checks = [
    { key: "mq2", label: "MQ2", enabled: payload.mq2Enabled !== false, value: payload.mq2 },
    { key: "mq4", label: "MQ4", enabled: payload.mq4Enabled !== false, value: payload.mq4 },
    { key: "mq135", label: "MQ135", enabled: payload.mq135Enabled !== false, value: payload.mq135 }
  ];

  checks.forEach(({ key, label, enabled, value }) => {
    if (!enabled || !isFiniteNumber(value)) {
      emitThresholdEvent(`${key}Off`, false, "");
      emitThresholdEvent(`${key}On`, false, "");
      return;
    }
    const onThreshold = readPayloadNumber(payload, [`${key}On`, `${key}ThresholdOn`]);
    const offThreshold = readPayloadNumber(payload, [`${key}Off`, `${key}ThresholdOff`]);
    const off = offThreshold ?? SETTINGS.DEFAULT_THRESHOLDS[key]?.off;
    const on = onThreshold ?? SETTINGS.DEFAULT_THRESHOLDS[key]?.on;
    const onActive = isFiniteNumber(on) && value >= on;
    const offActive = !onActive && isFiniteNumber(off) && value >= off;
    emitThresholdEvent(`${key}On`, onActive, `${label} exceeded ON threshold (${formatValue(value)} ≥ ${formatValue(on)})`);
    emitThresholdEvent(`${key}Off`, offActive, `${label} exceeded OFF threshold (${formatValue(value)} ≥ ${formatValue(off)})`);
  });

  if (payload.dhtEnabled !== false && isFiniteNumber(payload.temp)) {
    const tempWarn = readPayloadNumber(payload, ["tempWarn", "dht22.tempWarn"]) ?? SETTINGS.DEFAULT_THRESHOLDS.dht22.tempWarn;
    const warnActive = isFiniteNumber(tempWarn) && payload.temp > tempWarn && payload.temp <= SETTINGS.TEMP_DANGER_C;
    const dangerActive = payload.temp > SETTINGS.TEMP_DANGER_C;
    emitThresholdEvent("tempWarn", warnActive, `Temperature exceeded warning threshold (${formatValue(payload.temp, 1)}°C > ${formatValue(tempWarn, 1)}°C)`);
    emitThresholdEvent("tempDanger", dangerActive, `Temperature exceeded danger threshold (${formatValue(payload.temp, 1)}°C > ${SETTINGS.TEMP_DANGER_C}°C)`);
  } else {
    emitThresholdEvent("tempWarn", false, "");
    emitThresholdEvent("tempDanger", false, "");
  }
}

function extractHeatingMeta(payload) {
  return {
    progress: readPayloadNumber(payload, SETTINGS.HEATING_PAYLOAD_KEYS.progress),
    remaining: readPayloadNumber(payload, SETTINGS.HEATING_PAYLOAD_KEYS.remaining),
    duration: readPayloadNumber(payload, SETTINGS.HEATING_PAYLOAD_KEYS.duration)
  };
}

function clearHeatingTimer() {
  if (heatingTimer) {
    window.clearInterval(heatingTimer);
    heatingTimer = 0;
  }
}

function updateHeatingUI(systemState, payload = {}) {
  const heating = systemState === "HEATING";
  if (elements.heatingPanel) elements.heatingPanel.hidden = !heating;

  if (!heating) {
    clearHeatingTimer();
    heatingRemainingSec = null;
    render.setText(elements.heatingStatus, "Idle");
    render.setText(elements.heatingCountdown, "--:--");
    if (elements.heatingProgressBar) elements.heatingProgressBar.style.width = "0%";
    if (elements.heatingProgressFill) elements.heatingProgressFill.style.width = "0%";
    return;
  }

  const meta = extractHeatingMeta(payload);
  render.setText(elements.heatingStatus, "Sensor warm-up in progress");

  if (isFiniteNumber(meta.remaining)) {
    heatingRemainingSec = Math.max(0, Math.floor(meta.remaining));
  } else if (heatingRemainingSec == null) {
    heatingRemainingSec = isFiniteNumber(meta.duration) ? Math.floor(meta.duration) : null;
  }

  const progress = isFiniteNumber(meta.progress)
    ? clamp(meta.progress, 0, 100)
    : isFiniteNumber(meta.duration) && isFiniteNumber(heatingRemainingSec)
      ? clamp(((meta.duration - heatingRemainingSec) / meta.duration) * 100, 0, 100)
      : null;

  if (elements.heatingProgressFill) {
    elements.heatingProgressFill.style.width = progress == null ? "35%" : `${progress}%`;
    elements.heatingProgressFill.classList.toggle("indeterminate", progress == null);
  }

  render.setText(elements.heatingCountdown, formatDuration(heatingRemainingSec));

  if (!heatingTimer && heatingRemainingSec != null) {
    heatingTimer = window.setInterval(() => {
      if (heatingRemainingSec == null) return;
      heatingRemainingSec = Math.max(0, heatingRemainingSec - 1);
      render.setText(elements.heatingCountdown, formatDuration(heatingRemainingSec));
      if (heatingRemainingSec === 0) clearHeatingTimer();
    }, 1000);
  }
}

export function renderSensorPayload(payload, meta = {}) {
  const mq2Enabled = payload.mq2Enabled !== false;
  const mq4Enabled = payload.mq4Enabled !== false;
  const mq135Enabled = payload.mq135Enabled !== false;
  const dhtEnabled = payload.dhtEnabled !== false;
  const timeLabel = formatTime();

  const mq2Fault = isSensorFault(payload, "mq2");
  const mq4Fault = isSensorFault(payload, "mq4");
  const mq135Fault = isSensorFault(payload, "mq135");
  const dhtFault = isSensorFault(payload, "dht");

  updateSensorStatusBadge(elements.mq2State, resolveSensorStatus(mq2Enabled, mq2Fault));
  updateSensorStatusBadge(elements.mq4State, resolveSensorStatus(mq4Enabled, mq4Fault));
  updateSensorStatusBadge(elements.mq135State, resolveSensorStatus(mq135Enabled, mq135Fault));
  updateSensorStatusBadge(elements.tempState, resolveSensorStatus(dhtEnabled, dhtFault));
  updateSensorStatusBadge(elements.humState, resolveSensorStatus(dhtEnabled, dhtFault));

  render.setText(elements.mq2Value, mq2Enabled && !mq2Fault ? formatValue(payload.mq2) : mq2Fault ? "FAULT" : "Disabled");
  render.setText(elements.mq4Value, mq4Enabled && !mq4Fault ? formatValue(payload.mq4) : mq4Fault ? "FAULT" : "Disabled");
  render.setText(elements.mq135Value, mq135Enabled && !mq135Fault ? formatValue(payload.mq135) : mq135Fault ? "FAULT" : "Disabled");
  render.setText(elements.tempValue, dhtEnabled && !dhtFault ? formatValue(payload.temp, 1) : dhtFault ? "FAULT" : "Disabled");
  render.setText(elements.humValue, dhtEnabled && !dhtFault ? formatValue(payload.hum, 1) : dhtFault ? "FAULT" : "Disabled");
  render.setText(elements.lastUpdate, timeLabel);

  if (mq2Enabled && !mq2Fault && isFiniteNumber(payload.mq2)) updateStatBucket(stats.mq2, payload.mq2);
  if (mq4Enabled && !mq4Fault && isFiniteNumber(payload.mq4)) updateStatBucket(stats.mq4, payload.mq4);
  if (mq135Enabled && !mq135Fault && isFiniteNumber(payload.mq135)) updateStatBucket(stats.mq135, payload.mq135);
  if (dhtEnabled && !dhtFault && isFiniteNumber(payload.temp)) updateStatBucket(stats.temp, payload.temp);
  if (dhtEnabled && !dhtFault && isFiniteNumber(payload.hum)) updateStatBucket(stats.hum, payload.hum);

  renderStatRow("mq2", stats.mq2);
  renderStatRow("mq4", stats.mq4);
  renderStatRow("mq135", stats.mq135);
  renderStatRow("temp", stats.temp, 1);
  renderStatRow("hum", stats.hum, 1);

  const nextState = normalizedSystemState(payload.state);
  updateSystemState(nextState, { fromPayload: true, payload });
  checkThresholdEvents(payload);

  pushChartBatch({
    mq2: mq2Enabled && !mq2Fault ? payload.mq2 : null,
    mq4: mq4Enabled && !mq4Fault ? payload.mq4 : null,
    mq135: mq135Enabled && !mq135Fault ? payload.mq135 : null,
    temp: dhtEnabled && !dhtFault ? payload.temp : null,
    hum: dhtEnabled && !dhtFault ? payload.hum : null
  }, timeLabel);

  updateHealthCard(meta);
}

export function updateSystemState(value, options = {}) {
  const next = normalizedSystemState(value);
  render.setDataset(elements.statePanel, "state", next);
  render.setText(elements.systemState, next);

  if (lastSystemState !== next) {
    logEvent(`State changed ${lastSystemState} → ${next}`);
    if (next === "WARNING" || next === "DANGER") pulseAlarm(elements.statePanel);
    lastSystemState = next;
  }

  updateHeatingUI(next, options.payload || {});
}

export function setMqttConnectionStatus(status) {
  if (lastMqttStatus === status) return;
  if (lastMqttStatus && status === SETTINGS.MQTT_STATUS.DISCONNECTED) {
    logEvent("MQTT broker disconnected");
  }
  if (status === SETTINGS.MQTT_STATUS.CONNECTED && lastMqttStatus !== SETTINGS.MQTT_STATUS.CONNECTED) {
    logEvent("MQTT broker connected");
  }
  lastMqttStatus = status;
  render.setDataset(elements.mqttStatus, "state", status);
  render.setText(elements.mqttStatusText, status);
}

export function setEspOnline(isOnline) {
  if (lastEspOnline === isOnline) return;
  if (lastEspOnline && !isOnline) logEvent("ESP32 disconnected");
  if (!lastEspOnline && isOnline) logEvent("ESP32 connected");
  lastEspOnline = isOnline;
  render.setDataset(elements.espStatus, "state", isOnline ? "CONNECTED" : "DISCONNECTED");
  render.setText(elements.espStatusText, isOnline ? "ESP32 ONLINE" : "ESP32 OFFLINE");
}

export function logConfigurationUpdated(source = "Configuration updated") {
  logEvent(source);
}

export function logInvalidPayload(topic) {
  logEvent(`Invalid payload ignored on ${topic}`);
}

export function computeHealthScore({ mqttConnected, espOnline, lastPacketAt, packetCount }) {
  let score = 0;
  if (mqttConnected) score += 40;
  if (espOnline) score += 30;
  if (lastPacketAt && Date.now() - lastPacketAt <= SETTINGS.FRESH_DATA_MS) score += 20;
  if (packetCount > 0) score += 10;
  return score;
}

export function updateHealthCard(meta = {}) {
  const mqttConnected = meta.mqttStatus === SETTINGS.MQTT_STATUS.CONNECTED;
  const espOnline = Boolean(meta.espOnline);
  const lastPacketAt = meta.lastPacketAt || 0;
  const packetCount = meta.packetCount || 0;
  const score = computeHealthScore({ mqttConnected, espOnline, lastPacketAt, packetCount });

  render.setText(elements.healthMqtt, meta.mqttStatus || lastMqttStatus || "-");
  render.setText(elements.healthEsp, espOnline ? "ONLINE" : "OFFLINE");
  render.setText(elements.healthLastPacket, lastPacketAt ? formatTime(new Date(lastPacketAt)) : "-");
  render.setText(elements.healthPacketCount, String(packetCount));
  render.setText(elements.healthUptime, formatUptime(Date.now() - appStartedAt));
  render.setText(elements.healthScore, `${score}%`);
  if (elements.healthScoreBar) elements.healthScoreBar.style.width = `${score}%`;
  elements.healthCard?.setAttribute("data-score", score >= 80 ? "good" : score >= 50 ? "warn" : "bad");
}

export function resetSensorStatistics() {
  Object.values(stats).forEach(resetStatBucket);
}

export function destroyDashboard() {
  clearHeatingTimer();
  render.clear();
}
