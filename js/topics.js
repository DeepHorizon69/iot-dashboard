"use strict";

import { MQTT_CONFIG, SETTINGS } from "../config/settings.js";

const TOPIC_SUFFIXES = {
  DATA: "data",
  STATE: "state",
  CONFIG: "config",
  CONFIG_ACK: "config/ack",
  CONFIGACK: "config/ack",
  ACK: "config/ack"
};

const NAMESPACE_PATTERN = /^[A-Za-z0-9_-]+$/;
const RANDOM_NAMESPACE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const LEGACY_NAMESPACE = "alsa";

export function isValidNamespace(namespace) {
  return NAMESPACE_PATTERN.test(String(namespace ?? ""));
}

export function normalizeNamespace(namespace) {
  return String(namespace ?? "").trim();
}

function readStoredNamespace() {
  try {
    return localStorage.getItem(SETTINGS.PROJECT_NAMESPACE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function getConfiguredNamespace() {
  const storedNamespace = normalizeNamespace(readStoredNamespace());
  if (storedNamespace) {
    if (isValidNamespace(storedNamespace)) return storedNamespace;
    clearStoredNamespace();
  }

  const configuredNamespace = normalizeNamespace(MQTT_CONFIG.PROJECT_NAMESPACE);
  return isValidNamespace(configuredNamespace) ? configuredNamespace : LEGACY_NAMESPACE;
}

export function setProjectNamespace(namespace) {
  const nextNamespace = normalizeNamespace(namespace);
  if (!nextNamespace) {
    clearStoredNamespace();
    return getConfiguredNamespace();
  }
  if (!isValidNamespace(nextNamespace)) {
    throw new Error("Namespace can only contain letters, numbers, hyphens, and underscores.");
  }
  try {
    localStorage.setItem(SETTINGS.PROJECT_NAMESPACE_STORAGE_KEY, nextNamespace);
  } catch {
    throw new Error("Unable to store namespace in this browser.");
  }
  return nextNamespace;
}

export function clearStoredNamespace() {
  try {
    localStorage.removeItem(SETTINGS.PROJECT_NAMESPACE_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function generateRandomNamespace(minLength = 8, maxLength = 16) {
  const min = Math.max(1, Math.floor(minLength));
  const max = Math.max(min, Math.floor(maxLength));
  const length = min + Math.floor(Math.random() * (max - min + 1));
  let namespace = "";
  for (let index = 0; index < length; index += 1) {
    namespace += RANDOM_NAMESPACE_CHARS[Math.floor(Math.random() * RANDOM_NAMESPACE_CHARS.length)];
  }
  return namespace;
}

export function buildTopic(type, namespace = getConfiguredNamespace()) {
  const key = String(type ?? "").trim().toUpperCase();
  const suffix = TOPIC_SUFFIXES[key];
  if (!suffix) throw new Error(`Unknown MQTT topic type: ${type}`);
  return `${namespace}/gas/${suffix}`;
}

export function getTopics(namespace = getConfiguredNamespace()) {
  return {
    DATA: buildTopic("DATA", namespace),
    STATE: buildTopic("STATE", namespace),
    CONFIG: buildTopic("CONFIG", namespace),
    CONFIG_ACK: buildTopic("CONFIG_ACK", namespace)
  };
}

export function formatTopicsForClipboard(topics = getTopics()) {
  return [
    `Namespace: ${getConfiguredNamespace()}`,
    `Data: ${topics.DATA}`,
    `State: ${topics.STATE}`,
    `Config: ${topics.CONFIG}`,
    `Config Ack: ${topics.CONFIG_ACK}`
  ].join("\n");
}
