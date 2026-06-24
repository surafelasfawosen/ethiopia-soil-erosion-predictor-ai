// Terrashield AI™ - Geospatial Land Degradation Platform
// Optimized GIS analytics and GCN soil erodibility engine

let gcnWeights = null;
let rawDataset = null;      // Holds the original uploaded rows
let filteredDataset = null; // Holds the currently filtered subset of rows
let scaledFeatures = [];    // Normalized float vectors [N, 33]
let graphEdges = [];        // Graph connections [[u, v], ...]
let nodeDegrees = null;     // Degree array for normalization
let predictions = null;     // Calculated risk probabilities

// Map settings
let mapProjectionMode = '2d'; // '2d' or '3d'
let mapRotationAngle = -0.5;   // Rotation angle in radians (approx -30 deg)
let mapTiltAngle = 0.6;       // Tilt angle in radians (approx 35 deg)
let mapZoom = 1.0;
let mapOffsetX = 0.0;
let mapOffsetY = 0.0;
let isDraggingMap = false;
let dragStartX = 0;
let dragStartY = 0;
let hoveredNodeIndex = -1;    // Index in rawDataset

let mapMinLat = 90, mapMaxLat = -90, mapMinLon = 180, mapMaxLon = -180;

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
    initMapEvents();
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

    reader.onload = function (e) {
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

// Mathematical Projection (2D Flat vs 3D Isometric) with Zoom and Pan integrated
function projectPoint(lat, lon, elevRaw) {
    const canvas = document.getElementById("map-canvas");
    if (!canvas) return { x: 0, y: 0 };

    const xNorm = (lon - mapMinLon) / (mapMaxLon - mapMinLon || 0.01);
    const yNorm = 1.0 - (lat - mapMinLat) / (mapMaxLat - mapMinLat || 0.01); // Flip lat so North is up
    
    const elev = parseFloat(elevRaw) || 971.0;
    const zNorm = (elev - 971.0) / (3668.0 - 971.0 || 1.0); // max height approx 3668m
    
    let xProj, yProj;
    const paddingLeft = 65;
    const paddingBottom = 45;
    const paddingTop = 25;
    const paddingRight = 25;

    if (mapProjectionMode === '2d') {
        // Flat 2D mapping with padding for axes
        xProj = paddingLeft + xNorm * (canvas.width - paddingLeft - paddingRight);
        yProj = paddingTop + yNorm * (canvas.height - paddingTop - paddingBottom);
    } else {
        // 3D Isometric Projection
        const cosR = Math.cos(mapRotationAngle);
        const sinR = Math.sin(mapRotationAngle);
        
        const rx = (xNorm - 0.5) * cosR - (yNorm - 0.5) * sinR;
        const ry = (xNorm - 0.5) * sinR + (yNorm - 0.5) * cosR;
        
        xProj = rx * canvas.width * 0.7 + canvas.width * 0.5;
        // zNorm * 0.45 height deviation factor (uphill / downhill topography)
        yProj = (ry * Math.cos(mapTiltAngle) - zNorm * 0.45) * canvas.height * 0.7 + canvas.height * 0.55;
    }

    // Apply zoom and offset from the center of the canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    return {
        x: (xProj - centerX) * mapZoom + centerX + mapOffsetX,
        y: (yProj - centerY) * mapZoom + centerY + mapOffsetY
    };
}

function getCanvasCoordinates(lat, lon, elev) {
    return projectPoint(lat, lon, elev);
}

