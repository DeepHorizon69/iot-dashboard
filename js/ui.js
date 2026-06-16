"use strict";

import { SETTINGS } from "../config/settings.js";
import { cssVar, escapeHtml, formatTime, sanitizeText } from "./utils.js";

let toastStack = null;
let themeToggle = null;
let themeText = null;
let modalRoot = null;
let modalResolve = null;

export function initUI(elements) {
  toastStack = elements.toastStack;
  themeToggle = elements.themeToggle;
  themeText = elements.themeText;
  ensureModalRoot();
  updateThemeControl(getTheme());
  themeToggle?.addEventListener("click", toggleTheme, { passive: true });
}

function ensureModalRoot() {
  if (modalRoot) return;
  modalRoot = document.createElement("div");
  modalRoot.className = "modal-root";
  modalRoot.hidden = true;
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="cancel"></div>
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-header">
        <h2 id="modalTitle">Confirm</h2>
      </div>
      <div class="modal-body" id="modalBody"></div>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-btn-secondary" data-action="cancel">Cancel</button>
        <button type="button" class="modal-btn modal-btn-primary" data-action="confirm">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalRoot);
  modalRoot.addEventListener("click", handleModalClick);
  document.addEventListener("keydown", handleModalKeydown);
}

function handleModalClick(event) {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action || !modalResolve) return;
  if (action === "cancel") closeModal(false);
  if (action === "confirm") closeModal(true);
}

function handleModalKeydown(event) {
  if (modalRoot?.hidden || !modalResolve) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal(false);
  }
}

function closeModal(result) {
  if (!modalResolve) return;
  modalRoot.hidden = true;
  const resolve = modalResolve;
  modalResolve = null;
  resolve(result);
}

export function confirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel" }) {
  ensureModalRoot();
  modalRoot.querySelector("#modalTitle").textContent = title;
  modalRoot.querySelector("#modalBody").innerHTML = message;
  modalRoot.querySelector('[data-action="confirm"]').textContent = confirmLabel;
  modalRoot.querySelector('[data-action="cancel"]').textContent = cancelLabel;
  modalRoot.hidden = false;
  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

export function showToast(message, type = "info") {
  if (!toastStack) return;
  const toast = document.createElement("div");
  toast.className = `toast ${sanitizeText(type, 16)}`;
  toast.textContent = sanitizeText(message, 240);
  toastStack.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("toast-out");
    window.setTimeout(() => toast.remove(), 220);
  }, 3600);
}

export function getTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function updateThemeControl(theme) {
  if (themeText) themeText.textContent = theme === "light" ? "Light" : "Dark";
  themeToggle?.setAttribute("aria-label", `Switch to ${theme === "light" ? "dark" : "light"} mode`);
}

export function setTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  try {
    localStorage.setItem(SETTINGS.THEME_STORAGE_KEY, nextTheme);
  } catch {
    /* storage unavailable */
  }
  updateThemeControl(nextTheme);
  window.dispatchEvent(new CustomEvent("dashboard:theme-changed", { detail: { theme: nextTheme } }));
}

export function toggleTheme() {
  setTheme(getTheme() === "light" ? "dark" : "light");
}

export function applyInitialTheme() {
  let savedTheme = "";
  try {
    savedTheme = localStorage.getItem(SETTINGS.THEME_STORAGE_KEY) || "";
  } catch {
    savedTheme = "";
  }
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = savedTheme || (prefersLight ? "light" : "dark");
}

export function renderValidationSummary(errors) {
  if (!errors.length) return "";
  return `<ul class="validation-summary">${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`;
}

export function highlightInvalidFields(fieldMap, invalidIds) {
  Object.entries(fieldMap).forEach(([id, wrapper]) => {
    wrapper?.classList.toggle("field-invalid", invalidIds.includes(id));
  });
}

export function clearFieldHighlights(fieldMap) {
  Object.values(fieldMap).forEach((wrapper) => wrapper?.classList.remove("field-invalid"));
}

export function pulseAlarm(element) {
  if (!element) return;
  element.classList.remove("alarm-pulse");
  void element.offsetWidth;
  element.classList.add("alarm-pulse");
}

export function appendEventLogEntry(container, message, timestamp = new Date()) {
  if (!container) return null;
  const entry = document.createElement("div");
  entry.className = "event-log-entry";
  entry.innerHTML = `<span class="event-log-time">[${escapeHtml(formatTime(timestamp))}]</span> ${escapeHtml(sanitizeText(message, 200))}`;
  container.prepend(entry);
  while (container.children.length > SETTINGS.MAX_EVENT_LOG) {
    container.lastElementChild?.remove();
  }
  return entry;
}

export function getChartThemeColors() {
  return {
    grid: cssVar("--chart-grid"),
    muted: cssVar("--muted"),
    tooltipBg: cssVar("--tooltip-bg"),
    tooltipText: cssVar("--tooltip-text"),
    border: cssVar("--border")
  };
}
