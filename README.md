# Terrashield AI™ — Green Legacy Soil Erosion Analyzer & Predictor
> **High-Fidelity Geospatial Land Degradation Platform Powered by Graph Convolutional Networks (GCN)**

[![Live Demo](https://img.shields.io/badge/Live%20Prototype-Open%20Dashboard-brightgreen?style=for-the-badge&logo=googlechrome)](https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-blue?style=for-the-badge&logo=github)](https://github.com/surafelasfawosen/ethiopia-soil-erosion-predictor-ai)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python)](https://www.python.org/)
[![PyTorch](https://img.shields.io/badge/PyTorch-GCN-EE4C2C?style=flat-square&logo=pytorch)](https://pytorch.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## 🌐 Live Prototype & Interactive Demo

You can interact with the live, fully functional prototype directly in your browser:

### 🔗 **[Launch Terrashield AI™ Live Dashboard](https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/)**

> **Note for Evaluators & Reviewers:**
> The live web version runs the trained **Graph Convolutional Network (GCN)** neural model directly in the browser using client-side tensor weights (`models/Erosion_GCN_Weights.json`). No local server installation or setup is needed to review the prototype!

---

## 📊 Dataset Access (Google Drive)

The full satellite telemetry dataset covering 150,000+ woreda coordinate data points across the Amhara region is available for download:

* **Primary Dataset:** `Merged_Woredas_150k.xlsx` (~21 MB)
* **Download Link:** [**Download Telemetry Dataset from Google Drive**](PASTE_GOOGLE_DRIVE_LINK_HERE)

### How to Test with the Dataset:
1. Open the [Live Dashboard](https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/).
2. Drag and drop the downloaded `.xlsx` file directly into the **Satellite Telemetry Input** box.
3. The platform will automatically extract 33 geomorphic & climate tensors, construct spatial KD-Tree graphs, execute the GCN model forward pass, and project the 2D/3D risk terrain in real-time.

---

## 🚀 Local Quick Start (Desktop Installation)

For running with the full local Python PyTorch acceleration backend on Windows:

### Method 1: 1-Click Launch (Recommended)
Simply **double-click**:
```cmd
▶ RUN_DASHBOARD.bat
```
This automatically:
1. Detects Python and initializes the native PyTorch AI backend (`models/Erosion_GCN_Model.pth` & `models/Erosion_MinMaxScaler.pkl`).
2. Automatically falls back to offline browser mode if Python is not present.
3. Launches Microsoft Edge directly to `http://localhost:8000`.

---

### Method 2: Command Line (CMD or PowerShell)
1. Install dependencies:
```bash
pip install -r requirements.txt
```
2. Start the FastAPI acceleration engine:
```bash
python server.py
```
3. Open your browser and navigate to:
```
http://localhost:8000
```

---

## 🧠 System Architecture & AI Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                 TELEMETRY SPREADSHEET INPUT                 │
│              (e.g., Merged_Woredas_150k.xlsx)               │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 FEATURE EXTRACTION & SCALING                │
│       • 10 Continuous Geomorphic & Climate Tensors          │
│       • Calibrated via models/Erosion_MinMaxScaler.pkl      │
│       • Aspect Trigonometric Vector Decomposition           │
│       • 20 Categorical Geology & Land Use Encodings         │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             SPATIAL GRAPH CONVOLUTION (KD-TREE)             │
│       • Spatial Euclidean Topologies via KD-Tree            │
│       • Symmetric Degree Normalization:                     │
│         D^(-1/2) * (A + I) * D^(-1/2)                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  PYTORCH GCN FORWARD PASS                   │
│       • models/Erosion_GCN_Model.pth                        │
│       • Layer 1: ConvLinear(33 -> 64) + Graph Norm + ReLU   │
│       • Layer 2: ConvLinear(64 -> 64) + Graph Norm + ReLU   │
│       • Classifier: Linear(64 -> 2) + Softmax               │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 INTERACTIVE WEB DASHBOARD                   │
│       • 2D/3D Terrain Projection with Elevation Shading     │
│       • Dynamic Real-Time Geophysical Filter Sliders        │
│       • Soil Erodibility Risk & Stressor Charts             │
│       • Targeted Ecological Mitigation Proposals            │
└─────────────────────────────────────────────────────────────┘
```

---

## 📂 Project Directory Structure

```
├── index.html                    <-- Dashboard Single-Page Application (GitHub Pages)
├── dashboard.css                 <-- High-contrast dark glassmorphism UI styling
├── js/
│   ├── state.js                  <-- Global reactive application state
│   ├── model.js                  <-- AI model coordinator & dual runtime engine
│   ├── graph.js                  <-- Spatial KD-Tree graph edge construction
│   ├── map.js                    <-- HTML5 Canvas 2D/3D geospatial renderer
│   ├── ui.js                     <-- Telemetry cards, charts & mitigation reports
│   ├── events.js                 <-- Drag-and-drop & filter event listeners
│   ├── main.js                   <-- Application entry point & downsampler
│   └── libs/                     <-- Standalone local JS libraries (Chart.js, SheetJS)
├── models/
│   ├── Erosion_GCN_Model.pth     <-- Trained PyTorch Model State Dict (29 KB)
│   ├── Erosion_MinMaxScaler.pkl  <-- Feature Scaler Metadata (1.5 KB)
│   └── Erosion_GCN_Weights.json  <-- Exported weights for client runtime (188 KB)
├── server.py                     <-- High-performance FastAPI PyTorch server
├── ai_engine.py                  <-- Native PyTorch GCN inference engine
├── RUN_DASHBOARD.bat             <-- 1-Click launcher (Server + Browser)
├── requirements.txt              <-- Python package dependencies
└── README.md                     <-- Documentation and live demo guide
```

---

## 🎯 How to Present & Demonstrate

1. Open the **[Live Dashboard](https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/)** (or double-click `RUN_DASHBOARD.bat` locally).
2. Point out the top header:
   - Status indicator confirming AI engine readiness.
   - Dual-mode architecture (PyTorch backend when local, GCN Web runtime when hosted).
3. Drag & drop `Merged_Woredas_150k.xlsx` into the telemetry upload zone.
4. Demonstrate the interactive **2D / 3D terrain switch** with tilt and rotation controls.
5. Adjust the **Geophysical Sliders** (Slope Angle, Rainfall, NDVI) to show real-time risk filtering.
6. Hover over any coordinate node to display its live soil telemetry (Elevation, K-Factor, SPI, Geology, Land Use).
7. Review the **Targeted Ecological Mitigation Proposals** generated dynamically at the bottom.

---

## 👥 Authors & Acknowledgments

* **Founder & Lead AI Engineer:** Surafel Asfawosen
* **Initiative:** Green Legacy AI Soil Erosion Predictor / Terrashield AI™
* **Contact:** `yishtal@gmail.com`
