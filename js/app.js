"use strict";

import { applyDefaultConfigToForm, initConfig } from "./config.js";
import { initCharts } from "./charts.js";
import {
  destroyDashboard,
  initDashboard,
  logConfigurationUpdated
} from "./dashboard.js";
import { destroyMqtt, initMqtt, publishConfig } from "./mqtt.js";
import { applyInitialTheme, initUI } from "./ui.js";
import { initProjectSettings } from "./settings-ui.js";

const elements = {
  mqttStatus: document.getElementById("mqttStatus"),
  mqttStatusText: document.getElementById("mqttStatusText"),
  espStatus: document.getElementById("espStatus"),
  espStatusText: document.getElementById("espStatusText"),
  themeToggle: document.getElementById("themeToggle"),
  themeText: document.getElementById("themeText"),
  lastUpdate: document.getElementById("lastUpdate"),
  mq2Value: document.getElementById("mq2Value"),
  mq4Value: document.getElementById("mq4Value"),
  mq135Value: document.getElementById("mq135Value"),
  tempValue: document.getElementById("tempValue"),
  humValue: document.getElementById("humValue"),
  mq2State: document.getElementById("mq2State"),
  mq4State: document.getElementById("mq4State"),
  mq135State: document.getElementById("mq135State"),
  tempState: document.getElementById("tempState"),
  humState: document.getElementById("humState"),
  mq2Current: document.getElementById("mq2Current"),
  mq2Min: document.getElementById("mq2Min"),
  mq2Max: document.getElementById("mq2Max"),
  mq2Avg: document.getElementById("mq2Avg"),
  mq4Current: document.getElementById("mq4Current"),
  mq4Min: document.getElementById("mq4Min"),
  mq4Max: document.getElementById("mq4Max"),
  mq4Avg: document.getElementById("mq4Avg"),
  mq135Current: document.getElementById("mq135Current"),
  mq135Min: document.getElementById("mq135Min"),
  mq135Max: document.getElementById("mq135Max"),
  mq135Avg: document.getElementById("mq135Avg"),
  tempCurrent: document.getElementById("tempCurrent"),
  tempMin: document.getElementById("tempMin"),
  tempMax: document.getElementById("tempMax"),
  tempAvg: document.getElementById("tempAvg"),
  humCurrent: document.getElementById("humCurrent"),
  humMin: document.getElementById("humMin"),
  humMax: document.getElementById("humMax"),
  humAvg: document.getElementById("humAvg"),
  statePanel: document.getElementById("statePanel"),
  systemState: document.getElementById("systemState"),
  heatingPanel: document.getElementById("heatingPanel"),
  heatingStatus: document.getElementById("heatingStatus"),
  heatingCountdown: document.getElementById("heatingCountdown"),
  heatingProgressFill: document.getElementById("heatingProgressFill"),
  healthCard: document.getElementById("healthCard"),
  healthMqtt: document.getElementById("healthMqtt"),
  healthEsp: document.getElementById("healthEsp"),
  healthLastPacket: document.getElementById("healthLastPacket"),
  healthPacketCount: document.getElementById("healthPacketCount"),
  healthUptime: document.getElementById("healthUptime"),
  healthScore: document.getElementById("healthScore"),
  healthScoreBar: document.getElementById("healthScoreBar"),
  eventLog: document.getElementById("eventLog"),
  configForm: document.getElementById("configForm"),
  validationErrors: document.getElementById("validationErrors"),
  projectNamespace: document.getElementById("projectNamespace"),
  saveNamespace: document.getElementById("saveNamespace"),
  generateNamespace: document.getElementById("generateNamespace"),
  copyTopics: document.getElementById("copyTopics"),
  namespaceError: document.getElementById("namespaceError"),
  currentNamespace: document.getElementById("currentNamespace"),
  topicData: document.getElementById("topicData"),
  topicState: document.getElementById("topicState"),
  topicConfig: document.getElementById("topicConfig"),
  topicConfigAck: document.getElementById("topicConfigAck"),
  toastStack: document.getElementById("toastStack"),
  cfgMq2Enabled: document.getElementById("cfgMq2Enabled"),
  cfgMq4Enabled: document.getElementById("cfgMq4Enabled"),
  cfgMq135Enabled: document.getElementById("cfgMq135Enabled"),
  cfgDhtEnabled: document.getElementById("cfgDhtEnabled"),
  cfgBuzzerEnabled: document.getElementById("cfgBuzzerEnabled"),
  cfgMq2On: document.getElementById("cfgMq2On"),
  cfgMq2Off: document.getElementById("cfgMq2Off"),
  cfgMq4On: document.getElementById("cfgMq4On"),
  cfgMq4Off: document.getElementById("cfgMq4Off"),
  cfgMq135On: document.getElementById("cfgMq135On"),
  cfgMq135Off: document.getElementById("cfgMq135Off"),
  cfgTempWarn: document.getElementById("cfgTempWarn")
};

function boot() {
  applyInitialTheme();
  initUI(elements);
  initCharts();
  initDashboard(elements, () => {});
  initConfig(elements, {
    publish: publishConfig,
    onApplied: logConfigurationUpdated
  });
  initProjectSettings(elements);
  applyDefaultConfigToForm();
  initMqtt();
}

function teardown() {
  destroyMqtt();
  destroyDashboard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

window.addEventListener("pagehide", teardown, { once: true });

export { elements, boot, teardown };