// Reverse projection helper (for hover checks, approximated for 2D/3D)
function getGeoCoordinates(canvasX, canvasY) {
    const canvas = document.getElementById("map-canvas");
    if (!canvas) return null;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    const rawX = (canvasX - mapOffsetX - centerX) / mapZoom + centerX;
    const rawY = (canvasY - mapOffsetY - centerY) / mapZoom + centerY;

    if (mapProjectionMode === '2d') {
        const paddingLeft = 65;
        const paddingBottom = 45;
        const paddingTop = 25;
        const paddingRight = 25;
        
        const innerWidth = canvas.width - paddingLeft - paddingRight;
        const innerHeight = canvas.height - paddingTop - paddingBottom;
        
        const lon = ((rawX - paddingLeft) / (innerWidth || 1)) * (mapMaxLon - mapMinLon) + mapMinLon;
        const lat = (1.0 - ((rawY - paddingTop) / (innerHeight || 1))) * (mapMaxLat - mapMinLat) + mapMinLat;
        return { lat, lon };
    } else {
        // 3D Isometric reverse approximation
        const cosR = Math.cos(-mapRotationAngle);
        const sinR = Math.sin(-mapRotationAngle);
        
        const rx = (rawX - canvas.width * 0.5) / (canvas.width * 0.7 || 1);
        const ry = (rawY - canvas.height * 0.55) / (canvas.height * 0.7 * Math.cos(mapTiltAngle) || 1);
        
        const xNorm = rx * cosR - ry * sinR + 0.5;
        const yNorm = rx * sinR + ry * cosR + 0.5;

        const lon = xNorm * (mapMaxLon - mapMinLon) + mapMinLon;
        const lat = (1.0 - yNorm) * (mapMaxLat - mapMinLat) + mapMinLat;
        return { lat, lon };
    }
}

function getTerrainHeightAndRisk(lon, lat) {
    if (!rawDataset || rawDataset.length === 0) return { elev: 1000, risk: 0 };

    // Find the closest point in rawDataset/filteredDataset
    let cellCol = Math.floor((lon - gridMinLon) / (gridCellSizeLon || 0.01));
    let cellRow = Math.floor((lat - gridMinLat) / (gridCellSizeLat || 0.01));
    
    let closestIdx = -1;
    let minDSq = Infinity;
    
    // Search a 3x3 neighborhood of buckets
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const nc = cellCol + dx;
            const nr = cellRow + dy;
            if (nc >= 0 && nc < gridCols && nr >= 0 && nr < gridRows) {
                const bucket = spatialGrid[nc][nr];
                for (let b = 0; b < bucket.length; b++) {
                    const idx = bucket[b];
                    const d = rawDataset[idx];
                    const dSq = (d.Longitude - lon) ** 2 + (d.Latitude - lat) ** 2;
                    if (dSq < minDSq) {
                        minDSq = dSq;
                        closestIdx = idx;
                    }
                }
            }
        }
    }
    
    if (closestIdx !== -1) {
        return {
            elev: parseFloat(rawDataset[closestIdx]['Elevation (m)']) || 1500,
            risk: predictions[closestIdx] || 0
        };
    }
    return { elev: 1000, risk: 0 };
}

function drawAxes(cCtx, width, height, pLeft, pBottom, pTop, pRight, baseMinLat, baseMaxLat, baseMinLon, baseMaxLon) {
    const leftGeo = getGeoCoordinates(pLeft, pTop);
    const rightGeo = getGeoCoordinates(width - pRight, pTop);
    const topGeo = getGeoCoordinates(pLeft, pTop);
    const bottomGeo = getGeoCoordinates(pLeft, height - pBottom);

    const currentMinLon = leftGeo ? leftGeo.lon : baseMinLon;
    const currentMaxLon = rightGeo ? rightGeo.lon : baseMaxLon;
    const currentMinLat = bottomGeo ? bottomGeo.lat : baseMinLat;
    const currentMaxLat = topGeo ? topGeo.lat : baseMaxLat;

    // Draw background for the axes padding areas to clear panned content
    cCtx.fillStyle = "#ffffff";
    cCtx.fillRect(0, 0, pLeft, height);
    cCtx.fillRect(0, height - pBottom, width, pBottom);
    cCtx.fillRect(width - pRight, 0, pRight, height);
    cCtx.fillRect(0, 0, width, pTop);

    // Draw axes lines
    cCtx.strokeStyle = "#475569"; // slate-600
    cCtx.lineWidth = 1.5;
    cCtx.font = "10px JetBrains Mono, monospace";
    cCtx.fillStyle = "#334155"; // slate-700
    cCtx.textAlign = "center";
    cCtx.textBaseline = "top";

    cCtx.beginPath();
    cCtx.moveTo(pLeft, height - pBottom);
    cCtx.lineTo(width - pRight, height - pBottom);
    cCtx.stroke();

    cCtx.beginPath();
    cCtx.moveTo(pLeft, pTop);
    cCtx.lineTo(pLeft, height - pBottom);
    cCtx.stroke();

    // Draw ticks and labels on X Axis (Longitude)
    const ticksX = 5;
    for (let i = 0; i <= ticksX; i++) {
        const pct = i / ticksX;
        const x = pLeft + pct * (width - pLeft - pRight);
        const lon = currentMinLon + pct * (currentMaxLon - currentMinLon);
        
        cCtx.beginPath();
        cCtx.moveTo(x, height - pBottom);
        cCtx.lineTo(x, height - pBottom + 5);
        cCtx.stroke();

        cCtx.fillText(`${lon.toFixed(4)}°E`, x, height - pBottom + 8);
    }

    // Draw ticks and labels on Y Axis (Latitude)
    cCtx.textAlign = "right";
    cCtx.textBaseline = "middle";
    const ticksY = 5;
    for (let i = 0; i <= ticksY; i++) {
        const pct = i / ticksY;
        const y = height - pBottom - pct * (height - pTop - pBottom);
        const lat = currentMinLat + pct * (currentMaxLat - currentMinLat);
        
        cCtx.beginPath();
        cCtx.moveTo(pLeft, y);
        cCtx.lineTo(pLeft - 5, y);
        cCtx.stroke();

        cCtx.fillText(`${lat.toFixed(4)}°N`, pLeft - 8, y);
    }

    // Axis Titles
    cCtx.fillStyle = "#1e293b";
    cCtx.font = "bold 10px Inter, sans-serif";
    cCtx.textAlign = "center";
    
    cCtx.fillText("LONGITUDE (EAST)", pLeft + (width - pLeft - pRight) / 2, height - 18);
    
    cCtx.save();
    cCtx.translate(15, pTop + (height - pTop - pBottom) / 2);
    cCtx.rotate(-Math.PI / 2);
    cCtx.fillText("LATITUDE (NORTH)", 0, 0);
    cCtx.restore();
}

