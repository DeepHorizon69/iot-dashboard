"use strict";

import { SETTINGS } from "../config/settings.js";

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function safeJsonParse(text) {
  if (text == null) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function numericInput(input) {
  if (!input) return NaN;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : NaN;
}

export function formatValue(value, decimals = 0) {
  if (!isFiniteNumber(value)) return "-";
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

export function formatTime(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

export function formatDuration(seconds) {
  if (!isFiniteNumber(seconds) || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatUptime(ms) {
  if (!isFiniteNumber(ms) || ms < 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return [hours, mins, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export function sanitizeText(value, maxLength = 120) {
  const text = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizedSystemState(value) {
  const state = String(value ?? "").trim().toUpperCase();
  return SETTINGS.SYSTEM_STATES.includes(state) ? state : "NORMAL";
}

export function isValidSensorPayload(payload) {
  return payload && typeof payload === "object" && !Array.isArray(payload);
}

export function getNestedValue(obj, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);
}

export function readPayloadFlag(payload, keys) {
  for (const key of keys) {
    const value = key.includes(".") ? getNestedValue(payload, key) : payload[key];
    if (value === true || value === 1 || value === "1" || value === "true" || value === "FAULT") {
      return true;
    }
  }
  return false;
}

export function readPayloadNumber(payload, keys) {
  for (const key of keys) {
    const value = key.includes(".") ? getNestedValue(payload, key) : payload[key];
    if (isFiniteNumber(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeAverage(sum, count) {
  if (!count) return null;
  return sum / count;
}

export function debounce(fn, waitMs) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), waitMs);
  };
}

export function createRenderCache() {
  const cache = new Map();
  return {
    setText(node, value) {
      if (!node) return;
      const key = node.id || node;
      const next = String(value);
      if (cache.get(key) !== next) {
        if (typeof node === "string") return;
        node.textContent = next;
        cache.set(key, next);
      }
    },
    setAttr(node, attr, value) {
      if (!node) return;
      const key = `${node.id || "node"}:${attr}`;
      const next = String(value);
      if (cache.get(key) !== next) {
        node.setAttribute(attr, next);
        cache.set(key, next);
      }
    },
    setDataset(node, key, value) {
      if (!node) return;
      const cacheKey = `${node.id || "node"}:data-${key}`;
      const next = String(value);
      if (cache.get(cacheKey) !== next) {
        node.dataset[key] = next;
        cache.set(cacheKey, next);
      }
    },
    clear() {
      cache.clear();
    }
  };
}
