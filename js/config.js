"use strict";

import { SETTINGS } from "../config/settings.js";
import { isFiniteNumber, numericInput, sanitizeText } from "./utils.js";
import {
  clearFieldHighlights,
  confirmDialog,
  highlightInvalidFields,
  renderValidationSummary,
  showToast
} from "./ui.js";

let elements = null;
let fieldWrappers = null;
let publishConfig = null;
let onConfigApplied = null;

const FIELD_IDS = [
  "cfgMq2Enabled",
  "cfgMq4Enabled",
  "cfgMq135Enabled",
  "cfgDhtEnabled",
  "cfgBuzzerEnabled",
  "cfgMq2On",
  "cfgMq2Off",
  "cfgMq4On",
  "cfgMq4Off",
  "cfgMq135On",
  "cfgMq135Off",
  "cfgTempWarn"
];

export function initConfig(refs, { publish, onApplied }) {
  elements = refs;
  publishConfig = publish;
  onConfigApplied = onApplied;
  fieldWrappers = buildFieldWrappers();
  elements.configForm?.addEventListener("submit", handleConfigSubmit);
}

function buildFieldWrappers() {
  const map = {};
  FIELD_IDS.forEach((id) => {
    const input = elements[id];
    map[id] = input?.closest(".field, .switch-row") || input?.parentElement || null;
  });
  return map;
}

export function validateConfigPayload(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.mq2 &&
    payload.mq4 &&
    payload.mq135 &&
    payload.dht22 &&
    typeof payload.buzzerEnabled === "boolean";
}

export function buildConfigFromForm() {
  return {
    mq2: {
      enabled: elements.cfgMq2Enabled.checked,
      on: numericInput(elements.cfgMq2On),
      off: numericInput(elements.cfgMq2Off)
    },
    mq4: {
      enabled: elements.cfgMq4Enabled.checked,
      on: numericInput(elements.cfgMq4On),
      off: numericInput(elements.cfgMq4Off)
    },
    mq135: {
      enabled: elements.cfgMq135Enabled.checked,
      on: numericInput(elements.cfgMq135On),
      off: numericInput(elements.cfgMq135Off)
    },
    dht22: {
      enabled: elements.cfgDhtEnabled.checked,
      tempWarn: numericInput(elements.cfgTempWarn)
    },
    buzzerEnabled: elements.cfgBuzzerEnabled.checked
  };
}

export function validateConfig(config) {
  const errors = [];
  const invalidIds = [];

  const mark = (id, message) => {
    errors.push(message);
    invalidIds.push(id);
  };

  if (!Number.isFinite(config.mq2.on) || !Number.isFinite(config.mq2.off)) mark("cfgMq2On", "MQ2 thresholds must be valid numbers.");
  if (!Number.isFinite(config.mq4.on) || !Number.isFinite(config.mq4.off)) mark("cfgMq4On", "MQ4 thresholds must be valid numbers.");
  if (!Number.isFinite(config.mq135.on) || !Number.isFinite(config.mq135.off)) mark("cfgMq135On", "MQ135 thresholds must be valid numbers.");
  if (!Number.isFinite(config.dht22.tempWarn)) mark("cfgTempWarn", "Temperature warning threshold must be a valid number.");

  if (Number.isFinite(config.mq2.on) && Number.isFinite(config.mq2.off) && config.mq2.off >= config.mq2.on) {
    mark("cfgMq2Off", "MQ2 OFF must be lower than MQ2 ON.");
  }
  if (Number.isFinite(config.mq4.on) && Number.isFinite(config.mq4.off) && config.mq4.off >= config.mq4.on) {
    mark("cfgMq4Off", "MQ4 OFF must be lower than MQ4 ON.");
  }
  if (Number.isFinite(config.mq135.on) && Number.isFinite(config.mq135.off) && config.mq135.off >= config.mq135.on) {
    mark("cfgMq135Off", "MQ135 OFF must be lower than MQ135 ON.");
  }
  if (Number.isFinite(config.dht22.tempWarn) && config.dht22.tempWarn <= 0) {
    mark("cfgTempWarn", "Temperature warning threshold must be greater than 0.");
  }

  return { errors, invalidIds };
}

