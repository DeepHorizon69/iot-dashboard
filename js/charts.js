"use strict";

import { SETTINGS } from "../config/settings.js";
import { formatTime, isFiniteNumber } from "./utils.js";
import { getChartThemeColors } from "./ui.js";

const charts = {};
let pendingUpdate = false;

function buildChartOptions(label) {
  const colors = getChartThemeColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        borderColor: colors.border,
        borderWidth: 1,
        titleColor: colors.tooltipText,
        bodyColor: colors.tooltipText
      }
    },
    scales: {
      x: {
        grid: { color: colors.grid },
        ticks: { color: colors.muted, maxTicksLimit: 5 }
      },
      y: {
        grid: { color: colors.grid },
        ticks: { color: colors.muted },
        beginAtZero: true
      }
    }
  };
}

function createChart(canvasId, label, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return null;
  return new Chart(canvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label,
        data: [],
        borderColor: color,
        backgroundColor: `${color}22`,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.28,
        fill: true
      }]
    },
    options: buildChartOptions(label)
  });
}

export function initCharts() {
  SETTINGS.CHART_KEYS.forEach((key) => {
    charts[key] = createChart(
      `${key}Chart`,
      SETTINGS.CHART_LABELS[key],
      SETTINGS.CHART_COLORS[key]
    );
  });

  window.addEventListener("dashboard:theme-changed", applyChartTheme);
  return charts;
}

export function applyChartTheme() {
  const colors = getChartThemeColors();
  Object.values(charts).forEach((chart) => {
    if (!chart) return;
    chart.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
    chart.options.plugins.tooltip.borderColor = colors.border;
    chart.options.plugins.tooltip.titleColor = colors.tooltipText;
    chart.options.plugins.tooltip.bodyColor = colors.tooltipText;
    chart.options.scales.x.grid.color = colors.grid;
    chart.options.scales.x.ticks.color = colors.muted;
    chart.options.scales.y.grid.color = colors.grid;
    chart.options.scales.y.ticks.color = colors.muted;
    chart.update("none");
  });
}

function flushChartUpdates() {
  pendingUpdate = false;
  Object.values(charts).forEach((chart) => {
    if (chart) chart.update("none");
  });
}

function scheduleChartUpdate() {
  if (pendingUpdate) return;
  pendingUpdate = true;
  requestAnimationFrame(flushChartUpdates);
}

function pushPoint(chart, label, value) {
  if (!chart) return;
  const labels = chart.data.labels;
  const data = chart.data.datasets[0].data;
  labels.push(label);
  data.push(isFiniteNumber(value) ? value : null);
  if (labels.length > SETTINGS.MAX_CHART_POINTS) {
    labels.shift();
    data.shift();
  }
}

export function pushChartBatch(valuesByKey, timeLabel = formatTime()) {
  SETTINGS.CHART_KEYS.forEach((key) => {
    pushPoint(charts[key], timeLabel, valuesByKey[key]);
  });
  scheduleChartUpdate();
}

export function destroyCharts() {
  Object.values(charts).forEach((chart) => chart?.destroy());
  window.removeEventListener("dashboard:theme-changed", applyChartTheme);
}

export function getCharts() {
  return charts;
}
