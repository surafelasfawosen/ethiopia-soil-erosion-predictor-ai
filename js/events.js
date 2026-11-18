// Event Handlers for UI Filter Controls, Drag-Drop Telemetry Loading, and Map Interactions

// Drag-and-Drop file uploads initialization
function initDragDrop() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");
    if (!dropzone || !fileInput) return;

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

// File Reader pipeline for uploaded spreadsheets/CSV
async function handleUploadedFile(file) {
    const loader = document.getElementById("loader");
    const loaderText = document.getElementById("loader-text");
    if (loader) loader.classList.remove("hidden");
    if (loaderText) loaderText.textContent = "INITIALIZING FILE INGESTION...";

    // 1. Ultra-Fast Path: If PyTorch Backend is online, upload directly to server
    if (isPythonBackendActive) {
        loaderText.textContent = "PROCESSING VIA HIGH-SPEED PYTORCH AI ENGINE...";
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch(`${pythonBackendUrl}/api/upload`, {
                method: "POST",
                body: formData
            });

            if (res.ok) {
                const json = await res.json();
                if (json.status === "success" && json.rows && json.rows.length > 0) {
                    console.log(`✅ PyTorch Backend ingested ${json.total_rows} rows in ~1s. Visualizing ${json.analyzed_points} key nodes.`);
                    originalDatasetCount = json.total_rows;
                    rawDataset = json.rows;
                    predictions = new Float32Array(json.predictions);

                    loaderText.textContent = "GENERATING TOPOLOGICAL GRAPH OVERLAY...";
                    await sleep(30);
                    buildSpatialGridIndex(rawDataset);
                    buildSpatialGraph(rawDataset);
                    populateWoredaDropdown(rawDataset);
                    applyDynamicFilters();

                    if (loader) loader.classList.add("hidden");
                    return;
                }
            }
        } catch (err) {
            console.warn("Direct upload to PyTorch backend encountered an issue, using client-side parser:", err);
        }
    }

    // 2. Client-Side Parsing Fallback (Offline Mode)
    loaderText.textContent = "PARSING TELEMETRY FILE LOCALLY...";
    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = function (e) {
        setTimeout(() => {
            try {
                let data = [];
                if (isExcel) {
                    if (loaderText) loaderText.textContent = "PARSING SPREADSHEET...";
                    const arrayBuffer = e.target.result;
                    const workbook = XLSX.read(arrayBuffer, { type: 'array', dense: true, sheetRows: 4000 });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    data = XLSX.utils.sheet_to_json(worksheet);
                } else {
                    if (loaderText) loaderText.textContent = "PARSING CSV RECORDS...";
                    const csvText = e.target.result;
                    data = parseCSV(csvText);
                }

                if (!data || data.length === 0) {
                    throw new Error("Dataset is empty.");
                }

                console.log(`Successfully parsed ${data.length} rows.`);
                processDataset(data);

            } catch (err) {
                alert(`Error reading file: ${err.message}`);
                if (loader) loader.classList.add("hidden");
            }
        }, 30);
    };

    if (isExcel) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}


// Filters input & range control listeners
function initFilterHandlers() {
    const filters = ['filter-slope', 'filter-rainfall', 'filter-ndvi', 'filter-woreda'];

    filters.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id !== 'filter-woreda') {
            el.addEventListener("input", (e) => {
                const label = document.getElementById(`${id}-val`);
                if (label) label.textContent = e.target.value;
                applyDynamicFilters();
            });
        } else {
            el.addEventListener("change", applyDynamicFilters);
        }
    });

    const btnReset = document.getElementById("btn-reset-filters");
    if (btnReset) {
        btnReset.addEventListener("click", () => {
            const slopeInput = document.getElementById("filter-slope");
            if (slopeInput) {
                slopeInput.value = 0;
                const val = document.getElementById("filter-slope-val");
                if (val) val.textContent = "0";
            }

            const rainInput = document.getElementById("filter-rainfall");
            if (rainInput) {
                rainInput.value = 0;
                const val = document.getElementById("filter-rainfall-val");
                if (val) val.textContent = "0";
            }

            const ndviInput = document.getElementById("filter-ndvi");
            if (ndviInput) {
                ndviInput.value = 1.0;
                const val = document.getElementById("filter-ndvi-val");
                if (val) val.textContent = "1.0";
            }

            const woredaSelect = document.getElementById("filter-woreda");
            if (woredaSelect) {
                woredaSelect.value = "all";
            }

            applyDynamicFilters();
        });
    }
}

// Map interactions: zoom, pan dragging, rotate, tilt
function initMapEvents() {
    const canvas = document.getElementById("map-canvas");
    const btn2d = document.getElementById("btn-proj-2d");
    const btn3d = document.getElementById("btn-proj-3d");
    const rotSliderContainer = document.getElementById("rot-slider-container");
    const rotSlider = document.getElementById("filter-rotation");

    if (!canvas) return;

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

    if (btn2d) {
        btn2d.addEventListener("click", () => {
            btn2d.classList.add("active");
            if (btn3d) btn3d.classList.remove("active");
            if (rotSliderContainer) rotSliderContainer.classList.add("hidden");
            mapProjectionMode = '2d';
            setupCanvasMap();
        });
    }

    if (btn3d) {
        btn3d.addEventListener("click", () => {
            btn3d.classList.add("active");
            if (btn2d) btn2d.classList.remove("active");
            if (rotSliderContainer) rotSliderContainer.classList.remove("hidden");
            mapProjectionMode = '3d';
            setupCanvasMap();
        });
    }

    if (rotSlider) {
        rotSlider.addEventListener("input", (e) => {
            mapRotationAngle = (parseFloat(e.target.value) * Math.PI) / 180;
            setupCanvasMap();
        });
    }

    const zoomIn = document.getElementById("btn-zoom-in");
    if (zoomIn) {
        zoomIn.addEventListener("click", () => {
            mapZoom *= 1.25;
            setupCanvasMap();
        });
    }

    const zoomOut = document.getElementById("btn-zoom-out");
    if (zoomOut) {
        zoomOut.addEventListener("click", () => {
            mapZoom *= 0.8;
            setupCanvasMap();
        });
    }

    const zoomReset = document.getElementById("btn-zoom-reset");
    if (zoomReset) {
        zoomReset.addEventListener("click", () => {
            mapZoom = 1.0;
            mapOffsetX = 0.0;
            mapOffsetY = 0.0;
            setupCanvasMap();
        });
    }

    document.querySelectorAll('input[name="map-layer"]').forEach(el => {
        el.addEventListener("change", () => {
            setupCanvasMap();
        });
    });

    const optEdges = document.getElementById("opt-edges");
    if (optEdges) {
        optEdges.addEventListener("change", () => {
            setupCanvasMap();
        });
    }

    const optStreams = document.getElementById("opt-streams");
    if (optStreams) {
        optStreams.addEventListener("change", () => {
            setupCanvasMap();
        });
    }
}
