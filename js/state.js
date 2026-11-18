// State variables for Green Legacy AI Soil Erosion Analyzer
let gcnWeights = null;
let rawDataset = null;      // Holds the original uploaded rows
let filteredDataset = null; // Holds the currently filtered subset of rows
let scaledFeatures = [];    // Normalized float vectors [N, 33]
let graphEdges = [];        // Graph connections [[u, v], ...]
let nodeDegrees = null;     // Degree array for normalization
let predictions = null;     // Calculated risk probabilities

// Python PyTorch AI Backend State
let pythonBackendUrl = "http://127.0.0.1:8000";
let isPythonBackendActive = false;
let backendMetadata = null;

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

// Original uploaded dataset size (before LOD downsampling)
let originalDatasetCount = 0;

// Chart references
let riskChart = null;
let stressorChart = null;
