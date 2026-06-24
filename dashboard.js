// Terrashield AI™ - Geospatial Land Degradation Platform
// Optimized GIS analytics and GCN soil erodibility engine

let gcnWeights = null;
let rawDataset = null;      // Holds the original uploaded rows
let filteredDataset = null; // Holds the currently filtered subset of rows
let scaledFeatures = [];    // Normalized float vectors [N, 33]
let graphEdges = [];        // Graph connections [[u, v], ...]
let nodeDegrees = null;     // Degree array for normalization
let predictions = null;     // Calculated risk probabilities

// Spatial Grid index for O(N) neighbor search and O(1) hover search
let spatialGrid = null;
let gridCellSizeLat = 0;
let gridCellSizeLon = 0;
let gridMinLat = 0, gridMaxLat = 0;
let gridMinLon = 0, gridMaxLon = 0;
let gridCols = 0, gridRows = 0;

// MinMaxScaler parameters from training
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

const PHYSICAL_BOUNDS = {
    'Elevation (m)': { min: -150, max: 4600 },
    'Slope (Degree)': { min: 0, max: 90 },
    'Rainfall (mm)': { min: 0, max: 3000 },
    'NDVI_Value': { min: -1.0, max: 1.0 }
};

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

// App entry point
document.addEventListener("DOMContentLoaded", async () => {
    initDragDrop();
    initFilterHandlers();
    initZoomControls();
    await loadGCNWeights();
});

// Load GCN weights
async function loadGCNWeights() {
    const sysState = document.getElementById("system-state");
    try {
        const response = await fetch('./Final_Research_Outputs/Erosion_GCN_Weights.json');
        if (!response.ok) throw new Error("Weights file not found");
        gcnWeights = await response.json();
        
        sysState.textContent = "SYSTEM READY";
        sysState.className = "sat-status-value ready";
        console.log("Terrashield AI Core Weights Loaded.");
    } catch (e) {
        console.error("Error loading GCN weights:", e);
        sysState.textContent = "ENGINE OFFLINE";
        sysState.className = "sat-status-value offline";
    }
}

// Drag & Drop
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
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });
}

function handleUploadedFile(file) {
    const loader = document.getElementById("loader");
    const loaderText = document.getElementById("loader-text");
    loader.classList.remove("hidden");
    loaderText.textContent = "LOADING TELEMETRY FILE...";

    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = function(e) {
        try {
            let data = [];
            if (isExcel) {
                loaderText.textContent = "DECRYPTING EXCEL SPREADSHEETS...";
                const arrayBuffer = e.target.result;
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                data = XLSX.utils.sheet_to_json(worksheet);
            } else {
                loaderText.textContent = "PARSING CSV RECORDS...";
                const csvText = e.target.result;
                data = parseCSV(csvText);
            }

            if (data.length === 0) {
                throw new Error("Dataset is empty.");
            }

            console.log(`Successfully parsed ${data.length} rows.`);
            
            // Execute the pipeline
            processDataset(data);

        } catch (err) {
            alert(`Error reading file: ${err.message}`);
            loader.classList.add("hidden");
        }
    };

    if (isExcel) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}

// Faster CSV parser
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
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

// Dynamic Filter Controls
function initFilterHandlers() {
    const filters = ['filter-slope', 'filter-rainfall', 'filter-ndvi', 'filter-woreda'];
    
    filters.forEach(id => {
        const el = document.getElementById(id);
        if (id !== 'filter-woreda') {
            el.addEventListener("input", (e) => {
                document.getElementById(`${id}-val`).textContent = e.target.value;
                applyDynamicFilters();
            });
        } else {
            el.addEventListener("change", applyDynamicFilters);
        }
    });

    // Reset filters
    document.getElementById("btn-reset-filters").addEventListener("click", () => {
        document.getElementById("filter-slope").value = 0;
        document.getElementById("filter-slope-val").textContent = "0";

        document.getElementById("filter-rainfall").value = 0;
        document.getElementById("filter-rainfall-val").textContent = "0";

        document.getElementById("filter-ndvi").value = 1.0;
        document.getElementById("filter-ndvi-val").textContent = "1.0";

        document.getElementById("filter-woreda").value = "all";

        applyDynamicFilters();
    });
}

