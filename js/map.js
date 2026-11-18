// Interactive Canvas Map Rendering (2D/3D Topography, Skirt Mesh, and Axes Projections)

let offscreenCanvas = null;
let offscreenCtx = null;

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

// Find closest elevation & risk values from 3x3 spatial grid index neighborhood
function getTerrainHeightAndRisk(lon, lat) {
    if (!rawDataset || rawDataset.length === 0) return { elev: 1000, risk: 0 };

    let cellCol = Math.floor((lon - gridMinLon) / (gridCellSizeLon || 0.01));
    let cellRow = Math.floor((lat - gridMinLat) / (gridCellSizeLat || 0.01));
    
    let closestIdx = -1;
    let minDSq = Infinity;
    
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

// Draw Map Axes (Latitude and Longitude grid lines)
function drawAxes(cCtx, width, height, pLeft, pBottom, pTop, pRight, baseMinLat, baseMaxLat, baseMinLon, baseMaxLon) {
    const leftGeo = getGeoCoordinates(pLeft, pTop);
    const rightGeo = getGeoCoordinates(width - pRight, pTop);
    const topGeo = getGeoCoordinates(pLeft, pTop);
    const bottomGeo = getGeoCoordinates(pLeft, height - pBottom);

    const currentMinLon = leftGeo ? leftGeo.lon : baseMinLon;
    const currentMaxLon = rightGeo ? rightGeo.lon : baseMaxLon;
    const currentMinLat = bottomGeo ? bottomGeo.lat : baseMinLat;
    const currentMaxLat = topGeo ? topGeo.lat : baseMaxLat;

    // Draw dark background for axes padding areas
    cCtx.fillStyle = "#020d05";
    cCtx.fillRect(0, 0, pLeft, height);
    cCtx.fillRect(0, height - pBottom, width, pBottom);
    cCtx.fillRect(width - pRight, 0, pRight, height);
    cCtx.fillRect(0, 0, width, pTop);

    // Draw axes lines
    cCtx.strokeStyle = "rgba(0, 255, 136, 0.25)";
    cCtx.lineWidth = 1;
    cCtx.font = "9px JetBrains Mono, monospace";
    cCtx.fillStyle = "rgba(0, 255, 136, 0.55)";
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
        cCtx.lineTo(x, height - pBottom + 4);
        cCtx.stroke();

        cCtx.fillText(`${lon.toFixed(4)}°E`, x, height - pBottom + 6);
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
        cCtx.lineTo(pLeft - 4, y);
        cCtx.stroke();

        cCtx.fillText(`${lat.toFixed(4)}°N`, pLeft - 6, y);
    }

    // Axis Titles
    cCtx.fillStyle = "rgba(0, 255, 136, 0.45)";
    cCtx.font = "bold 9px Space Grotesk, Inter, sans-serif";
    cCtx.textAlign = "center";
    
    cCtx.fillText("LONGITUDE (EAST)", pLeft + (width - pLeft - pRight) / 2, height - 14);
    
    cCtx.save();
    cCtx.translate(12, pTop + (height - pTop - pBottom) / 2);
    cCtx.rotate(-Math.PI / 2);
    cCtx.fillText("LATITUDE (NORTH)", 0, 0);
    cCtx.restore();
}

// Core drawing method called whenever user updates filters, drags, or zooms the map
function setupCanvasMap() {
    const canvas = document.getElementById("map-canvas");
    const container = document.getElementById("map-container");
    if (!canvas || !container) return;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    const ctx = canvas.getContext("2d");

    if (!filteredDataset || filteredDataset.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#020d05";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(0, 255, 136, 0.35)";
        ctx.font = "13px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText("NO COORDINATES MATCH ACTIVE FILTERS", canvas.width / 2, canvas.height / 2);
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

    // Draw dark background
    offscreenCtx.fillStyle = "#020d05";
    offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // Save and clip for 2D mode so map does not draw over axes margins
    offscreenCtx.save();
    if (mapProjectionMode === '2d') {
        offscreenCtx.beginPath();
        offscreenCtx.rect(paddingLeft, paddingTop, canvas.width - paddingLeft - paddingRight, canvas.height - paddingTop - paddingBottom);
        offscreenCtx.clip();
    }

    // A. Draw Grid Lines (dark theme)
    offscreenCtx.lineWidth = 0.5;
    offscreenCtx.strokeStyle = "rgba(0, 255, 136, 0.06)";
    
    if (mapProjectionMode === '2d') {
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
                offscreenCtx.fillStyle = "rgba(5, 25, 12, 0.92)";
                offscreenCtx.fill();
                offscreenCtx.strokeStyle = "rgba(0, 255, 136, 0.08)";
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
                
                offscreenCtx.strokeStyle = "rgba(0, 0, 0, 0.25)";
                offscreenCtx.lineWidth = 0.4;
                offscreenCtx.stroke();
            }
        });
    }

    // C. Draw Graph Edges (2D only)
    if (showEdges && graphEdges && mapProjectionMode === '2d') {
        offscreenCtx.lineWidth = 0.4;
        offscreenCtx.strokeStyle = "rgba(0, 255, 136, 0.10)";
        
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
        
        offscreenCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        offscreenCtx.lineWidth = 0.4;
        offscreenCtx.stroke();
    });

    offscreenCtx.restore(); // Restore clip context

    // Render offscreen context onto visible screen canvas
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
            ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
            ctx.stroke();

            // Outer glow ring
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 13, 0, 2 * Math.PI);
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.6;
            ctx.stroke();
            ctx.globalAlpha = 1.0;

            // Outer pulsing ring
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
            ctx.lineWidth = 0.7;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.25;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }

        // Draw Axes in 2D mode
        if (mapProjectionMode === '2d') {
            drawAxes(ctx, canvas.width, canvas.height, paddingLeft, paddingBottom, paddingTop, paddingRight, minLat, maxLat, minLon, maxLon);
        }
    }

    drawMap();
}