function initMapEvents() {
    const canvas = document.getElementById("map-canvas");
    const btn2d = document.getElementById("btn-proj-2d");
    const btn3d = document.getElementById("btn-proj-3d");
    const rotSliderContainer = document.getElementById("rot-slider-container");
    const rotSlider = document.getElementById("filter-rotation");

    canvas.addEventListener("mousedown", (e) => {
        if (!rawDataset || rawDataset.length === 0) return;
        isDraggingMap = true;
        dragStartX = e.clientX - mapOffsetX;
        dragStartY = e.clientY - mapOffsetY;
    });

    window.addEventListener("mouseup", () => {
        isDraggingMap = false;
    });

    canvas.addEventListener("mousemove", (e) => {
        if (!rawDataset || rawDataset.length === 0) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isDraggingMap) {
            mapOffsetX = e.clientX - dragStartX;
            mapOffsetY = e.clientY - dragStartY;
            setupCanvasMap();
        } else {
            const geo = getGeoCoordinates(mouseX, mouseY);
            if (!geo) return;
            
            let cellCol = Math.floor((geo.lon - gridMinLon) / (gridCellSizeLon || 0.01));
            let cellRow = Math.floor((geo.lat - gridMinLat) / (gridCellSizeLat || 0.01));
            
            let foundIndex = -1;
            let minDistance = 14;

            if (cellCol >= 0 && cellCol < gridCols && cellRow >= 0 && cellRow < gridRows) {
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        const nc = cellCol + dx;
                        const nr = cellRow + dy;
                        if (nc >= 0 && nc < gridCols && nr >= 0 && nr < gridRows) {
                            const bucket = spatialGrid[nc][nr];
                            for (let b = 0; b < bucket.length; b++) {
                                const idx = bucket[b];
                                const d_lat = parseFloat(rawDataset[idx]['Latitude']);
                                const d_lon = parseFloat(rawDataset[idx]['Longitude']);
                                const pos = getCanvasCoordinates(d_lat, d_lon, rawDataset[idx]['Elevation (m)']);
                                
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
                if (foundIndex !== -1) {
                    updateTelemetryDisplay(foundIndex);
                } else {
                    resetTelemetryDisplay();
                }
                setupCanvasMap();
            }
        }
    });

    canvas.addEventListener("wheel", (e) => {
        if (!rawDataset || rawDataset.length === 0) return;
        e.preventDefault();
        const zoomIntensity = 0.08;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const geoBefore = getGeoCoordinates(mouseX, mouseY);
        if (!geoBefore) return;

        if (e.deltaY < 0) {
            mapZoom *= (1.0 + zoomIntensity);
        } else {
            mapZoom *= (1.0 - zoomIntensity);
        }
        mapZoom = Math.max(0.2, Math.min(30, mapZoom));

        const posAfter = getCanvasCoordinates(geoBefore.lat, geoBefore.lon, rawDataset[hoveredNodeIndex !== -1 ? hoveredNodeIndex : 0]['Elevation (m)']);
        mapOffsetX += (mouseX - posAfter.x);
        mapOffsetY += (mouseY - posAfter.y);

        setupCanvasMap();
    });

    btn2d.addEventListener("click", () => {
        btn2d.classList.add("active");
        btn3d.classList.remove("active");
        rotSliderContainer.classList.add("hidden");
        mapProjectionMode = '2d';
        setupCanvasMap();
    });

    btn3d.addEventListener("click", () => {
        btn3d.classList.add("active");
        btn2d.classList.remove("active");
        rotSliderContainer.classList.remove("hidden");
        mapProjectionMode = '3d';
        setupCanvasMap();
    });

    rotSlider.addEventListener("input", (e) => {
        mapRotationAngle = (parseFloat(e.target.value) * Math.PI) / 180;
        setupCanvasMap();
    });

    document.getElementById("btn-zoom-in").addEventListener("click", () => {
        mapZoom *= 1.25;
        setupCanvasMap();
    });

    document.getElementById("btn-zoom-out").addEventListener("click", () => {
        mapZoom *= 0.8;
        setupCanvasMap();
    });

    document.getElementById("btn-zoom-reset").addEventListener("click", () => {
        mapZoom = 1.0;
        mapOffsetX = 0.0;
        mapOffsetY = 0.0;
        setupCanvasMap();
    });

    document.querySelectorAll('input[name="map-layer"]').forEach(el => {
        el.addEventListener("change", () => {
            setupCanvasMap();
        });
    });

    document.getElementById("opt-edges").addEventListener("change", () => {
        setupCanvasMap();
    });

    document.getElementById("opt-streams").addEventListener("change", () => {
        setupCanvasMap();
    });
}

// Processing Pipeline
async function processDataset(data) {
    rawDataset = data;
    const loader = document.getElementById("loader");
    const loaderText = document.getElementById("loader-text");

    document.getElementById("laser").style.display = "block";

    // 1. Scale features
    loaderText.textContent = "SCALING ENVIRONMENTAL GEOPHYSICAL TENSORS...";
    await sleep(250);
    scaledFeatures = extractAndScaleFeatures(data);

    // 2. Build fast Spatial grid index
    loaderText.textContent = "INDEXING COORDINATES FOR FAST TOPOLOGICAL SEARCH...";
    await sleep(250);
    buildSpatialGridIndex(data);

    // 3. Build Spatial Graph
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

// Extract & scale features
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

// Build Spatial Grid Index
function buildSpatialGridIndex(data) {
    const N = data.length;

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

    gridCols = Math.max(5, Math.floor(Math.sqrt(N) / 4));
    gridRows = Math.max(5, Math.floor(Math.sqrt(N) / 4));

    const latSpan = gridMaxLat - gridMinLat || 0.01;
    const lonSpan = gridMaxLon - gridMinLon || 0.01;

    gridCellSizeLat = latSpan / gridRows;
    gridCellSizeLon = lonSpan / gridCols;

    spatialGrid = Array.from({ length: gridCols }, () =>
        Array.from({ length: gridRows }, () => [])
    );

    data.forEach((d, idx) => {
        const lat = parseFloat(d['Latitude']) || 0;
        const lon = parseFloat(d['Longitude']) || 0;

        let col = Math.floor((lon - gridMinLon) / gridCellSizeLon);
        let row = Math.floor((lat - gridMinLat) / gridCellSizeLat);

        col = Math.max(0, Math.min(gridCols - 1, col));
        row = Math.max(0, Math.min(gridRows - 1, row));

        spatialGrid[col][row].push(idx);
    });
}

// Grid-Accelerated Graph Construction
function buildSpatialGraph(data) {
    const N = data.length;
    graphEdges = [];
    nodeDegrees = new Int32Array(N);

    const coords = data.map(d => ({
        lat: parseFloat(d['Latitude']) || 0,
        lon: parseFloat(d['Longitude']) || 0
    }));

    for (let i = 0; i < N; i++) {
        graphEdges.push([i, i]);
        nodeDegrees[i] += 1;

        const c_i = coords[i];

        let col = Math.floor((c_i.lon - gridMinLon) / gridCellSizeLon);
        let row = Math.floor((c_i.lat - gridMinLat) / gridCellSizeLat);
        col = Math.max(0, Math.min(gridCols - 1, col));
        row = Math.max(0, Math.min(gridRows - 1, row));

        const candidates = [];

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
                        const dSq = (c_i.lat - c_j.lat) ** 2 + (c_i.lon - c_j.lon) ** 2;
                        candidates.push({ idx: j, dSq: dSq });
                    }
                }
            }
        }

        candidates.sort((a, b) => a.dSq - b.dSq);
        const k = Math.min(8, candidates.length);
        for (let idx = 0; idx < k; idx++) {
            const neighbor = candidates[idx].idx;
            graphEdges.push([i, neighbor]);
            nodeDegrees[neighbor] += 1;
        }
    }
}