// zoom controls on map UI
function initZoomControls() {
    document.getElementById("btn-zoom-in").addEventListener("click", () => {
        mapZoom *= 1.25;
        triggerMapRedraw();
    });
    document.getElementById("btn-zoom-out").addEventListener("click", () => {
        mapZoom *= 0.8;
        triggerMapRedraw();
    });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => {
        mapZoom = 1.0;
        mapOffsetX = 0.0;
        mapOffsetY = 0.0;
        triggerMapRedraw();
    });
}

// Processing Pipeline
async function processDataset(data) {
    rawDataset = data;
    const loader = document.getElementById("loader");
    const loaderText = document.getElementById("loader-text");

    document.getElementById("laser").style.display = "block";

    // 1. Scale all features using GCN specs
    loaderText.textContent = "SCALING ENVIRONMENTAL GEOPHYSICAL TENSORS...";
    await sleep(250);
    scaledFeatures = extractAndScaleFeatures(data);

    // 2. Build fast Spatial grid index for O(N log N) graph construction & O(1) hover search
    loaderText.textContent = "INDEXING COORDINATES FOR FAST TOPOLOGICAL SEARCH...";
    await sleep(250);
    buildSpatialGridIndex(data);

    // 3. Build Spatial Graph using grid-accelerated neighbor queries
    loaderText.textContent = "CONSTRUCTING HYDROLOGICAL SPATIAL EDGES...";
    await sleep(350);
    buildSpatialGraph(data);

    // 4. Run JS GCN feed-forward pass
    loaderText.textContent = "RUNNING GCN MESSAGE-PASSING PREDICTIONS...";
    await sleep(400);
    runGCNInference();

    // 5. Populate Woreda Filter options
    populateWoredaDropdown(data);

    // 6. Apply filters and trigger dashboard update
    applyDynamicFilters();

    loader.classList.add("hidden");
    document.getElementById("laser").style.display = "none";
}

