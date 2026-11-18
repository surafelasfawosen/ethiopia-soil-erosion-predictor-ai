// Dashboard UI Renderers, Chart.js Visualizations, and AI Insight Generatives

// Clear telemetry card display
function resetTelemetryDisplay() {
    document.getElementById("telemetry-placeholder").classList.remove("hidden");
    document.getElementById("telemetry-content").classList.add("hidden");
}

// Update hover card details with environmental metrics
function updateTelemetryDisplay(idx) {
    const d = rawDataset[idx];
    const prob = predictions[idx];

    document.getElementById("telemetry-placeholder").classList.add("hidden");
    const content = document.getElementById("telemetry-content");
    content.classList.remove("hidden");

    // Location
    document.getElementById("card-woreda").textContent = d['Woreda'] || 'N/A';
    document.getElementById("card-coords").textContent = `${(parseFloat(d['Latitude']) || 0).toFixed(5)}°N, ${(parseFloat(d['Longitude']) || 0).toFixed(5)}°E`;

    // Risk score
    const riskPercent = (prob * 100).toFixed(1);
    const riskScore = document.getElementById("card-risk-score");
    riskScore.textContent = `${riskPercent}%`;

    if (prob > 0.71) {
        riskScore.style.color = "var(--alert-red)";
    } else if (prob > 0.25) {
        riskScore.style.color = "var(--alert-orange)";
    } else {
        riskScore.style.color = "var(--accent-mint)";
    }

    // Physical values & progress bars
    const slope = parseFloat(d['Slope (Degree)']) || 0;
    const elevation = parseInt(d['Elevation (m)']) || 0;
    const rain = parseInt(d['Rainfall (mm)']) || 0;
    const ndvi = parseFloat(d['NDVI_Value']) || 0;
    const kFactor = parseFloat(d['K_Factor']) || 0.2;
    const spi = parseFloat(d['SPI']) || 0;

    // Slope bar: max 45 deg, color orange/red if high
    document.getElementById("lbl-slope").textContent = `${slope.toFixed(1)}°`;
    const bSlope = document.getElementById("bar-slope");
    bSlope.style.width = `${Math.min(100, (slope / 45) * 100)}%`;
    bSlope.className = `progress-bar-fill ${slope > 20 ? 'bar-red' : (slope > 10 ? 'bar-orange' : 'bar-green')}`;

    // Elevation bar: max 4000m
    document.getElementById("lbl-elevation").textContent = `${elevation}m`;
    const bElev = document.getElementById("bar-elevation");
    bElev.style.width = `${Math.min(100, (elevation / 4000) * 100)}%`;
    bElev.className = "progress-bar-fill bar-green";

    // Rainfall bar: max 2000mm
    document.getElementById("lbl-rainfall").textContent = `${rain}mm`;
    const bRain = document.getElementById("bar-rainfall");
    bRain.style.width = `${Math.min(100, (rain / 2000) * 100)}%`;
    bRain.className = "progress-bar-fill bar-blue";

    // NDVI bar: range -0.2 to 1.0 (invert color: low NDVI is dangerous, high NDVI is safe)
    document.getElementById("lbl-ndvi").textContent = ndvi.toFixed(3);
    const bNdvi = document.getElementById("bar-ndvi");
    const ndviPercent = ((ndvi + 0.2) / 1.2) * 100;
    bNdvi.style.width = `${Math.max(0, Math.min(100, ndviPercent))}%`;
    bNdvi.className = `progress-bar-fill ${ndvi < 0.2 ? 'bar-red' : (ndvi < 0.35 ? 'bar-orange' : 'bar-green')}`;

    // K-Factor bar: max 0.6
    document.getElementById("lbl-kfactor").textContent = kFactor.toFixed(3);
    const bK = document.getElementById("bar-kfactor");
    bK.style.width = `${Math.min(100, (kFactor / 0.6) * 100)}%`;
    bK.className = `progress-bar-fill ${kFactor > 0.35 ? 'bar-red' : (kFactor > 0.25 ? 'bar-orange' : 'bar-green')}`;

    // SPI bar: max 0.015
    document.getElementById("lbl-spi").textContent = spi.toFixed(5);
    const bSpi = document.getElementById("bar-spi");
    bSpi.style.width = `${Math.min(100, (spi / 0.015) * 100)}%`;
    bSpi.className = "progress-bar-fill bar-blue";
}

