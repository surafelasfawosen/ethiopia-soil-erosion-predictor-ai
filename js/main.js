// Application Entry Coordinator, CSV Parsing, and Pipeline Orchestration

// App entry point
document.addEventListener("DOMContentLoaded", async () => {
    initDragDrop();
    initFilterHandlers();
    initMapEvents();
    await loadGCNWeights();
});

// CSV Raw String Text Parser
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

// Processing Pipeline Coordinator
async function processDataset(data) {
    originalDatasetCount = data.length;
    let processedData = data;
    if (data.length > 2500) {
        const step = Math.ceil(data.length / 2500);
        processedData = [];
        for (let i = 0; i < data.length; i += step) {
            processedData.push(data[i]);
        }
        console.log(`Optimized telemetry dataset from ${data.length} to ${processedData.length} nodes for real-time responsiveness.`);
    }

    rawDataset = processedData;
    const loader = document.getElementById("loader");
    const loaderText = document.getElementById("loader-text");

    document.getElementById("laser").style.display = "block";

    // 1. Scale features
    loaderText.textContent = "SCALING ENVIRONMENTAL GEOPHYSICAL TENSORS...";
    await sleep(20);
    scaledFeatures = extractAndScaleFeatures(rawDataset);

    // 2. Build fast Spatial grid index
    loaderText.textContent = "INDEXING COORDINATES FOR FAST TOPOLOGICAL SEARCH...";
    await sleep(20);
    buildSpatialGridIndex(rawDataset);

    // 3. Build Spatial Graph
    loaderText.textContent = "CONSTRUCTING HYDROLOGICAL SPATIAL EDGES...";
    await sleep(20);
    buildSpatialGraph(rawDataset);


    // 4. Run AI Model Inference (Native PyTorch .pth + .pkl Backend or Client GCN)
    let usedPyTorchBackend = false;
    if (isPythonBackendActive) {
        loaderText.textContent = "RUNNING PYTORCH GCN (Erosion_GCN_Model.pth & .pkl)...";
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout for large datasets
            const response = await fetch(`${pythonBackendUrl}/api/predict`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: rawDataset }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const resJson = await response.json();
                if (resJson.status === "success" && resJson.predictions && resJson.predictions.length === rawDataset.length) {
                    predictions = new Float32Array(resJson.predictions);
                    usedPyTorchBackend = true;
                    console.log(`✅ PyTorch GCN Backend inference complete: ${predictions.length} points calculated using ${resJson.source} on ${resJson.device}`);
                }
            }
        } catch (backendErr) {
            console.warn("PyTorch Backend request failed or timed out. Falling back to client-side GCN runtime:", backendErr);
        }
    }

    if (!usedPyTorchBackend) {
        loaderText.textContent = "RUNNING CLIENT GCN ENGINE PREDICTIONS...";
        await sleep(400);
        runGCNInference();
    }

    // 5. Populate Woreda Filter options
    populateWoredaDropdown(rawDataset);

    // 6. Apply filters and trigger dashboard update
    applyDynamicFilters();

    if (loader) loader.classList.add("hidden");
    document.getElementById("laser").style.display = "none";
}

// Populate Woreda filter selector options
function populateWoredaDropdown(data) {
    const dropdown = document.getElementById("filter-woreda");
    if (!dropdown) return;
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

// Apply sliders & woreda inputs to downsample/filter dataset
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

// Time sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