// 1. Scale features
function extractAndScaleFeatures(data) {
    const features = [];
    
    data.forEach((row) => {
        const featureVector = new Float32Array(33);
        
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

// 2. Build Fast Spatial Grid Index (O(N) construction)
function buildSpatialGridIndex(data) {
    const N = data.length;
    
    // Find spatial limits
    gridMinLat = 90; gridMaxLat = -90;
    gridMinLon = 180; gridMaxLon = -180;
    
    data.forEach(d => {
        const lat = parseFloat(d['Latitude']) || 0;
        const lon = parseFloat(d['Longitude']) || 0;
        if (lat < gridMinLat) gridMinLat = lat;
        if (lat > gridMaxLat) gridMaxLat = lat;
        if (lon < gridMinLon) gridMinLon = lon;
        if (lon > gridMaxLon) gridMaxLon = lon;
    });

    // Dynamic grid size selection (cells count scales with N for optimal bin population)
    gridCols = Math.max(5, Math.floor(Math.sqrt(N) / 4));
    gridRows = Math.max(5, Math.floor(Math.sqrt(N) / 4));
    
    const latSpan = gridMaxLat - gridMinLat || 0.01;
    const lonSpan = gridMaxLon - gridMinLon || 0.01;

    gridCellSizeLat = latSpan / gridRows;
    gridCellSizeLon = lonSpan / gridCols;

    // Allocate grid buckets
    spatialGrid = Array.from({ length: gridCols }, () => 
        Array.from({ length: gridRows }, () => [])
    );

    // Place each point into its grid bucket
    data.forEach((d, idx) => {
        const lat = parseFloat(d['Latitude']) || 0;
        const lon = parseFloat(d['Longitude']) || 0;
        
        let col = Math.floor((lon - gridMinLon) / gridCellSizeLon);
        let row = Math.floor((lat - gridMinLat) / gridCellSizeLat);
        
        col = Math.max(0, Math.min(gridCols - 1, col));
        row = Math.max(0, Math.min(gridRows - 1, row));
        
        spatialGrid[col][row].push(idx);
    });

    console.log(`Built Spatial Grid: ${gridCols}x${gridRows} cells.`);
}

// 3. Grid-Accelerated Graph Construction (O(N) expected time)
function buildSpatialGraph(data) {
    const N = data.length;
    graphEdges = [];
    nodeDegrees = new Int32Array(N);

    // Cache coordinate values for direct lookup
    const coords = data.map(d => ({
        lat: parseFloat(d['Latitude']) || 0,
        lon: parseFloat(d['Longitude']) || 0
    }));

    for (let i = 0; i < N; i++) {
        // Self loop
        graphEdges.push([i, i]);
        nodeDegrees[i] += 1;

        const c_i = coords[i];
        
        // Find which cell node i belongs to
        let col = Math.floor((c_i.lon - gridMinLon) / gridCellSizeLon);
        let row = Math.floor((c_i.lat - gridMinLat) / gridCellSizeLat);
        col = Math.max(0, Math.min(gridCols - 1, col));
        row = Math.max(0, Math.min(gridRows - 1, row));

        const candidates = [];

        // Scan 3x3 cells neighborhood
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const ncol = col + dx;
                const nrow = row + dy;
                
                if (ncol >= 0 && ncol < gridCols && nrow >= 0 && nrow < gridRows) {
                    const bucket = spatialGrid[ncol][nrow];
                    for (let b = 0; b < bucket.length; b++) {
                        const j = bucket[b];
                        if (i === j) continue;
                        
                        const c_j = coords[j];
                        // Squared Euclidean distance
                        const dSq = (c_i.lat - c_j.lat) ** 2 + (c_i.lon - c_j.lon) ** 2;
                        candidates.push({ idx: j, dSq: dSq });
                    }
                }
            }
        }

        // If a cell is extremely sparse and we found less than 8 neighbors, 
        // we could expand search window, but 3x3 is usually more than enough.
        // Sort candidates
        candidates.sort((a, b) => a.dSq - b.dSq);
        const k = Math.min(8, candidates.length);
        for (let idx = 0; idx < k; idx++) {
            const neighbor = candidates[idx].idx;
            graphEdges.push([i, neighbor]);
            nodeDegrees[neighbor] += 1;
        }
    }
}

// 4. Client-side GCN inference
function runGCNInference() {
    if (!gcnWeights) return;

    const N = rawDataset.length;
    predictions = new Float32Array(N);

    const w1 = gcnWeights['conv1.lin.weight'];      // [64, 33]
    const b1 = gcnWeights['conv1.bias'];            // [64]
    const w2 = gcnWeights['conv2.lin.weight'];      // [64, 64]
    const b2 = gcnWeights['conv2.bias'];            // [64]
    const wOut = gcnWeights['out.weight'];          // [2, 64]
    const bOut = gcnWeights['out.bias'];            // [2]

    // Layer 1 Projection
    const layer1Proj = Array.from({ length: N }, () => new Float32Array(64));
    for (let i = 0; i < N; i++) {
        const x_i = scaledFeatures[i];
        for (let h = 0; h < 64; h++) {
            let sum = b1[h];
            const w1_row = w1[h];
            for (let f = 0; f < 33; f++) {
                sum += x_i[f] * w1_row[f];
            }
            layer1Proj[i][h] = sum;
        }
    }

    // Layer 1 Spatial Convolution: A_norm * Proj
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

    // Layer 1 Activation (ReLU)
    const h1 = Array.from({ length: N }, () => new Float32Array(64));
    for (let i = 0; i < N; i++) {
        const conv_i = layer1Conv[i];
        const h1_i = h1[i];
        for (let h = 0; h < 64; h++) {
            h1_i[h] = Math.max(0.0, conv_i[h]);
        }
    }

    // Layer 2 Projection
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

    // Layer 2 Spatial Convolution: A_norm * Proj2
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

    // Layer 2 Activation (ReLU)
    const h2 = Array.from({ length: N }, () => new Float32Array(64));
    for (let i = 0; i < N; i++) {
        const conv_i = layer2Conv[i];
        const h2_i = h2[i];
        for (let h = 0; h < 64; h++) {
            h2_i[h] = Math.max(0.0, conv_i[h]);
        }
    }

    // Linear Out & Softmax
    for (let i = 0; i < N; i++) {
        const h2_i = h2[i];
        
        let logit0 = bOut[0];
        const wOut_row0 = wOut[0];
        for (let h = 0; h < 64; h++) {
            logit0 += h2_i[h] * wOut_row0[h];
        }

        let logit1 = bOut[1];
        const wOut_row1 = wOut[1];
        for (let h = 0; h < 64; h++) {
            logit1 += h2_i[h] * wOut_row1[h];
        }

        const maxLogit = Math.max(logit0, logit1);
        const exp0 = Math.exp(logit0 - maxLogit);
        const exp1 = Math.exp(logit1 - maxLogit);
        
        predictions[i] = exp1 / (exp0 + exp1);
    }
}

// Woreda filter population
function populateWoredaDropdown(data) {
    const dropdown = document.getElementById("filter-woreda");
    dropdown.innerHTML = '<option value="all">All Woredas (Regions)</option>';

    const woredas = new Set();
    data.forEach(d => {
        if (d['Woreda']) woredas.add(d['Woreda']);
    });

    const sortedWoredas = Array.from(woredas).sort();
    sortedWoredas.forEach(w => {
        const opt = document.createElement("option");
        opt.value = w;
        opt.textContent = w;
        dropdown.appendChild(opt);
    });
}

// 5. Apply filters (Slope, Rainfall, NDVI, Woreda)
function applyDynamicFilters() {
    if (!rawDataset) return;

    const slopeThresh = parseFloat(document.getElementById("filter-slope").value);
    const rainThresh = parseFloat(document.getElementById("filter-rainfall").value);
    const ndviThresh = parseFloat(document.getElementById("filter-ndvi").value);
    const woredaVal = document.getElementById("filter-woreda").value;

    const filtered = [];
    rawDataset.forEach((row, idx) => {
        const slope = parseFloat(row['Slope (Degree)']) || 0;
        const rain = parseFloat(row['Rainfall (mm)']) || 0;
        const ndvi = parseFloat(row['NDVI_Value']) || 0;
        const woreda = row['Woreda'] || '';

        // Filter checks
        if (slope < slopeThresh) return;
        if (rain < rainThresh) return;
        if (ndvi > ndviThresh) return;
        if (woredaVal !== 'all' && woreda !== woredaVal) return;

        // Keep raw index inside the filtered row object for direct mapping to prediction array
        row._rawIndex = idx;
        filtered.push(row);
    });

    filteredDataset = filtered;
    console.log(`Filtered dataset size: ${filteredDataset.length} / ${rawDataset.length}`);

    // Update charts and statistics based on filtered subset
    updateStatsAndCharts();
    setupCanvasMap();
}

// Update stats and charts based on filtered data
function updateStatsAndCharts() {
    const N = filteredDataset.length;
    document.getElementById("scanned-points").textContent = N.toLocaleString();

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

    // Stressor Averages: Safe vs Severe
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

    // Woreda table
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

    // Compute averages
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

    // Render Insights and Charts
    generateAIInsights(avgRisk, highRiskCount, N, avgSlopeSevere, avgRainSevere, avgNdviSevere);
    renderCharts(lowRiskCount, modRiskCount, highRiskCount);
    renderEnvironmentalAverages(avgSlopeSafe, avgSlopeSevere, avgRainSafe, avgRainSevere, avgNdviSafe, avgNdviSevere);
}

// 6. Interactive Canvas Map Rendering with Offscreen Buffering
let mapZoom = 1.0;
let mapOffsetX = 0.0;
let mapOffsetY = 0.0;
let isDraggingMap = false;
let dragStartX = 0;
let dragStartY = 0;
let hoveredNodeIndex = -1; // Index in the rawDataset

// Cache the static base drawing to offscreen canvas for 60fps pan/zoom
let offscreenCanvas = null;
let offscreenCtx = null;
let lastRenderedLayer = "";
let lastShowEdges = false;
let lastDataLength = 0;

function setupCanvasMap() {
    const canvas = document.getElementById("map-canvas");
    const container = document.getElementById("map-container");
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const ctx = canvas.getContext("2d");

    if (filteredDataset.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "14px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No coordinates match active filters.", canvas.width / 2, canvas.height / 2);
        return;
    }

    // Find bounding box for spatial mapping
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    filteredDataset.forEach(d => {
        const lat = parseFloat(d['Latitude']) || 0;
        const lon = parseFloat(d['Longitude']) || 0;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
    });

    const latSpan = maxLat - minLat || 0.01;
    const lonSpan = maxLon - minLon || 0.01;
    
    // Zoom slightly out
    minLat -= latSpan * 0.05;
    maxLat += latSpan * 0.05;
    minLon -= lonSpan * 0.05;
    maxLon += lonSpan * 0.05;

    // Convert Lat/Lon to Canvas coordinate space (before zoom/offsets are applied)
    function getBaseCanvasCoordinates(lat, lon) {
        const x = ((lon - minLon) / (maxLon - minLon)) * canvas.width;
        const y = (1.0 - (lat - minLat) / (maxLat - minLat)) * canvas.height;
        return { x, y };
    }

    // Projection mapping with zoom/pan offsets
    function getCanvasCoordinates(lat, lon) {
        const base = getBaseCanvasCoordinates(lat, lon);
        return {
            x: base.x * mapZoom + mapOffsetX,
            y: base.y * mapZoom + mapOffsetY
        };
    }

    // Reverse projection
    function getGeoCoordinates(canvasX, canvasY) {
        const rawX = (canvasX - mapOffsetX) / mapZoom;
        const rawY = (canvasY - mapOffsetY) / mapZoom;

        const lon = (rawX / canvas.width) * (maxLon - minLon) + minLon;
        const lat = (1.0 - (rawY / canvas.height)) * (maxLat - minLat) + minLat;
        return { lat, lon };
    }

    // Allocate offscreen buffer if missing or resized
    if (!offscreenCanvas || offscreenCanvas.width !== canvas.width || offscreenCanvas.height !== canvas.height) {
        offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        offscreenCtx = offscreenCanvas.getContext("2d");
        lastRenderedLayer = ""; // Force redraw
    }

    const showEdges = document.getElementById("opt-edges").checked;
    const mapType = document.querySelector('input[name="map-layer"]:checked').value;

    // Redraw offscreen buffer if layer settings changed or dataset reloaded
    const cacheKey = `${mapType}_${showEdges}_${filteredDataset.length}`;
    if (lastRenderedLayer !== cacheKey) {
        offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

        // 1. Draw Edges inside buffer
        if (showEdges && graphEdges) {
            offscreenCtx.lineWidth = 0.4;
            offscreenCtx.strokeStyle = "rgba(34, 197, 94, 0.1)"; // faint green lines
            
            // Draw edges only if both nodes are in the active filtered dataset
            const activeSet = new Set(filteredDataset.map(d => d._rawIndex));
            
            graphEdges.forEach(([u, v]) => {
                if (u === v) return;
                if (!activeSet.has(u) || !activeSet.has(v)) return;

                const p_u = getBaseCanvasCoordinates(parseFloat(rawDataset[u]['Latitude']), parseFloat(rawDataset[u]['Longitude']));
                const p_v = getBaseCanvasCoordinates(parseFloat(rawDataset[v]['Latitude']), parseFloat(rawDataset[v]['Longitude']));
                offscreenCtx.beginPath();
                offscreenCtx.moveTo(p_u.x, p_u.y);
                offscreenCtx.lineTo(p_v.x, p_v.y);
                offscreenCtx.stroke();
            });
        }

        // 2. Draw Nodes inside buffer
        filteredDataset.forEach((d) => {
            const rawIdx = d._rawIndex;
            const lat = parseFloat(d['Latitude']);
            const lon = parseFloat(d['Longitude']);
            const pos = getBaseCanvasCoordinates(lat, lon);

            let color = "";
            if (mapType === "risk") {
                const prob = predictions[rawIdx];
                if (prob > 0.71) {
                    color = "rgba(239, 68, 68, 0.85)"; // Alert Red
                } else if (prob > 0.25) {
                    color = "rgba(249, 115, 22, 0.85)"; // Orange
                } else {
                    color = "rgba(34, 197, 94, 0.85)"; // Mint Green
                }
            } else if (mapType === "elevation") {
                const elevNorm = scaledFeatures[rawIdx][1];
                color = `rgba(16, 185, 129, ${0.15 + elevNorm * 0.85})`; // Green heights
            } else if (mapType === "ndvi") {
                const ndviNorm = scaledFeatures[rawIdx][4];
                color = `rgba(5, 150, 105, ${0.1 + ndviNorm * 0.9})`; // Vegetation
            } else if (mapType === "rainfall") {
                const rainNorm = scaledFeatures[rawIdx][3];
                color = `rgba(59, 130, 246, ${0.15 + rainNorm * 0.85})`; // Rain Blue
            }

            offscreenCtx.beginPath();
            offscreenCtx.arc(pos.x, pos.y, 2.5, 0, 2 * Math.PI);
            offscreenCtx.fillStyle = color;
            offscreenCtx.fill();
        });

        lastRenderedLayer = cacheKey;
    }

    // Main Draw loop
    function drawMap() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw the pre-rendered offscreen buffer stretched according to Zoom and Offset
        ctx.drawImage(
            offscreenCanvas, 
            0, 0, offscreenCanvas.width, offscreenCanvas.height,
            mapOffsetX, mapOffsetY, offscreenCanvas.width * mapZoom, offscreenCanvas.height * mapZoom
        );

        // 2. Draw highlighted node if hovering
        if (hoveredNodeIndex !== -1 && hoveredNodeIndex < rawDataset.length) {
            const d = rawDataset[hoveredNodeIndex];
            const prob = predictions[hoveredNodeIndex];
            const lat = parseFloat(d['Latitude']);
            const lon = parseFloat(d['Longitude']);
            
            const pos = getCanvasCoordinates(lat, lon);

            let color = "var(--accent-mint)";
            if (prob > 0.71) color = "var(--alert-red)";
            else if (prob > 0.25) color = "var(--alert-orange)";

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 6.5, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();

            // Render Tooltip Box
            ctx.fillStyle = "rgba(13, 21, 14, 0.94)";
            ctx.strokeStyle = "rgba(34, 197, 94, 0.4)";
            ctx.lineWidth = 1.2;

            const boxWidth = 230;
            const boxHeight = 150;
            let tooltipX = pos.x + 12;
            let tooltipY = pos.y - 75;

            if (tooltipX + boxWidth > canvas.width) {
                tooltipX = pos.x - boxWidth - 12;
            }
            if (tooltipY + boxHeight > canvas.height) {
                tooltipY = canvas.height - boxHeight - 10;
            }
            if (tooltipY < 10) {
                tooltipY = 10;
            }

            ctx.beginPath();
            ctx.roundRect(tooltipX, tooltipY, boxWidth, boxHeight, 8);
            ctx.fill();
            ctx.stroke();

            // Text info
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 10.5px Inter, sans-serif";
            ctx.fillText(`REGION: ${(d['Woreda'] || 'Unknown').toUpperCase()}`, tooltipX + 12, tooltipY + 20);

            ctx.font = "500 9px Inter, sans-serif";
            ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
            ctx.fillText(`COORD: ${lat.toFixed(5)}°N, ${lon.toFixed(5)}°E`, tooltipX + 12, tooltipY + 34);

            ctx.beginPath();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
            ctx.moveTo(tooltipX + 10, tooltipY + 41);
            ctx.lineTo(tooltipX + boxWidth - 10, tooltipY + 41);
            ctx.stroke();

            ctx.font = "600 9.5px Inter, sans-serif";
            ctx.fillStyle = "#ffffff";
            ctx.fillText(`Slope Gradient: ${parseFloat(d['Slope (Degree)']) || 0}°`, tooltipX + 12, tooltipY + 56);
            ctx.fillText(`Altitude (DEM): ${parseInt(d['Elevation (m)']) || 0}m`, tooltipX + 12, tooltipY + 70);
            ctx.fillText(`Annual Rainfall: ${parseInt(d['Rainfall (mm)']) || 0}mm`, tooltipX + 12, tooltipY + 84);
            ctx.fillText(`Vegetation Cover (NDVI): ${parseFloat(d['NDVI_Value']).toFixed(3)}`, tooltipX + 12, tooltipY + 98);

            // Soil type & Geology
            ctx.font = "500 8.5px Inter, sans-serif";
            ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            ctx.fillText(`Soil: ${d['Soil Type'] || 'N/A'} | Geo: ${d['Geology_Formation'] || 'N/A'}`, tooltipX + 12, tooltipY + 112);

            // Risk bar
            const barWidth = 206;
            const barHeight = 6;
            ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
            ctx.beginPath();
            ctx.roundRect(tooltipX + 12, tooltipY + 130, barWidth, barHeight, 3);
            ctx.fill();

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(tooltipX + 12, tooltipY + 130, barWidth * prob, barHeight, 3);
            ctx.fill();

            ctx.font = "bold 9.5px Inter, sans-serif";
            ctx.fillStyle = color;
            ctx.fillText(`${(prob * 100).toFixed(1)}%`, tooltipX + boxWidth - 40, tooltipY + 123);
        }
    }

    // Set map redraw trigger to global scope
    window.triggerMapRedraw = drawMap;

    // Attach listeners
    canvas.replaceWith(canvas.cloneNode(true)); // reset listeners
    const activeCanvas = document.getElementById("map-canvas");

    activeCanvas.addEventListener("mousedown", (e) => {
        isDraggingMap = true;
        dragStartX = e.clientX - mapOffsetX;
        dragStartY = e.clientY - mapOffsetY;
    });

    window.addEventListener("mouseup", () => {
        isDraggingMap = false;
    });

    activeCanvas.addEventListener("mousemove", (e) => {
        const rect = activeCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isDraggingMap) {
            mapOffsetX = e.clientX - dragStartX;
            mapOffsetY = e.clientY - dragStartY;
            drawMap();
        } else {
            // O(1) hover search using Spatial grid index
            const geo = getGeoCoordinates(mouseX, mouseY);
            
            // Check cell under mouse cursor
            let cellCol = Math.floor((geo.lon - gridMinLon) / gridCellSizeLon);
            let cellRow = Math.floor((geo.lat - gridMinLat) / gridCellSizeLat);
            
            let foundIndex = -1;
            let minDistance = 12; // trigger radius in pixels

            if (cellCol >= 0 && cellCol < gridCols && cellRow >= 0 && cellRow < gridRows) {
                // Check cell and immediate neighbors to catch borders
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const nc = cellCol + dx;
                        const nr = cellRow + dy;
                        if (nc >= 0 && nc < gridCols && nr >= 0 && nr < gridRows) {
                            const bucket = spatialGrid[nc][nr];
                            for (let b = 0; b < bucket.length; b++) {
                                const idx = bucket[b];
                                const d_lat = parseFloat(rawDataset[idx]['Latitude']);
                                const d_lon = parseFloat(rawDataset[idx]['Longitude']);
                                const pos = getCanvasCoordinates(d_lat, d_lon);
                                
                                const dist = Math.sqrt((pos.x - mouseX) ** 2 + (pos.y - mouseY) ** 2);
                                if (dist < minDistance) {
                                    minDistance = dist;
                                    foundIndex = idx;
                                }
                            }
                        }
                    }
                }
            }

            if (hoveredNodeIndex !== foundIndex) {
                hoveredNodeIndex = foundIndex;
                drawMap();
            }
        }
    });

    activeCanvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomIntensity = 0.08;
        const rect = activeCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const geoBefore = getGeoCoordinates(mouseX, mouseY);

        if (e.deltaY < 0) {
            mapZoom *= (1.0 + zoomIntensity);
        } else {
            mapZoom *= (1.0 - zoomIntensity);
        }
        mapZoom = Math.max(0.4, Math.min(30, mapZoom));

        const posAfter = getCanvasCoordinates(geoBefore.lat, geoBefore.lon);
        mapOffsetX += (mouseX - posAfter.x);
        mapOffsetY += (mouseY - posAfter.y);

        drawMap();
    });

    document.querySelectorAll('input[name="map-layer"]').forEach(el => {
        el.addEventListener("change", () => {
            lastRenderedLayer = ""; // Force offscreen redraw
            setupCanvasMap();
        });
    });

    document.getElementById("opt-edges").addEventListener("change", () => {
        lastRenderedLayer = ""; // Force offscreen redraw
        setupCanvasMap();
    });

    drawMap();
}

