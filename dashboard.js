// AI Spatial GCN Soil Erosion Dashboard - Engine
// Implementation of client-side GCN prediction and visualization

let gcnWeights = null;
let currentDataset = null;
let scaledFeatures = null;
let graphEdges = null;
let nodeDegrees = null;
let predictions = null;

// MinMaxScaler ranges from training
const SCALER_PARAMS = {
    'Elevation (m)': { min: 971.0, max: 3668.0 },
    'Slope (Degree)': { min: 0.0, max: 90.0 },
    'Rainfall (mm)': { min: 882.0029907, max: 1794.979981 },
    'NDVI_Value': { min: -0.177935, max: 0.464113 },
    'TWI': { min: -6.7122415088, max: 16.944588 },
    'SPI': { min: -0.602442, max: 5737.8206585 },
    'TRI': { min: 0.111084, max: 0.888916 },
    'Plan Curvature': { min: -8330751791.104, max: 8606097219.584 },
    'Profile Curvature': { min: -9972955615.232, max: 9043812597.76 },
    'Drainage Density (m)': { min: 0.0, max: 6216.283429 }
};

// Hard physical limits for clipping
const PHYSICAL_BOUNDS = {
    'Elevation (m)': { min: -150, max: 4600 },
    'Slope (Degree)': { min: 0, max: 90 },
    'Rainfall (mm)': { min: 0, max: 3000 },
    'NDVI_Value': { min: -1.0, max: 1.0 }
};

// 20 Categorical encoding keys in exact sequence expected by weight matrix (dimensions 14 to 33)
const CATEGORICAL_KEYS = [
    'Geology_Formation_Alaiae Formation',
    'Geology_Formation_Alajae Formation',
    'Geology_Formation_Amba Aradom Formation',
    'Geology_Formation_Antalo Formation',
    'Geology_Formation_Ashangi Formation',
    'Geology_Formation_Nazret Series',
    'Geology_Formation_Quaternary Basalt',
    'Geology_Formation_Rhyolitic Volcanic Complexes',
    'Geology_Formation_Tarmaber Megezez Formation',
    'Geology_Formation_Tarmaber-Meaezez Formations',
    'Geology_Formation_Unknown_Geo',
    'Land_Use_Built up areas',
    'Land_Use_Cropland',
    'Land_Use_Grassland',
    'Land_Use_Open water',
    'Land_Use_Shrubs cover areas',
    'Land_Use_Sparse vegetation',
    'Land_Use_Trees cover areas',
    'Land_Use_Trees cover areas0',
    'Land_Use_Vegetation aquatic'
];

// Initialize application
document.addEventListener("DOMContentLoaded", async () => {
    initTabs();
    initDragDrop();
    await loadGCNWeights();
});

// Navigation Tabs
function initTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    const dashboardSection = document.getElementById("dashboard-view");
    const paperSection = document.getElementById("paper-view");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            const target = tab.dataset.tab;
            if (target === "dashboard") {
                dashboardSection.classList.remove("hidden");
                paperSection.classList.add("hidden");
            } else {
                dashboardSection.classList.add("hidden");
                paperSection.classList.remove("hidden");
                
                // Lazy-load paper iframe if not loaded
                const iframe = document.getElementById("paper-iframe");
                if (!iframe.src) {
                    iframe.src = "paper.html";
                }
            }
        });
    });
}

// Load GCN weights
async function loadGCNWeights() {
    const satDot = document.getElementById("sat-dot");
    const satText = document.getElementById("sat-text");
    try {
        const response = await fetch('./Final_Research_Outputs/Erosion_GCN_Weights.json');
        if (!response.ok) throw new Error("Weights file not found");
        gcnWeights = await response.json();
        
        satDot.classList.add("active");
        satText.textContent = "AI MIND: ONLINE";
        satText.style.color = "var(--accent-emerald)";
        console.log("GCN Model Weights Loaded Successfully.");
    } catch (e) {
        console.error("Error loading GCN weights:", e);
        satText.textContent = "AI MIND: OFFLINE";
        satText.style.color = "var(--alert-red)";
        alert("Failed to load GCN Model weights from Final_Research_Outputs/Erosion_GCN_Weights.json. Please check if the file is exported correctly.");
    }
}

// Drag & Drop File Upload
function initDragDrop() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");

    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleUploadedFile(files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });
}

