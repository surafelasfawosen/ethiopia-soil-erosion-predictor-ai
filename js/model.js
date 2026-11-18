// GCN Model Inference and Normalization logic

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

// ─────────────────────────────────────────────────────────────────
// Python PyTorch AI Backend Detection & Model Synchronization
// Directly connects to server.py running models/Erosion_GCN_Model.pth
// and models/Erosion_MinMaxScaler.pkl, with instant client-side fallback.
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
async function checkPythonBackend() {
    const endpoints = [];
    if (window.location.protocol.startsWith("http")) {
        endpoints.push(`${window.location.origin}/api/status`);
    }
    endpoints.push("http://127.0.0.1:8000/api/status");
    endpoints.push("http://localhost:8000/api/status");

    const uniqueEndpoints = [...new Set(endpoints)];

    for (const url of uniqueEndpoints) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 600);
            const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
            clearTimeout(timer);
            if (res.ok) {
                const data = await res.json();
                if (data && data.status === "online") {
                    pythonBackendUrl = url.replace("/api/status", "");
                    isPythonBackendActive = true;
                    backendMetadata = data;
                    console.log(`✅ Connected to Python PyTorch Backend: ${pythonBackendUrl}`);
                    console.log(`   Model: ${data.pth_file} | Scaler: ${data.scaler_file} | Device: ${data.device}`);
                    return true;
                }
            }
        } catch (e) {
            // Check next candidate
        }
    }
    isPythonBackendActive = false;
    return false;
}


// ─────────────────────────────────────────────────────────────────
// Load GCN weights — works from BOTH file:// and http:// origins.
// ─────────────────────────────────────────────────────────────────
async function loadGCNWeights() {
    const sysState = document.getElementById("system-state");
    const satDot   = document.getElementById("sat-dot");

    if (sysState) { sysState.textContent = "INITIALIZING AI ENGINE..."; sysState.className = "sat-status-value"; }
    if (satDot)   { satDot.className = "sat-status-dot"; }

    // 1. First probe for live Python PyTorch server (.pth + .pkl)
    const backendOnline = await checkPythonBackend();
    if (backendOnline) {
        if (sysState) {
            sysState.textContent = "PYTORCH BACKEND ONLINE (pth + pkl)";
            sysState.className = "sat-status-value ready";
            sysState.title = `PyTorch Engine Active: ${backendMetadata.pth_file} & ${backendMetadata.scaler_file} on ${backendMetadata.device}`;
        }
        if (satDot) {
            satDot.className = "sat-status-dot active";
            satDot.style.background = "#2ed573";
        }
    }

    // 2. Also load local JSON weights for offline / fallback capability
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "./models/Erosion_GCN_Weights.json", true);
        xhr.responseType = "json";
        xhr.timeout = 30000;

        xhr.onload = () => {
            try {
                const data = xhr.response;
                if (!data) throw new Error("Model file empty or JSON parse failed.");

                const required = [
                    "conv1.lin.weight", "conv1.bias",
                    "conv2.lin.weight", "conv2.bias",
                    "out.weight", "out.bias"
                ];
                const missing = required.filter(k => !(k in data));
                if (missing.length > 0) throw new Error("Missing weight keys: " + missing.join(", "));

                gcnWeights = data;
                const hiddenDim = data["conv1.lin.weight"].length;
                console.log(`✅ GCN Weights loaded: 2-layer GCN, hidden_dim=${hiddenDim}, input_dim=33, output_classes=2`);

                if (!isPythonBackendActive) {
                    if (sysState) {
                        sysState.textContent = "CLIENT GCN ENGINE READY";
                        sysState.className = "sat-status-value ready";
                        sysState.title = "Client GCN Active. Run start_ai_backend.bat for PyTorch (.pth + .pkl) server mode.";
                    }
                    if (satDot) {
                        satDot.className = "sat-status-dot active";
                        satDot.style.background = "#2ed573";
                    }
                }
            } catch (err) {
                console.error("❌ Weight validation error:", err.message);
                if (!isPythonBackendActive) {
                    _gcnOffline(sysState, satDot, err.message);
                }
            }
            resolve();
        };

        xhr.onerror = () => {
            if (!isPythonBackendActive) {
                _gcnOffline(sysState, satDot, "Cannot read ./models/Erosion_GCN_Weights.json");
            }
            resolve();
        };

        xhr.ontimeout = () => {
            if (!isPythonBackendActive) {
                _gcnOffline(sysState, satDot, "Timeout reading model weights (>30s)");
            }
            resolve();
        };

        xhr.send();
    });
}

function _gcnOffline(sysState, satDot, reason) {
    console.error("ENGINE OFFLINE:", reason);
    if (sysState) { sysState.textContent = "ENGINE OFFLINE"; sysState.className = "sat-status-value offline"; }
    if (satDot)   { satDot.className = "sat-status-dot"; satDot.style.background = "#ff4757"; }
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