// GCN inference
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

    const h1 = Array.from({ length: N }, () => new Float32Array(64));
    for (let i = 0; i < N; i++) {
        const conv_i = layer1Conv[i];
        const h1_i = h1[i];
        for (let h = 0; h < 64; h++) {
            h1_i[h] = Math.max(0.0, conv_i[h]);
        }
    }

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

    const h2 = Array.from({ length: N }, () => new Float32Array(64));
    for (let i = 0; i < N; i++) {
        const conv_i = layer2Conv[i];
        const h2_i = h2[i];
        for (let h = 0; h < 64; h++) {
            h2_i[h] = Math.max(0.0, conv_i[h]);
        }
    }

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

// Populate Woreda Dropdown
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

// Apply filters
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

        if (slope < slopeThresh) return;
        if (rain < rainThresh) return;
        if (ndvi > ndviThresh) return;
        if (woredaVal !== 'all' && woreda !== woredaVal) return;

        row._rawIndex = idx;
        filtered.push(row);
    });

    filteredDataset = filtered;
    console.log(`Filtered size: ${filteredDataset.length}`);

    updateStatsAndCharts();
    setupCanvasMap();
}

// Update stats and charts
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

// Clear telemetry display
function resetTelemetryDisplay() {
    document.getElementById("telemetry-placeholder").classList.remove("hidden");
    document.getElementById("telemetry-content").classList.add("hidden");
}