// Handle Uploaded File (CSV or XLSX)
function handleUploadedFile(file) {
    const loader = document.getElementById("loader");
    const loaderText = document.getElementById("loader-text");
    loader.classList.remove("hidden");
    loaderText.textContent = "ESTABLISHING SATELLITE CONNECTION...";

    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = function(e) {
        try {
            let data = [];
            if (isExcel) {
                loaderText.textContent = "DECRYPTING TELEMETRY MATRIX...";
                const arrayBuffer = e.target.result;
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                data = XLSX.utils.sheet_to_json(worksheet);
            } else {
                loaderText.textContent = "PARSING COMPRESSED TELEMETRY...";
                const csvText = e.target.result;
                data = parseCSV(csvText);
            }

            if (data.length === 0) {
                throw new Error("The uploaded file is empty.");
            }

            console.log(`Parsed ${data.length} records.`);
            processDataset(data);

        } catch (err) {
            alert(`Error processing file: ${err.message}`);
            loader.classList.add("hidden");
        }
    };

    if (isExcel) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}

// Simple robust CSV parser
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    // Header parsing
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        if (values.length !== headers.length) continue;
        
        const row = {};
        for (let j = 0; j < headers.length; j++) {
            row[headers[j]] = values[j];
        }
        result.push(row);
    }
    return result;
}

// Dataset Processing Pipeline
async function processDataset(data) {
    currentDataset = data;
    const loader = document.getElementById("loader");
    const loaderText = document.getElementById("loader-text");

    // Activate laser scan on map
    document.getElementById("laser").style.display = "block";

    // 1. Feature Extraction & Normalization
    loaderText.textContent = "SCALING GEOPHYSICAL TENSORS...";
    await sleep(400);
    scaledFeatures = extractAndScaleFeatures(data);

    // 2. Spatial Graph Construction (8-NN Graph)
    loaderText.textContent = "CONSTRUCTING TOPOLOGICAL MESH (8-NN)...";
    await sleep(400);
    buildSpatialGraph(data);

    // 3. GCN Model Forward Propagation
    loaderText.textContent = "AI DEEP MESSAGE-PASSING RUNNING...";
    await sleep(500);
    runGCNInference();

    // 4. Update UI Dashboard
    loaderText.textContent = "UPDATING MAP & TELEMETRY CONTROLS...";
    await sleep(300);
    updateDashboardUI();

    // Deactivate loader & laser
    loader.classList.add("hidden");
    document.getElementById("laser").style.display = "none";
}

