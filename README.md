# Semi-Supervised Spatial Graph Convolutional Networks for Early Detection of Soil Erosion

<div align="center">
  <img src="assets/plot_7.png" alt="Erosion Topology Output" width="80%">
</div>

## 📖 Executive Summary
This repository contains the research and implementation of a novel AI architecture designed to predict soil erosion vulnerability in the Amhara region of Ethiopia. By leveraging a **Semi-Supervised Graph Convolutional Network (GCN)**, we modeled over **255,000 spatial coordinates** as an interconnected mathematical mesh, vastly outperforming traditional isolated predictive models.

## 🧭 The Journey: From Failure to Breakthrough
Initially, this research attempted to solve the soil erosion detection problem using a combination of **Auto-Encoders, Deep Embedding Clustering, and pure RUSLE calculations**. 

However, this initial approach treated the geospatial data as isolated single points. It proved to be **highly ineffective and inconsistent**. Single-point analysis fails to capture fundamental laws of physics: hydrologic flow, gravity, and neighboring topographical features (e.g., a flat pixel located directly below a collapsing 70-degree cliff).

To solve this, we pivoted to an advanced topological approach.

## 🔬 Methodology Sequence
The final methodology implemented in the `Early Detection of Soil Erosion.ipynb` follows this strict sequence:

### 1. Feature Engineering & Dataset Construction
The dataset was engineered to mathematically represent the mechanical properties of Ethiopian terrain:
*   **Soil Cohesiveness (K-Factor):** Replaced non-mathematical categorical data with physical vulnerability coefficients (e.g., Pellic Vertisols at 0.15, Eutric Regosols at 0.40).
*   **Hydro-Topography:** Incorporated `Slope`, `Stream Power Index (SPI)`, and `Rainfall`.
*   **Vegetation:** Applied `NDVI` as a mathematical protective factor.

### 2. Physics-Informed Hard Bounding (Ground Truth Generation)
Because we lacked exhaustive ground-truth labels, we developed a bounding method using a pseudo-RUSLE localized severity score: `(Slope × Rainfall × SPI × K-Factor) / NDVI`.
*   **Top 5% Extreme Danger:** Hardcoded as `Label 1 (Severe Erosion)`.
*   **Bottom 5% Extreme Safety:** Hardcoded as `Label 0 (Safe)`.
*   **The Unknown Matrix:** The remaining 90% of the map (~230,000 nodes) was left entirely blank (`NaN`) for the AI to computationally deduce.

<div align="center">
  <img src="assets/plot_3.png" alt="Data Bounding" width="70%">
</div>

### 3. Constructing Graph Topology
Using `SciPy cKDTree`, the raw map was converted into a computational mesh where every node was mathematically tethered to its 8 closest neighbors based on absolute euclidean distance.

### 4. Semi-Supervised Graph Convolutional Network (GCN)
During training, the GCN evaluated the 10% known source nodes. Danger signals were formally transmitted across the graph edges. This created an **Avalanche Effect**—if a blank farmland pixel was discovered sitting directly downhill from a dangerous slope, the GCN's internal algorithms physically pulled the danger score downhill, correctly escalating its risk assessment in defiance of its base statistics.

<div align="center">
  <img src="assets/plot_6.png" alt="GCN Network Output" width="70%">
</div>

### 5. Actionable Output: Mathematical Variance
The continuous probability outputs were translated into exact policy intervention tiers using **Jenks Natural Breaks Optimization**:
*   **Low Risk (Safe):** 138,225 spatial nodes (Boundary: < 0.25)
*   **Moderate Risk (Monitor):** 32,057 spatial nodes
*   **Severe Risk (Immediate Action):** 84,747 spatial nodes (Boundary: > 0.71)

## 📊 Validation & Results
We utilized an advanced **5-Fold Geographic Cross-validation** structured strictly by Woreda borders. The AI was forced to comprehend universal slope physics and rainfall algorithms in 4 territorial chunks before being dropped completely blind into the hidden Woreda.
*   **Overall Predictive Accuracy:** **93.89%**
*   **The Physics Proof:** The 84,747 nodes sorted into "Severe Risk" perfectly aggregated the sharpest relative slopes (0.37 avg), the worst soil erodibility factors (0.273 avg), and the highest water destruction stream rates (0.0045 avg SPI). This mathematically confirms the AI successfully mastered localized topography.

<div align="center">
  <img src="assets/plot_9.png" alt="Results Summary" width="70%">
</div>

## 📂 Repository Guide

*   **`Semi_Supervised_Graph_Pipeline_FINAL.ipynb`**: The streamlined version of the GCN pipeline.