export function applyConfigAck(config) {
  if (!validateConfigPayload(config)) {
    showToast("Invalid configuration payload", "danger");
    return false;
  }

  elements.cfgMq2Enabled.checked = config.mq2.enabled === true;
  elements.cfgMq4Enabled.checked = config.mq4.enabled === true;
  elements.cfgMq135Enabled.checked = config.mq135.enabled === true;
  elements.cfgDhtEnabled.checked = config.dht22.enabled === true;
  elements.cfgBuzzerEnabled.checked = config.buzzerEnabled === true;

  if (isFiniteNumber(config.mq2.on)) elements.cfgMq2On.value = config.mq2.on;
  if (isFiniteNumber(config.mq2.off)) elements.cfgMq2Off.value = config.mq2.off;
  if (isFiniteNumber(config.mq4.on)) elements.cfgMq4On.value = config.mq4.on;
  if (isFiniteNumber(config.mq4.off)) elements.cfgMq4Off.value = config.mq4.off;
  if (isFiniteNumber(config.mq135.on)) elements.cfgMq135On.value = config.mq135.on;
  if (isFiniteNumber(config.mq135.off)) elements.cfgMq135Off.value = config.mq135.off;
  if (isFiniteNumber(config.dht22.tempWarn)) elements.cfgTempWarn.value = config.dht22.tempWarn;

  clearFieldHighlights(fieldWrappers);
  elements.validationErrors.textContent = "";
  onConfigApplied?.("Configuration received from device");
  showToast("Configuration received", "success");
  return true;
}

async function handleConfigSubmit(event) {
  event.preventDefault();
  const config = buildConfigFromForm();
  const { errors, invalidIds } = validateConfig(config);

  clearFieldHighlights(fieldWrappers);

  if (errors.length) {
    elements.validationErrors.innerHTML = renderValidationSummary(errors);
    highlightInvalidFields(fieldWrappers, invalidIds);
    showToast("Validation error", "danger");
    return;
  }

  elements.validationErrors.textContent = "";

  const confirmed = await confirmDialog({
    title: "Save Configuration",
    message: `<p>Send updated thresholds and sensor settings to the ESP32?</p><p class="modal-note">${sanitizeText(JSON.stringify(config), 500)}</p>`,
    confirmLabel: "Save Configuration",
    cancelLabel: "Cancel"
  });

  if (!confirmed) return;

  try {
    await publishConfig(config);
    onConfigApplied?.("Configuration updated and published");
    showToast("Configuration saved", "success");
  } catch (error) {
    showToast(error?.message || "MQTT disconnected", "danger");
  }
}

export function applyDefaultConfigToForm() {
  const defaults = SETTINGS.DEFAULT_THRESHOLDS;
  elements.cfgMq2Enabled.checked = defaults.mq2.enabled;
  elements.cfgMq4Enabled.checked = defaults.mq4.enabled;
  elements.cfgMq135Enabled.checked = defaults.mq135.enabled;
  elements.cfgDhtEnabled.checked = defaults.dht22.enabled;
  elements.cfgBuzzerEnabled.checked = defaults.buzzerEnabled;
  elements.cfgMq2On.value = defaults.mq2.on;
  elements.cfgMq2Off.value = defaults.mq2.off;
  elements.cfgMq4On.value = defaults.mq4.on;
  elements.cfgMq4Off.value = defaults.mq4.off;
  elements.cfgMq135On.value = defaults.mq135.on;
  elements.cfgMq135Off.value = defaults.mq135.off;
  elements.cfgTempWarn.value = defaults.dht22.tempWarn;
}