// 1. Feature Extraction & Normalization
function extractAndScaleFeatures(data) {
    const features = [];
    
    data.forEach((row, idx) => {
        const featureVector = new Float32Array(33); // 33 inputs
        
        // Base Numerical Features
        // 1. K_Factor
        featureVector[0] = parseFloat(row['K_Factor']) || 0.20;
        
        // 2-10: Scaler features
        const featuresToScale = [
            'Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', 
            'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)'
        ];
        
        featuresToScale.forEach((feat, featIdx) => {
            let val = parseFloat(row[feat]) || 0;
            
            // Hard physics clipping
            if (PHYSICAL_BOUNDS[feat]) {
                const bounds = PHYSICAL_BOUNDS[feat];
                val = Math.max(bounds.min, Math.min(bounds.max, val));
            }
            
            // MinMaxScaler scaling: (x - min) / (max - min)
            const params = SCALER_PARAMS[feat];
            let scaledVal = (val - params.min) / (params.max - params.min);
            scaledVal = Math.max(0, Math.min(1, scaledVal)); // clip to [0, 1]
            
            featureVector[featIdx + 1] = scaledVal;
        });

        // 11-12 Aspect Sin/Cos
        const aspectDeg = parseFloat(row['Aspect (Degree)']) || 0;
        const rad = aspectDeg * Math.PI / 180;
        featureVector[11] = Math.sin(rad);
        featureVector[12] = Math.cos(rad);

        // 13: Drainage Density is already scaled in the loop above (index 10 in featuresToScale -> element 10 in vector)
        // Wait, featuresToScale mapping:
        // featIdx = 0 ('Elevation') -> vector[1]
        // ...
        // featIdx = 9 ('Drainage Density') -> vector[10]
        // Aspect_Sin is vector[11]
        // Aspect_Cos is vector[12]
        // Wait, the 13 base features in Python notebook are:
        // 0: K_Factor
        // 1: Elevation (m)
        // 2: Slope (Degree)
        // 3: Rainfall (mm)
        // 4: NDVI_Value
        // 5: TWI
        // 6: SPI
        // 7: TRI
        // 8: Plan Curvature
        // 9: Profile Curvature
        // 10: Aspect_Sin
        // 11: Aspect_Cos
        // 12: Drainage Density (m)
        // Let's make sure our indexes match this EXACT layout:
        // 0: K_Factor -> vector[0]
        // 1: Elevation (m) -> vector[1]
        // 2: Slope (Degree) -> vector[2]
        // 3: Rainfall (mm) -> vector[3]
        // 4: NDVI_Value -> vector[4]
        // 5: TWI -> vector[5]
        // 6: SPI -> vector[6]
        // 7: TRI -> vector[7]
        // 8: Plan Curvature -> vector[8]
        // 9: Profile Curvature -> vector[9]
        // 10: Aspect_Sin -> vector[10]
        // 11: Aspect_Cos -> vector[11]
        // 12: Drainage Density (m) -> vector[12]
        
        // Let's re-write mapping to match this exact sequence:
        featureVector[0] = parseFloat(row['K_Factor']) || 0.20;
        featureVector[1] = scaleFeature(row['Elevation (m)'], 'Elevation (m)');
        featureVector[2] = scaleFeature(row['Slope (Degree)'], 'Slope (Degree)');
        featureVector[3] = scaleFeature(row['Rainfall (mm)'], 'Rainfall (mm)');
        featureVector[4] = scaleFeature(row['NDVI_Value'], 'NDVI_Value');
        featureVector[5] = scaleFeature(row['TWI'], 'TWI');
        featureVector[6] = scaleFeature(row['SPI'], 'SPI');
        featureVector[7] = scaleFeature(row['TRI'], 'TRI');
        featureVector[8] = scaleFeature(row['Plan Curvature'], 'Plan Curvature');
        featureVector[9] = scaleFeature(row['Profile Curvature'], 'Profile Curvature');
        
        const aspectVal = parseFloat(row['Aspect (Degree)']) || 0;
        featureVector[10] = Math.sin(aspectVal * Math.PI / 180);
        featureVector[11] = Math.cos(aspectVal * Math.PI / 180);
        featureVector[12] = scaleFeature(row['Drainage Density (m)'], 'Drainage Density (m)');

        // Categorical encoding (Geology & Land Use) -> features index 13 to 32
        const geoVal = row['Geology_Formation'] || 'Unknown_Geo';
        const luVal = row['Land_Use'] || 'Unknown_LU';
        
        CATEGORICAL_KEYS.forEach((key, keyIdx) => {
            const vectorIndex = 13 + keyIdx;
            if (key.startsWith('Geology_Formation_')) {
                const geoName = key.replace('Geology_Formation_', '');
                featureVector[vectorIndex] = (geoVal === geoName) ? 1.0 : 0.0;
            } else if (key.startsWith('Land_Use_')) {
                const luName = key.replace('Land_Use_', '');
                featureVector[vectorIndex] = (luVal === luName) ? 1.0 : 0.0;
            }
        });

        features.push(featureVector);
    });

    return features;
}

function scaleFeature(valRaw, featName) {
    let val = parseFloat(valRaw) || 0;
    if (PHYSICAL_BOUNDS[featName]) {
        const bounds = PHYSICAL_BOUNDS[featName];
        val = Math.max(bounds.min, Math.min(bounds.max, val));
    }
    const params = SCALER_PARAMS[featName];
    let scaled = (val - params.min) / (params.max - params.min);
    return Math.max(0.0, Math.min(1.0, scaled));
}

// 2. Spatial Graph Construction (k-NN graph builder, k=8)
function buildSpatialGraph(data) {
    const N = data.length;
    graphEdges = [];
    nodeDegrees = new Int32Array(N);

    // Parse latitude/longitude for all nodes
    const coords = data.map(d => ({
        lat: parseFloat(d['Latitude']) || 0,
        lon: parseFloat(d['Longitude']) || 0
    }));

    // Find 8 nearest neighbors for each node
    for (let i = 0; i < N; i++) {
        // Add self-loop edge
        graphEdges.push([i, i]);
        nodeDegrees[i] += 1;

        const c_i = coords[i];
        
        // Calculate distances to all other nodes
        // If N is very large (> 5000), a full distance matrix might be slow.
        // We can optimize with a grid spatial index or simple sampling for huge datasets,
        // but for standard dashboards up to 2000 nodes, full scan is < 15ms.
        const list = [];
        for (let j = 0; j < N; j++) {
            if (i === j) continue;
            const c_j = coords[j];
            const dist = (c_i.lat - c_j.lat) ** 2 + (c_i.lon - c_j.lon) ** 2;
            list.push({ index: j, dist: dist });
        }

        // Sort by distance and take top 8
        list.sort((a, b) => a.dist - b.dist);
        const k = Math.min(8, list.length);
        for (let idx = 0; idx < k; idx++) {
            const neighborIdx = list[idx].index;
            graphEdges.push([i, neighborIdx]);
            nodeDegrees[neighborIdx] += 1; // incoming edge contributes to target degree
        }
    }
    console.log(`Graph constructed. Total nodes: ${N}, Total edges (incl. self-loops): ${graphEdges.length}`);
}