// Update telemetry display on hover
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

    // NDVI bar: range -0.2 to 1.0 (invert color: low NDVI is dangerous (red), high NDVI is safe (green))
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

// 6. Interactive Canvas Map Rendering (O(N) rendering & offscreen buffering)
let offscreenCanvas = null;
let offscreenCtx = null;
function setupCanvasMap() {
    const canvas = document.getElementById("map-canvas");
    const container = document.getElementById("map-container");
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const ctx = canvas.getContext("2d");

    if (!filteredDataset || filteredDataset.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.font = "14px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No coordinates match active filters.", canvas.width / 2, canvas.height / 2);
        return;
    }

    // Update global map boundaries
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
    
    mapMinLat = minLat - latSpan * 0.06;
    mapMaxLat = maxLat + latSpan * 0.06;
    mapMinLon = minLon - lonSpan * 0.06;
    mapMaxLon = maxLon + lonSpan * 0.06;

    // Offscreen Canvas Initialization
    if (!offscreenCanvas || offscreenCanvas.width !== canvas.width || offscreenCanvas.height !== canvas.height) {
        offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        offscreenCtx = offscreenCanvas.getContext("2d");
    }

    offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    const showEdges = document.getElementById("opt-edges").checked;
    const showStreams = document.getElementById("opt-streams").checked;
    const mapType = document.querySelector('input[name="map-layer"]:checked').value;

    const paddingLeft = 65;
    const paddingBottom = 45;
    const paddingTop = 25;
    const paddingRight = 25;

    // Draw background
    offscreenCtx.fillStyle = "#ffffff";
    offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // Save and clip for 2D mode so map does not draw over axes margins
    offscreenCtx.save();
    if (mapProjectionMode === '2d') {
        offscreenCtx.beginPath();
        offscreenCtx.rect(paddingLeft, paddingTop, canvas.width - paddingLeft - paddingRight, canvas.height - paddingTop - paddingBottom);
        offscreenCtx.clip();
    }

    // A. Draw Grid Lines (light background)
    offscreenCtx.lineWidth = 0.5;
    offscreenCtx.strokeStyle = "#e5e7eb";
    
    if (mapProjectionMode === '2d') {
        // Draw grid lines inside the clipped map area
        const leftGeo = getGeoCoordinates(paddingLeft, paddingTop);
        const rightGeo = getGeoCoordinates(canvas.width - paddingRight, paddingTop);
        const topGeo = getGeoCoordinates(paddingLeft, paddingTop);
        const bottomGeo = getGeoCoordinates(paddingLeft, canvas.height - paddingBottom);
        
        if (leftGeo && rightGeo && topGeo && bottomGeo) {
            const startLon = Math.floor(leftGeo.lon * 20) / 20;
            const endLon = Math.ceil(rightGeo.lon * 20) / 20;
            for (let lon = startLon; lon <= endLon; lon += 0.05) {
                const p = projectPoint(leftGeo.lat, lon, 1000);
                offscreenCtx.beginPath();
                offscreenCtx.moveTo(p.x, paddingTop);
                offscreenCtx.lineTo(p.x, canvas.height - paddingBottom);
                offscreenCtx.stroke();
            }
            
            const startLat = Math.floor(bottomGeo.lat * 20) / 20;
            const endLat = Math.ceil(topGeo.lat * 20) / 20;
            for (let lat = startLat; lat <= endLat; lat += 0.05) {
                const p = projectPoint(lat, leftGeo.lon, 1000);
                offscreenCtx.beginPath();
                offscreenCtx.moveTo(paddingLeft, p.y);
                offscreenCtx.lineTo(canvas.width - paddingRight, p.y);
                offscreenCtx.stroke();
            }
        }
    } else {
        // 3D mode background grid lines
        for (let x = 50; x < offscreenCanvas.width; x += 100) {
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(x, 0);
            offscreenCtx.lineTo(x, offscreenCanvas.height);
            offscreenCtx.stroke();
        }
        for (let y = 50; y < offscreenCanvas.height; y += 100) {
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(0, y);
            offscreenCtx.lineTo(offscreenCanvas.width, y);
            offscreenCtx.stroke();
        }
    }

    // B. Draw 3D Terrain grid mesh (3D mode only)
    if (mapProjectionMode === '3d') {
        const meshCols = 25;
        const meshRows = 25;
        const gridVertices = Array.from({ length: meshCols }, () => Array.from({ length: meshRows }));
        
        // 1. Compute all vertex positions
        for (let c = 0; c < meshCols; c++) {
            for (let r = 0; r < meshRows; r++) {
                const lon = mapMinLon + (c / (meshCols - 1)) * (mapMaxLon - mapMinLon);
                const lat = mapMinLat + (r / (meshRows - 1)) * (mapMaxLat - mapMinLat);
                const data = getTerrainHeightAndRisk(lon, lat);
                
                const proj = projectPoint(lat, lon, data.elev);
                const projBase = projectPoint(lat, lon, 971.0); 
                
                gridVertices[c][r] = {
                    proj: proj,
                    projBase: projBase,
                    elev: data.elev,
                    risk: data.risk,
                    lon: lon,
                    lat: lat
                };
            }
        }
        
        const faces = [];
        
        // 2. Add terrain grid faces
        for (let c = 0; c < meshCols - 1; c++) {
            for (let r = 0; r < meshRows - 1; r++) {
                const v00 = gridVertices[c][r];
                const v10 = gridVertices[c+1][r];
                const v11 = gridVertices[c+1][r+1];
                const v01 = gridVertices[c][r+1];
                
                const avgY = (v00.proj.y + v10.proj.y + v11.proj.y + v01.proj.y) / 4;
                
                faces.push({
                    type: 'terrain',
                    corners: [v00.proj, v10.proj, v11.proj, v01.proj],
                    avgY: avgY,
                    avgElev: (v00.elev + v10.elev + v11.elev + v01.elev) / 4,
                    avgRisk: (v00.risk + v10.risk + v11.risk + v01.risk) / 4
                });
            }
        }
        
        // 3. Add skirt faces (geological block sides)
        // Bottom skirt
        for (let c = 0; c < meshCols - 1; c++) {
            const v0 = gridVertices[c][0];
            const v1 = gridVertices[c+1][0];
            const avgY = (v0.proj.y + v1.proj.y + v1.projBase.y + v0.projBase.y) / 4;
            faces.push({
                type: 'skirt',
                corners: [v0.proj, v1.proj, v1.projBase, v0.projBase],
                avgY: avgY
            });
        }
        // Top skirt
        for (let c = 0; c < meshCols - 1; c++) {
            const v0 = gridVertices[c][meshRows - 1];
            const v1 = gridVertices[c+1][meshRows - 1];
            const avgY = (v0.proj.y + v1.proj.y + v1.projBase.y + v0.projBase.y) / 4;
            faces.push({
                type: 'skirt',
                corners: [v0.proj, v1.proj, v1.projBase, v0.projBase],
                avgY: avgY
            });
        }
        // Left skirt
        for (let r = 0; r < meshRows - 1; r++) {
            const v0 = gridVertices[0][r];
            const v1 = gridVertices[0][r+1];
            const avgY = (v0.proj.y + v1.proj.y + v1.projBase.y + v0.projBase.y) / 4;
            faces.push({
                type: 'skirt',
                corners: [v0.proj, v1.proj, v1.projBase, v0.projBase],
                avgY: avgY
            });
        }
        // Right skirt
        for (let r = 0; r < meshRows - 1; r++) {
            const v0 = gridVertices[meshCols - 1][r];
            const v1 = gridVertices[meshCols - 1][r+1];
            const avgY = (v0.proj.y + v1.proj.y + v1.projBase.y + v0.projBase.y) / 4;
            faces.push({
                type: 'skirt',
                corners: [v0.proj, v1.proj, v1.projBase, v0.projBase],
                avgY: avgY
            });
        }
        
        // 4. Sort faces back-to-front
        faces.sort((a, b) => a.avgY - b.avgY);
        
        // 5. Draw faces
        faces.forEach(face => {
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(face.corners[0].x, face.corners[0].y);
            for (let i = 1; i < face.corners.length; i++) {
                offscreenCtx.lineTo(face.corners[i].x, face.corners[i].y);
            }
            offscreenCtx.closePath();
            
            if (face.type === 'skirt') {
                offscreenCtx.fillStyle = "rgba(71, 85, 105, 0.85)"; 
                offscreenCtx.fill();
                offscreenCtx.strokeStyle = "rgba(51, 65, 85, 0.4)";
                offscreenCtx.lineWidth = 0.5;
                offscreenCtx.stroke();
            } else {
                let color = "";
                if (mapType === "risk") {
                    if (face.avgRisk > 0.71) {
                        color = "rgba(239, 68, 68, 0.75)"; 
                    } else if (face.avgRisk > 0.25) {
                        color = "rgba(249, 115, 22, 0.75)"; 
                    } else {
                        color = "rgba(34, 197, 94, 0.75)"; 
                    }
                } else if (mapType === "elevation") {
                    const normElev = (face.avgElev - 971) / (3668 - 971);
                    color = `rgba(22, 101, 52, ${0.15 + normElev * 0.85})`;
                } else if (mapType === "ndvi") {
                    color = `rgba(5, 150, 105, 0.65)`;
                } else if (mapType === "rainfall") {
                    color = `rgba(37, 99, 235, 0.65)`;
                }
                
                offscreenCtx.fillStyle = color;
                offscreenCtx.fill();
                
                offscreenCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
                offscreenCtx.lineWidth = 0.5;
                offscreenCtx.stroke();
            }
        });
    }

    // C. Draw Graph Edges (2D only)
    if (showEdges && graphEdges && mapProjectionMode === '2d') {
        offscreenCtx.lineWidth = 0.4;
        offscreenCtx.strokeStyle = "rgba(100, 116, 139, 0.12)"; // light gray
        
        const activeSet = new Set(filteredDataset.map(d => d._rawIndex));
        
        graphEdges.forEach(([u, v]) => {
            if (u === v) return;
            if (!activeSet.has(u) || !activeSet.has(v)) return;

            const p_u = projectPoint(parseFloat(rawDataset[u]['Latitude']), parseFloat(rawDataset[u]['Longitude']), rawDataset[u]['Elevation (m)']);
            const p_v = projectPoint(parseFloat(rawDataset[v]['Latitude']), parseFloat(rawDataset[v]['Longitude']), rawDataset[v]['Elevation (m)']);
            
            offscreenCtx.beginPath();
            offscreenCtx.moveTo(p_u.x, p_u.y);
            offscreenCtx.lineTo(p_v.x, p_v.y);
            offscreenCtx.stroke();
        });
    }

    // D. Draw Water Streams (SPI Overlay)
    if (showStreams && graphEdges) {
        offscreenCtx.lineWidth = mapProjectionMode === '2d' ? 0.9 : 1.5;
        offscreenCtx.strokeStyle = "rgba(59, 130, 246, 0.65)"; // Blue streams
        
        const activeSet = new Set(filteredDataset.map(d => d._rawIndex));
        
        graphEdges.forEach(([u, v]) => {
            if (u === v) return;
            if (!activeSet.has(u) || !activeSet.has(v)) return;
            
            const spi_u = parseFloat(rawDataset[u]['SPI']) || 0;
            const spi_v = parseFloat(rawDataset[v]['SPI']) || 0;

            if (spi_u > 0.003 || spi_v > 0.003) {
                const p_u = projectPoint(parseFloat(rawDataset[u]['Latitude']), parseFloat(rawDataset[u]['Longitude']), rawDataset[u]['Elevation (m)']);
                const p_v = projectPoint(parseFloat(rawDataset[v]['Latitude']), parseFloat(rawDataset[v]['Longitude']), rawDataset[v]['Elevation (m)']);
                offscreenCtx.beginPath();
                offscreenCtx.moveTo(p_u.x, p_u.y);
                offscreenCtx.lineTo(p_v.x, p_v.y);
                offscreenCtx.stroke();
            }
        });
    }

    // E. Draw Nodes
    filteredDataset.forEach((d) => {
        const rawIdx = d._rawIndex;
        const lat = parseFloat(d['Latitude']);
        const lon = parseFloat(d['Longitude']);
        const pos = projectPoint(lat, lon, d['Elevation (m)']);

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
            color = `rgba(22, 101, 52, ${0.15 + elevNorm * 0.85})`;
        } else if (mapType === "ndvi") {
            const ndviNorm = scaledFeatures[rawIdx][4];
            color = `rgba(5, 150, 105, ${0.1 + ndviNorm * 0.9})`;
        } else if (mapType === "rainfall") {
            const rainNorm = scaledFeatures[rawIdx][3];
            color = `rgba(37, 99, 235, ${0.15 + rainNorm * 0.85})`;
        }

        offscreenCtx.beginPath();
        offscreenCtx.arc(pos.x, pos.y, mapProjectionMode === '2d' ? 2.5 : 3.0, 0, 2 * Math.PI);
        offscreenCtx.fillStyle = color;
        offscreenCtx.fill();
        
        offscreenCtx.strokeStyle = "rgba(0, 0, 0, 0.15)";
        offscreenCtx.lineWidth = 0.5;
        offscreenCtx.stroke();
    });

    offscreenCtx.restore(); // Restore clip context

    // Draw frame and axes inside the main drawMap function
    function drawMap() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(offscreenCanvas, 0, 0);

        // Highlight ring
        if (hoveredNodeIndex !== -1 && hoveredNodeIndex < rawDataset.length) {
            const d = rawDataset[hoveredNodeIndex];
            const prob = predictions[hoveredNodeIndex];
            const lat = parseFloat(d['Latitude']);
            const lon = parseFloat(d['Longitude']);
            
            const pos = getCanvasCoordinates(lat, lon, d['Elevation (m)']);

            let color = "var(--accent-mint)";
            if (prob > 0.71) color = "var(--alert-red)";
            else if (prob > 0.25) color = "var(--alert-orange)";

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 7, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 14, 0, 2 * Math.PI);
            ctx.lineWidth = 1.0;
            ctx.strokeStyle = color;
            ctx.stroke();
        }

        // Draw Axes in 2D mode
        if (mapProjectionMode === '2d') {
            drawAxes(ctx, canvas.width, canvas.height, paddingLeft, paddingBottom, paddingTop, paddingRight, minLat, maxLat, minLon, maxLon);
        }
    }

    drawMap();
}

// AI recommendations Box
function generateAIInsights(avgRisk, severePoints, totalNodes, avgSlopeSevere, avgRainSevere, avgNdviSevere) {
    const list = document.getElementById("recommendations-list");
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

// Charts
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
