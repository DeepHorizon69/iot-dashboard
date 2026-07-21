"use strict";

import {
  formatTopicsForClipboard,
  generateRandomNamespace,
  getConfiguredNamespace,
  getTopics,
  isValidNamespace,
  setProjectNamespace
} from "./topics.js";
import { showToast } from "./ui.js";

let elements = null;
let currentNamespace = "";

export function initProjectSettings(refs) {
  elements = refs;
  currentNamespace = getConfiguredNamespace();
  renderProjectSettings();

  elements.projectNamespace?.addEventListener("input", handleNamespaceInput);
  elements.saveNamespace?.addEventListener("click", handleNamespaceSave);
  elements.generateNamespace?.addEventListener("click", handleGenerateNamespace);
  elements.copyTopics?.addEventListener("click", handleCopyTopics);
}

function handleNamespaceInput() {
  const namespace = elements.projectNamespace.value.trim();
  const isValid = namespace === "" || isValidNamespace(namespace);
  setNamespaceError(isValid ? "" : "Use only letters, numbers, hyphens, and underscores.");
}

function handleNamespaceSave() {
  const namespace = elements.projectNamespace.value.trim();
  if (namespace && !isValidNamespace(namespace)) {
    setNamespaceError("Use only letters, numbers, hyphens, and underscores.");
    showToast("Invalid namespace", "danger");
    return;
  }

  try {
    const nextNamespace = setProjectNamespace(namespace);
    applyNamespaceChange(nextNamespace);
    showToast("MQTT namespace saved", "success");
  } catch (error) {
    setNamespaceError(error?.message || "Unable to save namespace.");
    showToast(error?.message || "Unable to save namespace", "danger");
  }
}

function handleGenerateNamespace() {
  elements.projectNamespace.value = generateRandomNamespace();
  handleNamespaceSave();
}

async function handleCopyTopics() {
  const topicsText = formatTopicsForClipboard(getTopics());
  try {
    await navigator.clipboard.writeText(topicsText);
    showToast("MQTT topics copied", "success");
  } catch {
    fallbackCopyText(topicsText);
  }
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  showToast(copied ? "MQTT topics copied" : "Copy failed", copied ? "success" : "danger");
}

function applyNamespaceChange(nextNamespace) {
  const previousNamespace = currentNamespace;
  currentNamespace = nextNamespace;
  renderProjectSettings();
  if (previousNamespace !== nextNamespace) {
    window.dispatchEvent(new CustomEvent("dashboard:namespace-changed", {
      detail: {
        namespace: nextNamespace,
        topics: getTopics(nextNamespace)
      }
    }));
  }
}

function renderProjectSettings() {
  const namespace = getConfiguredNamespace();
  const topics = getTopics(namespace);

  if (elements.projectNamespace) elements.projectNamespace.value = namespace;
  setText(elements.currentNamespace, namespace);
  setText(elements.topicData, topics.DATA);
  setText(elements.topicState, topics.STATE);
  setText(elements.topicConfig, topics.CONFIG);
  setText(elements.topicConfigAck, topics.CONFIG_ACK);
  setNamespaceError("");
}

function setNamespaceError(message) {
  if (!elements.namespaceError) return;
  elements.namespaceError.textContent = message;
}

function setText(node, value) {
  if (!node) return;
  node.textContent = value;
}