// 3. GCN Model Forward Propagation in JavaScript
function runGCNInference() {
    if (!gcnWeights) {
        console.error("Cannot run inference: GCN weights are not loaded.");
        return;
    }

    const N = currentDataset.length;
    predictions = new Float32Array(N);

    // Extract weights & biases from model weights JSON
    const w1 = gcnWeights['conv1.lin.weight'];      // [64, 33]
    const b1 = gcnWeights['conv1.bias'];            // [64]
    const w2 = gcnWeights['conv2.lin.weight'];      // [64, 64]
    const b2 = gcnWeights['conv2.bias'];            // [64]
    const wOut = gcnWeights['out.weight'];          // [2, 64]
    const bOut = gcnWeights['out.bias'];            // [2]

    // Layer 1 Matrix Projection: X * W1^T [N, 64]
    const layer1Proj = Array.from({ length: N }, () => new Float32Array(64));
    for (let i = 0; i < N; i++) {
        const x_i = scaledFeatures[i]; // [33]
        for (let h = 0; h < 64; h++) {
            let sum = b1[h];
            const w1_row = w1[h];
            for (let f = 0; f < 33; f++) {
                sum += x_i[f] * w1_row[f];
            }
            layer1Proj[i][h] = sum;
        }
    }

    // Layer 1 Graph Convolution: A_norm * Proj
    const layer1Conv = Array.from({ length: N }, () => new Float32Array(64));
    graphEdges.forEach(([u, v]) => {
        const deg_u = nodeDegrees[u];
        const deg_v = nodeDegrees[v];
        const norm = 1.0 / Math.sqrt(deg_u * deg_v);
        
        const proj_u = layer1Proj[u];
        const conv_v = layer1Conv[v];
        
        for (let h = 0; h < 64; h++) {
            conv_v[h] += norm * proj_u[h];
        }
    });

    // Layer 1 ReLU Activation: H1 [N, 64]
    const h1 = Array.from({ length: N }, () => new Float32Array(64));
    for (let i = 0; i < N; i++) {
        const conv_i = layer1Conv[i];
        const h1_i = h1[i];
        for (let h = 0; h < 64; h++) {
            h1_i[h] = Math.max(0.0, conv_i[h]); // ReLU
        }
    }

    // Layer 2 Matrix Projection: H1 * W2^T [N, 64]
    const layer2Proj = Array.from({ length: N }, () => new Float32Array(64));
    for (let i = 0; i < N; i++) {
        const h1_i = h1[i];
        for (let h = 0; h < 64; h++) {
            let sum = b2[h];
            const w2_row = w2[h];
            for (let f = 0; f < 64; f++) {
                sum += h1_i[f] * w2_row[f];
            }
            layer2Proj[i][h] = sum;
        }
    }

    // Layer 2 Graph Convolution: A_norm * Proj2
    const layer2Conv = Array.from({ length: N }, () => new Float32Array(64));
    graphEdges.forEach(([u, v]) => {
        const deg_u = nodeDegrees[u];
        const deg_v = nodeDegrees[v];
        const norm = 1.0 / Math.sqrt(deg_u * deg_v);
        
        const proj_u = layer2Proj[u];
        const conv_v = layer2Conv[v];
        
        for (let h = 0; h < 64; h++) {
            conv_v[h] += norm * proj_u[h];
        }
    });

    // Layer 2 ReLU Activation: H2 [N, 64]
    const h2 = Array.from({ length: N }, () => new Float32Array(64));
    for (let i = 0; i < N; i++) {
        const conv_i = layer2Conv[i];
        const h2_i = h2[i];
        for (let h = 0; h < 64; h++) {
            h2_i[h] = Math.max(0.0, conv_i[h]); // ReLU
        }
    }

    // Output Layer projection: H2 * W_out^T + b_out [N, 2]
    // And softmax activation to obtain high-risk probabilities
    for (let i = 0; i < N; i++) {
        const h2_i = h2[i];
        
        // Logit for class 0 (Low Risk)
        let logit0 = bOut[0];
        const wOut_row0 = wOut[0];
        for (let h = 0; h < 64; h++) {
            logit0 += h2_i[h] * wOut_row0[h];
        }

        // Logit for class 1 (High Risk)
        let logit1 = bOut[1];
        const wOut_row1 = wOut[1];
        for (let h = 0; h < 64; h++) {
            logit1 += h2_i[h] * wOut_row1[h];
        }

        // Softmax
        const maxLogit = Math.max(logit0, logit1);
        const exp0 = Math.exp(logit0 - maxLogit);
        const exp1 = Math.exp(logit1 - maxLogit);
        
        predictions[i] = exp1 / (exp0 + exp1); // Probability of Class 1 (Severe Risk)
    }

    console.log("GCN Inference Complete.");
}