// Generate statistical breakdowns, tables, and trigger chart renderers
function updateStatsAndCharts() {
    const N = filteredDataset.length;
    document.getElementById("scanned-points").textContent = N.toLocaleString();

    // Reset Hover telemetry block
    resetTelemetryDisplay();

    if (N === 0) {
        document.getElementById("avg-erodibility").textContent = "0.0%";
        document.getElementById("severe-points").textContent = "0";
        document.getElementById("woreda-breakdown-body").innerHTML = `
            <tr><td colspan="5" style="text-align:center; padding:1.5rem 0;">No matching points found for active filters</td></tr>
        `;
        renderCharts(0, 0, 0);
        renderEnvironmentalAverages(0, 0, 0, 0, 0, 0);
        return;
    }

    let sumProb = 0;
    let highRiskCount = 0;
    let modRiskCount = 0;
    let lowRiskCount = 0;

    const woredaStats = {};

    let safeCount = 0;
    let avgSlopeSafe = 0, avgRainSafe = 0, avgNdviSafe = 0;

    let severeCount = 0;
    let avgSlopeSevere = 0, avgRainSevere = 0, avgNdviSevere = 0;

    filteredDataset.forEach((row) => {
        const idx = row._rawIndex;
        const prob = predictions[idx];
        sumProb += prob;

        const slope = parseFloat(row['Slope (Degree)']) || 0;
        const rain = parseFloat(row['Rainfall (mm)']) || 0;
        const ndvi = parseFloat(row['NDVI_Value']) || 0;

        if (prob > 0.71) {
            highRiskCount++;
            avgSlopeSevere += slope;
            avgRainSevere += rain;
            avgNdviSevere += ndvi;
            severeCount++;
        } else if (prob > 0.25) {
            modRiskCount++;
        } else {
            lowRiskCount++;
            avgSlopeSafe += slope;
            avgRainSafe += rain;
            avgNdviSafe += ndvi;
            safeCount++;
        }

        const woreda = row['Woreda'] || 'Unknown Woreda';
        if (!woredaStats[woreda]) {
            woredaStats[woreda] = { low: 0, mod: 0, severe: 0, total: 0 };
        }
        woredaStats[woreda].total++;
        if (prob > 0.71) woredaStats[woreda].severe++;
        else if (prob > 0.25) woredaStats[woreda].mod++;
        else woredaStats[woreda].low++;
    });

    const avgRisk = sumProb / N;
    document.getElementById("avg-erodibility").textContent = `${(avgRisk * 100).toFixed(1)}%`;
    document.getElementById("severe-points").textContent = highRiskCount.toLocaleString();

    const tbody = document.getElementById("woreda-breakdown-body");
    tbody.innerHTML = "";
    Object.keys(woredaStats).forEach(w => {
        const stat = woredaStats[w];
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${w}</strong></td>
            <td>${stat.low.toLocaleString()}</td>
            <td>${stat.mod.toLocaleString()}</td>
            <td style="color:var(--alert-red);font-weight:bold">${stat.severe.toLocaleString()}</td>
            <td><strong>${stat.total.toLocaleString()}</strong></td>
        `;
        tbody.appendChild(row);
    });

    if (safeCount > 0) {
        avgSlopeSafe /= safeCount;
        avgRainSafe /= safeCount;
        avgNdviSafe /= safeCount;
    }
    if (severeCount > 0) {
        avgSlopeSevere /= severeCount;
        avgRainSevere /= severeCount;
        avgNdviSevere /= severeCount;
    }

    generateAIInsights(avgRisk, highRiskCount, N, avgSlopeSevere, avgRainSevere, avgNdviSevere);
    renderCharts(lowRiskCount, modRiskCount, highRiskCount);
    renderEnvironmentalAverages(avgSlopeSafe, avgSlopeSevere, avgRainSafe, avgRainSevere, avgNdviSafe, avgNdviSevere);
}

// Generate AI recommendations list
function generateAIInsights(avgRisk, severePoints, totalNodes, avgSlopeSevere, avgRainSevere, avgNdviSevere) {
    const list = document.getElementById("recommendations-list");
    if (!list) return;
    list.innerHTML = "";

    const severePercent = (severePoints / totalNodes) * 100;
    const recs = [];

    if (severePercent > 20) {
        recs.push({
            title: "Policy Mandate: Structural Stabilization Required",
            text: `Critical hazard: ${severePercent.toFixed(1)}% of soil points are in imminent danger. Shifting local budgets to construct physical check-dams and biological soil binders is highly recommended.`,
            status: "severe"
        });
    } else {
        recs.push({
            title: "Routine Erosion Monitoring Active",
            text: `Active filters show low severe erosion risk (${severePercent.toFixed(1)}%). Standard contour crop rotation is sufficient.`,
            status: "safe"
        });
    }

    if (avgSlopeSevere > 18) {
        recs.push({
            title: "High Slope Gradient Intervention",
            text: `Severe risk zones present an average slope of ${avgSlopeSevere.toFixed(1)}°. Standard farming must be suspended. Build physical contour benches (bench terracing) to break gravity-induced soil kinetic paths.`,
            status: "severe"
        });
    }

    if (avgRainSevere > 1100) {
        recs.push({
            title: "Water Check-Dams (Hydraulic Shear Control)",
            text: `Severe risk zones receive heavy annual precipitation averaging ${avgRainSevere.toFixed(0)}mm. Construct rock/bamboo check-dams in drainage ditches to slow downslope water velocities.`,
            status: "warning"
        });
    }

    if (avgNdviSevere < 0.25) {
        recs.push({
            title: "Biological Root Reinforcement (Revegetation)",
            text: `Eroding slopes suffer from low vegetation density (NDVI average: ${avgNdviSevere.toFixed(2)}). Launch tree-planting (e.g., Vetiver grass) to reinforce topsoil binding.`,
            status: "severe"
        });
    } else {
        recs.push({
            title: "NDVI Paradox: Soil Saturation Risk Detected",
            text: `Erosion is high despite moderate forestation (NDVI: ${avgNdviSevere.toFixed(2)}). Steep slopes and extreme rainfall are overpowering root systems. Prioritize subsurface drainage.`,
            status: "warning"
        });
    }

    recs.forEach(rec => {
        const div = document.createElement("div");
        div.className = `ai-recommendation-box ${rec.status}`;
        div.innerHTML = `
            <div class="ai-rec-title">
                <span>${rec.status === 'severe' ? '🚨' : (rec.status === 'warning' ? '⚠️' : '✅')}</span>
                <span>${rec.title}</span>
            </div>
            <div class="ai-rec-text">${rec.text}</div>
        `;
        list.appendChild(div);
    });
}

// Render Doughnut Risk Chart
function renderCharts(low, mod, severe) {
    const canvasEl = document.getElementById("risk-distribution-chart");
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");

    if (riskChart) {
        riskChart.destroy();
    }

    riskChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Low Risk (Safe)', 'Moderate (Monitor)', 'Severe Risk (Action)'],
            datasets: [{
                data: [low, mod, severe],
                backgroundColor: ['#22c55e', '#f97316', '#ef4444'],
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 10,
                        font: { family: 'Inter', size: 10.5 }
                    }
                }
            },
            cutout: '72%'
        }
    });
}

// Render environmental averages side-by-side bar chart
function renderEnvironmentalAverages(slopeSafe, slopeSev, rainSafe, rainSev, ndviSafe, ndviSev) {
    const canvasEl = document.getElementById("environmental-stressors-chart");
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");

    if (stressorChart) {
        stressorChart.destroy();
    }

    const normRainSafe = rainSafe / 50;
    const normRainSev = rainSev / 50;
    const normNdviSafe = ndviSafe * 40;
    const normNdviSev = ndviSev * 40;

    stressorChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Slope (Degrees)', 'Rainfall (mm / 50)', 'NDVI Veg (x40)'],
            datasets: [
                {
                    label: 'Low Risk Nodes',
                    data: [slopeSafe, normRainSafe, normNdviSafe],
                    backgroundColor: 'rgba(34, 197, 94, 0.75)',
                    borderColor: '#22c55e',
                    borderWidth: 1
                },
                {
                    label: 'Severe Risk Nodes',
                    data: [slopeSev, normRainSev, normNdviSev],
                    backgroundColor: 'rgba(239, 68, 68, 0.75)',
                    borderColor: '#ef4444',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: { family: 'Inter', size: 9.5 }
                    }
                },
                x: {
                    ticks: {
                        font: { family: 'Inter', size: 10 }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 10,
                        font: { family: 'Inter', size: 10.5 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            let val = context.raw;
                            if (context.dataIndex === 1) {
                                return `${label}: ${(val * 50).toFixed(0)} mm`;
                            } else if (context.dataIndex === 2) {
                                return `${label}: ${(val / 40).toFixed(3)}`;
                            } else {
                                return `${label}: ${val.toFixed(1)}°`;
                            }
                        }
                    }
                }
            }
        }
    });
}
