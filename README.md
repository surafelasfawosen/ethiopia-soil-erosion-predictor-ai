# Semi-Supervised Spatial Graph Convolutional Networks for Early Detection of Soil Erosion in Ethiopia across 5 Amhara Region Woredas: Ankober, Kewet, Menjar, Menze Gera, and Merabete.

<div align="center">

[![Live Interactive Dashboard](https://img.shields.io/badge/Live%20Prototype-Open%20Dashboard-brightgreen?style=for-the-badge&logo=googlechrome)](https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/)
[![Full Research Paper](https://img.shields.io/badge/Research%20Paper-View%20Publication-blue?style=for-the-badge&logo=googledocs)](https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/paper.html)
[![Dataset Access](https://img.shields.io/badge/Dataset-Download%20Telemetry%20(.xlsx)-orange?style=for-the-badge&logo=googledrive)](https://docs.google.com/spreadsheets/d/10YDMYTRMXBLV66RVWlivHyKGwsBnCG1o/export?format=xlsx)

  <h3><a href="https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/">🌿 Launch Live Interactive Prototype Dashboard</a> &nbsp;|&nbsp; <a href="https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/paper.html">🌐 View Full Published Research Paper</a></h3>
</div>

---

## 🚀 Live Interactive Prototype & Dataset Access

### 1. 🌐 Live Web Prototype
The full interactive geospatial dashboard is deployed and directly accessible in your browser without requiring local installation:
* **Live Dashboard URL:** **[https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/](https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/)**
* **Client-Side AI Inference:** Runs the trained Graph Convolutional Network (GCN) tensor weights (`models/Erosion_GCN_Weights.json`) directly in the client browser, supporting 2D/3D geospatial visualization, dynamic risk filtering, and targeted ecological mitigation proposals.

### 2. 📊 Dataset Download (Google Drive / Sheets)
The complete satellite telemetry dataset for all 5 Woredas is accessible below:
* **View / Open in Google Sheets:** [**Open Telemetry Dataset**](https://docs.google.com/spreadsheets/d/10YDMYTRMXBLV66RVWlivHyKGwsBnCG1o/edit?usp=sharing&ouid=115711897313806711621&rtpof=true&sd=true)
* **Direct Download (.xlsx format):** [**Download Merged_Woredas_150k.xlsx**](https://docs.google.com/spreadsheets/d/10YDMYTRMXBLV66RVWlivHyKGwsBnCG1o/export?format=xlsx)
* **How to Test in Prototype:** Open the [Live Dashboard](https://surafelasfawosen.github.io/ethiopia-soil-erosion-predictor-ai/) and drag-and-drop the downloaded `.xlsx` file into the upload dropzone (or click the download link inside the dashboard).

---

## 📖 Executive Summary
This repository contains the research and implementation of a novel AI architecture designed to predict soil erosion vulnerability in the Amhara region of Ethiopia. By leveraging a **Semi-Supervised Graph Convolutional Network (GCN)**, I modeled over **255,000 spatial coordinates** as an interconnected mathematical mesh, vastly outperforming traditional isolated predictive models.

## 🧭 The Journey: From Failure to Breakthrough
Initially, this research attempted to solve the soil erosion detection problem using a combination of **Auto-Encoders, Deep Embedding Clustering, and pure RUSLE calculations**. 

However, this initial approach treated the geospatial data as isolated single points. It proved to be **highly ineffective and inconsistent**. Single-point analysis fails to capture fundamental laws of physics: hydrologic flow, gravity, and neighboring topographical features (e.g., a flat pixel located directly below a collapsing 70-degree cliff).

To solve this, I pivoted to an advanced topological approach.

## 🔬 Methodology Sequence
The final methodology implemented in the `Early Detection of Soil Erosion.ipynb` follows this strict sequence:

### 1. Feature Engineering & Dataset Construction
The dataset was engineered to mathematically represent the mechanical properties of Ethiopian terrain:
*   **Soil Cohesiveness (K-Factor):** Replaced non-mathematical categorical data with physical vulnerability coefficients (e.g., Pellic Vertisols at 0.15, Eutric Regosols at 0.40).
*   **Hydro-Topography:** Incorporated `Slope`, `Stream Power Index (SPI)`, and `Rainfall`.
*   **Vegetation:** Applied `NDVI` as a mathematical protective factor.

### 2. Physics-Informed Hard Bounding (Ground Truth Generation)
Because I lacked exhaustive ground-truth labels, I developed a bounding method using a pseudo-RUSLE localized severity score: `(Slope × Rainfall × SPI × K-Factor) / NDVI`.
*   **Top 5% Extreme Danger:** Hardcoded as `Label 1 (Severe Erosion)`.
*   **Bottom 5% Extreme Safety:** Hardcoded as `Label 0 (Safe)`.
*   **The Unknown Matrix:** The remaining 90% of the map (~230,000 nodes) was left entirely blank (`NaN`) for the AI to computationally deduce.

### 3. Constructing Graph Topology
To create the base "mind" of the AI, I needed to teach it how to perceive space. Using `SciPy cKDTree`, the raw map was converted into a computational mesh where every node was mathematically tethered to its 8 closest neighbors based on absolute euclidean distance. This interconnected mesh serves as the neural foundation for the AI to understand geographical relationships.

<div align="center">
  <img src="assets/plot_2.png" alt="Graph Construction Topology" width="70%">
</div>

### 4. Semi-Supervised Graph Convolutional Network (GCN)
I engineered the GCN to directly understand the real-world geographical topology of the soil. By processing the interconnected mesh, my AI mathematically perceives the landscape not as isolated pixels, but as a continuous physical environment where forces like gravity and water flow naturally interact across boundaries.

During training, the GCN evaluated the 10% known source nodes. Danger signals were formally transmitted across the graph edges. This created an **Avalanche Effect**—if a blank farmland pixel was discovered sitting directly downhill from a dangerous slope, the GCN's internal algorithms physically pulled the danger score downhill, correctly escalating its risk assessment in defiance of its base statistics.

<div align="center">
  <img src="assets/plot_3.png" alt="Data Bounding" width="70%">
</div>

<div align="center">
  <img src="assets/plot_6.png" alt="GCN Network Output" width="70%">
</div>

### 5. Actionable Output: Mathematical Variance
The continuous probability outputs were translated into exact policy intervention tiers using **Jenks Natural Breaks Optimization**:
*   **Low Risk (Safe):** 138,225 spatial nodes (Boundary: < 0.25)
*   **Moderate Risk (Monitor):** 32,057 spatial nodes
*   **Severe Risk (Immediate Action):** 84,747 spatial nodes (Boundary: > 0.71)

## 📊 Validation & Results
I utilized an advanced **5-Fold Geographic Cross-validation** structured strictly by Woreda borders. The AI was forced to comprehend universal slope physics and rainfall algorithms in 4 territorial chunks before being dropped completely blind into the hidden Woreda.
*   **Overall Predictive Accuracy:** **93.89%**
*   **The Physics Proof:** The 84,747 nodes sorted into "Severe Risk" perfectly aggregated the sharpest relative slopes (0.37 avg), the worst soil erodibility factors (0.273 avg), and the highest water destruction stream rates (0.0045 avg SPI). This mathematically confirms the AI successfully mastered localized topography.

<div align="center">
  <img src="assets/plot_13.png" alt="Validation Results" width="70%">
</div>

## 📂 Repository Guide

*   **`index.html`**: The interactive Single-Page Application (SPA) dashboard for live browser deployment.
*   **`dashboard.css`**: Modern dark glassmorphism styling for 2D/3D map and telemetry cards.
*   **`js/`**: Modular front-end and client-side AI inference pipeline (`model.js`, `graph.js`, `map.js`, `ui.js`, `events.js`, `main.js`).
*   **`models/`**:
    *   `Erosion_GCN_Weights.json`: Exported GCN neural weights for client browser runtime.
    *   `Erosion_GCN_Model.pth`: Native PyTorch trained state dictionary.
    *   `Erosion_MinMaxScaler.pkl`: Feature normalization scaler metadata.
*   **`Semi_Supervised_Graph_Pipeline_FINAL.ipynb`**: The streamlined version of the GCN pipeline.
*   **`paper.html`**: The full published research paper readable online.
*   **`server.py` & `ai_engine.py`**: High-performance FastAPI server with PyTorch GCN inference.
*   **`RUN_DASHBOARD.bat`**: 1-click launcher for local server execution on Windows.