// 4. Update Dashboard UI & Canvas Map
let mapZoom = 1.0;
let mapOffsetX = 0.0;
let mapOffsetY = 0.0;
let isDraggingMap = false;
let dragStartX = 0;
let dragStartY = 0;
let hoveredNodeIndex = -1;

function updateDashboardUI() {
    const N = currentDataset.length;

    // Reset Map View Settings
    mapZoom = 1.0;
    mapOffsetX = 0.0;
    mapOffsetY = 0.0;
    hoveredNodeIndex = -1;

    // Update Global Statistics Cards
    document.getElementById("scanned-points").textContent = N.toLocaleString();
    
    let sumProb = 0;
    let highRiskCount = 0;
    let modRiskCount = 0;
    let lowRiskCount = 0;

    const woredaStats = {};

    for (let i = 0; i < N; i++) {
        const prob = predictions[i];
        sumProb += prob;

        if (prob > 0.71) {
            highRiskCount++;
        } else if (prob > 0.25) {
            modRiskCount++;
        } else {
            lowRiskCount++;
        }

        // Breakdown by Woreda
        const woreda = currentDataset[i]['Woreda'] || 'Unknown Woreda';
        if (!woredaStats[woreda]) {
            woredaStats[woreda] = { low: 0, mod: 0, severe: 0, total: 0 };
        }
        woredaStats[woreda].total++;
        if (prob > 0.71) woredaStats[woreda].severe++;
        else if (prob > 0.25) woredaStats[woreda].mod++;
        else woredaStats[woreda].low++;
    }

    const avgRisk = sumProb / N;
    document.getElementById("avg-erodibility").textContent = `${(avgRisk * 100).toFixed(1)}%`;
    document.getElementById("severe-points").textContent = highRiskCount.toLocaleString();

    // Render Woreda Breakdown Table
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

    // Populate AI recommendations based on predictions
    generateAIInsights(avgRisk, highRiskCount, N);

    // Initialize Map Controls and Canvas events
    setupCanvasMap();
    renderCharts(lowRiskCount, modRiskCount, highRiskCount);
}

