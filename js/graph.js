// Grid-Accelerated Spatial Graph Construction Logic

// Build Spatial Grid Index for fast spatial queries
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