// 7. AI Recommendation Box
function generateAIInsights(avgRisk, severePoints, totalNodes, avgSlopeSevere, avgRainSevere, avgNdviSevere) {
    const list = document.getElementById("recommendations-list");
    list.innerHTML = "";

    const severePercent = (severePoints / totalNodes) * 100;
    const recs = [];

    // Alert Recommendation
    if (severePercent > 20) {
        recs.push({
            title: "Policy Mandate: Structural Stabilization",
            text: `Critical hazard: ${severePercent.toFixed(1)}% of analyzed soil points are classified as severe risk. Shifting local budgets to construct physical check-dams and biological soil binding is highly recommended.`,
            status: "severe"
        });
    } else {
        recs.push({
            title: "Routine Erosion Mitigation Mode",
            text: `Active filters show low severe erosion risk (${severePercent.toFixed(1)}%). Implement standard terracing and contour crop rotation.`,
            status: "safe"
        });
    }

    // Geomorphology Check
    if (avgSlopeSevere > 18) {
        recs.push({
            title: "High Slope Gradient Intervention",
            text: `High-risk coordinates exhibit an average slope of ${avgSlopeSevere.toFixed(1)}°. Standard cultivation should be replaced by bench terracing to disrupt gravitational shear paths.`,
            status: "severe"
        });
    }

    // Hydraulic check
    if (avgRainSevere > 1100) {
        recs.push({
            title: "Hydrological Flow (SPI) Reduction",
            text: `Severe risk zones receive heavy precipitation averaging ${avgRainSevere.toFixed(0)}mm. Construct check-dams in drainage pathways to slow flow velocity.`,
            status: "warning"
        });
    }

    // NDVI check
    if (avgNdviSevere < 0.25) {
        recs.push({
            title: "Biological Root Reinforcement",
            text: `Severe risk points have poor plant cover (NDVI average: ${avgNdviSevere.toFixed(2)}). Implement revegetation using deep-root grasses (like Vetiver) to hold topsoil.`,
            status: "severe"
        });
    } else {
        // Paradox
        recs.push({
            title: "NDVI Paradox: Soil Saturation Risk",
            text: `Severe risk zones have forestation cover (NDVI: ${avgNdviSevere.toFixed(2)}), yet are eroding. Extreme slope and heavy rainfall are bypassing vegetation. Subsurface drainage is required.`,
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

// 8. Charts Rendering
let riskChart = null;
let stressorChart = null;

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

function renderEnvironmentalAverages(slopeSafe, slopeSev, rainSafe, rainSev, ndviSafe, ndviSev) {
    const ctx = document.getElementById("environmental-stressors-chart").getContext("2d");

    if (stressorChart) {
        stressorChart.destroy();
    }

    // Normalize rainfall for visualization on the same scale (max rainfall approx 1800, so divide by 50 to fit 0-40 range)
    const normRainSafe = rainSafe / 50;
    const normRainSev = rainSev / 50;

    // Scale NDVI for visualization (0.5 max NDVI, multiply by 40 to fit 0-40 range)
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
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let val = context.raw;
                            if (context.dataIndex === 1) { // Rainfall
                                return `${label}: ${(val * 50).toFixed(0)} mm`;
                            } else if (context.dataIndex === 2) { // NDVI
                                return `${label}: ${(val / 40).toFixed(3)}`;
                            } else { // Slope
                                return `${label}: ${val.toFixed(1)}°`;
                            }
                        }
                    }
                }
            }
        }
    });
}

// Sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