// Draw Canvas Map
function setupCanvasMap() {
    const canvas = document.getElementById("map-canvas");
    const container = document.getElementById("map-container");
    
    // Fit canvas size to container
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const ctx = canvas.getContext("2d");

    // Coordinates bounding box
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    currentDataset.forEach(d => {
        const lat = parseFloat(d['Latitude']) || 0;
        const lon = parseFloat(d['Longitude']) || 0;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
    });

    // Zoom slightly out of the boundaries
    const latSpan = maxLat - minLat || 0.1;
    const lonSpan = maxLon - minLon || 0.1;
    minLat -= latSpan * 0.05;
    maxLat += latSpan * 0.05;
    minLon -= lonSpan * 0.05;
    maxLon += lonSpan * 0.05;

    // Projection mapping from Lat/Lon to Canvas X/Y
    function getCanvasCoordinates(lat, lon) {
        // Longitude maps to X (west to east)
        // Latitude maps to Y (north to south, so we subtract from 1)
        const x = ((lon - minLon) / (maxLon - minLon)) * canvas.width;
        const y = (1.0 - (lat - minLat) / (maxLat - minLat)) * canvas.height;
        return {
            x: x * mapZoom + mapOffsetX,
            y: y * mapZoom + mapOffsetY
        };
    }

    // Reverse projection (for hover selection)
    function getGeoCoordinates(canvasX, canvasY) {
        const rawX = (canvasX - mapOffsetX) / mapZoom;
        const rawY = (canvasY - mapOffsetY) / mapZoom;

        const lon = (rawX / canvas.width) * (maxLon - minLon) + minLon;
        const lat = (1.0 - (rawY / canvas.height)) * (maxLat - minLat) + minLat;
        return { lat, lon };
    }

    // Render loop function
    function drawMap() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const showEdges = document.getElementById("opt-edges").checked;
        const mapType = document.querySelector('input[name="map-layer"]:checked').value;

        // 1. Draw connections if checked (GCN topological edges)
        if (showEdges && graphEdges) {
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = "rgba(21, 128, 61, 0.15)";
            graphEdges.forEach(([u, v]) => {
                if (u === v) return; // skip self loops
                const p_u = getCanvasCoordinates(parseFloat(currentDataset[u]['Latitude']), parseFloat(currentDataset[u]['Longitude']));
                const p_v = getCanvasCoordinates(parseFloat(currentDataset[v]['Latitude']), parseFloat(currentDataset[v]['Longitude']));
                ctx.beginPath();
                ctx.moveTo(p_u.x, p_u.y);
                ctx.lineTo(p_v.x, p_v.y);
                ctx.stroke();
            });
        }

        // 2. Draw nodes (soil points)
        currentDataset.forEach((d, idx) => {
            const lat = parseFloat(d['Latitude']);
            const lon = parseFloat(d['Longitude']);
            const pos = getCanvasCoordinates(lat, lon);

            // Skip off-screen nodes to optimize
            if (pos.x < -10 || pos.x > canvas.width + 10 || pos.y < -10 || pos.y > canvas.height + 10) {
                return;
            }

            let color = "";
            if (mapType === "risk") {
                // Risk gradient: green (safe) -> orange (mod) -> red (severe)
                const prob = predictions[idx];
                if (prob > 0.71) {
                    color = "rgba(239, 68, 68, 0.85)"; // Alert Red
                } else if (prob > 0.25) {
                    color = "rgba(249, 115, 22, 0.85)"; // Orange
                } else {
                    color = "rgba(34, 197, 94, 0.85)"; // Mint Green
                }
            } else if (mapType === "elevation") {
                const elevNorm = scaledFeatures[idx][1]; // Elevation is index 1
                color = `rgba(16, 185, 129, ${0.2 + elevNorm * 0.8})`; // Green opacity based on height
            } else if (mapType === "ndvi") {
                const ndviNorm = scaledFeatures[idx][4]; // NDVI is index 4
                color = `rgba(5, 150, 105, ${0.1 + ndviNorm * 0.9})`; // Plant green
            } else if (mapType === "rainfall") {
                const rainNorm = scaledFeatures[idx][3]; // Rainfall is index 3
                color = `rgba(59, 130, 246, ${0.2 + rainNorm * 0.8})`; // Blue rainfall intensity
            }

            // Draw dot
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, idx === hoveredNodeIndex ? 7 : 3.5, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

            // Hover border glow
            if (idx === hoveredNodeIndex) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();
            }
        });

        // 3. Draw tooltip overlay if hovering
        if (hoveredNodeIndex !== -1 && hoveredNodeIndex < currentDataset.length) {
            const d = currentDataset[hoveredNodeIndex];
            const prob = predictions[hoveredNodeIndex];
            const lat = parseFloat(d['Latitude']);
            const lon = parseFloat(d['Longitude']);
            const pos = getCanvasCoordinates(lat, lon);

            ctx.fillStyle = "rgba(13, 21, 14, 0.92)";
            ctx.strokeStyle = "rgba(34, 197, 94, 0.4)";
            ctx.lineWidth = 1;

            const boxWidth = 240;
            const boxHeight = 160;
            let tooltipX = pos.x + 12;
            let tooltipY = pos.y - 80;

            // Constrain tooltip on canvas bounds
            if (tooltipX + boxWidth > canvas.width) {
                tooltipX = pos.x - boxWidth - 12;
            }
            if (tooltipY + boxHeight > canvas.height) {
                tooltipY = canvas.height - boxHeight - 10;
            }
            if (tooltipY < 10) {
                tooltipY = 10;
            }

            // Rounded rectangle tooltip box
            ctx.beginPath();
            ctx.roundRect(tooltipX, tooltipY, boxWidth, boxHeight, 8);
            ctx.fill();
            ctx.stroke();

            // Text inside tooltip
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 11px Inter, sans-serif";
            ctx.fillText(`WOREDA: ${(d['Woreda'] || 'Unknown').toUpperCase()}`, tooltipX + 12, tooltipY + 22);

            ctx.font = "500 10px Inter, sans-serif";
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fillText(`GPS: ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`, tooltipX + 12, tooltipY + 36);

            ctx.beginPath();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            ctx.moveTo(tooltipX + 10, tooltipY + 44);
            ctx.lineTo(tooltipX + boxWidth - 10, tooltipY + 44);
            ctx.stroke();

            ctx.font = "600 10px Inter, sans-serif";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(`Slope: ${parseFloat(d['Slope (Degree)']) || 0}°`, tooltipX + 12, tooltipY + 60);
            ctx.fillText(`Elevation: ${parseInt(d['Elevation (m)']) || 0}m`, tooltipX + 12, tooltipY + 75);
            ctx.fillText(`Rainfall: ${parseInt(d['Rainfall (mm)']) || 0}mm`, tooltipX + 12, tooltipY + 90);
            ctx.fillText(`NDVI Veg: ${parseFloat(d['NDVI_Value']).toFixed(3)}`, tooltipX + 12, tooltipY + 105);

            // Risk bar
            ctx.fillText(`Erosion Probability:`, tooltipX + 12, tooltipY + 125);
            
            const barWidth = 216;
            const barHeight = 8;
            ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
            ctx.beginPath();
            ctx.roundRect(tooltipX + 12, tooltipY + 135, barWidth, barHeight, 4);
            ctx.fill();

            const riskColor = prob > 0.71 ? "var(--alert-red)" : (prob > 0.25 ? "var(--alert-orange)" : "var(--accent-mint)");
            ctx.fillStyle = riskColor;
            ctx.beginPath();
            ctx.roundRect(tooltipX + 12, tooltipY + 135, barWidth * prob, barHeight, 4);
            ctx.fill();

            ctx.font = "bold 10px Inter, sans-serif";
            ctx.fillStyle = riskColor;
            ctx.fillText(`${(prob * 100).toFixed(1)}%`, tooltipX + boxWidth - 45, tooltipY + 125);
        }
    }

    // Register Canvas Listeners for panning, zooming, and hovering
    canvas.addEventListener("mousedown", (e) => {
        isDraggingMap = true;
        dragStartX = e.clientX - mapOffsetX;
        dragStartY = e.clientY - mapOffsetY;
    });

    window.addEventListener("mouseup", () => {
        isDraggingMap = false;
    });

    canvas.addEventListener("mousemove", (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isDraggingMap) {
            mapOffsetX = e.clientX - dragStartX;
            mapOffsetY = e.clientY - dragStartY;
            drawMap();
        } else {
            // Find if hovering over a point
            let foundIndex = -1;
            let minDistance = 15; // hover trigger distance in pixels

            for (let i = 0; i < currentDataset.length; i++) {
                const lat = parseFloat(currentDataset[i]['Latitude']);
                const lon = parseFloat(currentDataset[i]['Longitude']);
                const pos = getCanvasCoordinates(lat, lon);
                
                const dist = Math.sqrt((pos.x - mouseX) ** 2 + (pos.y - mouseY) ** 2);
                if (dist < minDistance) {
                    minDistance = dist;
                    foundIndex = i;
                }
            }

            if (hoveredNodeIndex !== foundIndex) {
                hoveredNodeIndex = foundIndex;
                drawMap();
            }
        }
    });

    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Geo coordinates under cursor before zoom
        const geoBefore = getGeoCoordinates(mouseX, mouseY);

        // Update zoom
        if (e.deltaY < 0) {
            mapZoom *= (1.0 + zoomIntensity);
        } else {
            mapZoom *= (1.0 - zoomIntensity);
        }
        mapZoom = Math.max(0.5, Math.min(25, mapZoom));

        // Adjust offsets so cursor remains at same coordinates after zoom
        const posAfter = getCanvasCoordinates(geoBefore.lat, geoBefore.lon);
        mapOffsetX += (mouseX - posAfter.x);
        mapOffsetY += (mouseY - posAfter.y);

        drawMap();
    });

    // Handle map option switches
    document.querySelectorAll('input[name="map-layer"]').forEach(el => {
        el.addEventListener("change", drawMap);
    });
    document.getElementById("opt-edges").addEventListener("change", drawMap);

    // Initial draw
    drawMap();
}

// 5. AI Recommendations Generator
function generateAIInsights(avgRisk, severePoints, totalNodes) {
    const list = document.getElementById("recommendations-list");
    list.innerHTML = "";

    const severePercent = (severePoints / totalNodes) * 100;

    // Compile average stats of severe risk nodes
    let avgSlopeSevere = 0;
    let avgRainSevere = 0;
    let avgNdviSevere = 0;
    let countSevere = 0;

    for (let i = 0; i < totalNodes; i++) {
        if (predictions[i] > 0.71) {
            avgSlopeSevere += parseFloat(currentDataset[i]['Slope (Degree)']) || 0;
            avgRainSevere += parseFloat(currentDataset[i]['Rainfall (mm)']) || 0;
            avgNdviSevere += parseFloat(currentDataset[i]['NDVI_Value']) || 0;
            countSevere++;
        }
    }

    if (countSevere > 0) {
        avgSlopeSevere /= countSevere;
        avgRainSevere /= countSevere;
        avgNdviSevere /= countSevere;
    }

    // Dynamic Policy Generation based on findings
    const recs = [];

    // Recommendation 1: High Erodibility alarm
    if (severePercent > 20) {
        recs.push({
            title: "CRITICAL: Severe Degradation Policy Mandate",
            text: `The AI Model warns that ${severePercent.toFixed(1)}% of your coordinates are in imminent danger of soil detachment. Priority budget allocation should shift directly to regional structural stabilization programs.`,
            icon: "alert-triangle"
        });
    } else {
        recs.push({
            title: "Routine Ecological Monitoring Action",
            text: `Erosion zones remain relatively stable (only ${severePercent.toFixed(1)}% high risk). Maintain focus on standard crop rotation, terracing, and contour farming methods.`,
            icon: "check-circle"
        });
    }

    // Recommendation 2: Slope-induced recommendation
    if (avgSlopeSevere > 20) {
        recs.push({
            title: "Slope-Specific Terracing (Geomorphic Hazard)",
            text: `High-risk coordinates present an extreme average slope of ${avgSlopeSevere.toFixed(1)}°. Standard farming must be suspended. Build physical contour benches (bench terracing) to break gravity-induced soil kinetic paths.`,
            icon: "trending-up"
        });
    }

    // Recommendation 3: Rainfall-induced recommendation
    if (avgRainSevere > 1200) {
        recs.push({
            title: "Water Check-Dams (Hydraulic Shear Control)",
            text: `Severe risk zones experience intense annual precipitation averaging ${avgRainSevere.toFixed(0)}mm. Construct rock/bamboo check-dams in drainage ditches to slow downslope water velocities and decrease Stream Power (SPI).`,
            icon: "droplet"
        });
    }

    // Recommendation 4: NDVI root reinforcement
    if (avgNdviSevere < 0.3) {
        recs.push({
            title: "Revegetation & Afforestation (Cohesion Restorer)",
            text: `Eroding slopes suffer from critically low vegetation density (NDVI average: ${avgNdviSevere.toFixed(2)}). Launch immediate tree-planting (e.g., Vetiver grass and indigenous Acacias) to reinforce topsoil binding.`,
            icon: "trees"
        });
    } else {
        // Ethiopian NDVI Paradox insight!
        recs.push({
            title: "NDVI Paradox: Soil Saturation Risk Detected",
            text: `Even with moderate forestation (NDVI: ${avgNdviSevere.toFixed(2)}), erosion is high. Severe rainfall and steep slopes are overpowering root systems. Prioritize subsurface drainage alongside planting.`,
            icon: "info"
        });
    }

    // Append to UI
    recs.forEach(rec => {
        const div = document.createElement("div");
        div.className = "ai-recommendation-box";
        div.innerHTML = `
            <div class="ai-rec-title">
                <span class="rec-icon">✅</span>
                <span>${rec.title}</span>
            </div>
            <div class="ai-rec-text">${rec.text}</div>
        `;
        list.appendChild(div);
    });
}

// 6. Chart.js visualizer
let riskChart = null;

function renderCharts(low, mod, severe) {
    const ctx = document.getElementById("risk-distribution-chart").getContext("2d");
    
    if (riskChart) {
        riskChart.destroy();
    }

    riskChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Low Risk (Safe)', 'Moderate (Monitor)', 'Severe Risk (Action)'],
            datasets: [{
                data: [low, mod, severe],
                backgroundColor: [
                    '#22c55e', // Mint Green
                    '#f97316', // Orange
                    '#ef4444'  // Alert Red
                ],
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
                        boxWidth: 12,
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

// Sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
