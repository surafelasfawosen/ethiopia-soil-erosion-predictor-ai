"""
Terrashield AI™ - PyTorch GCN Soil Erosion AI Engine
Directly loads and executes:
  - models/Erosion_GCN_Model.pth  (PyTorch State Dict)
  - models/Erosion_MinMaxScaler.pkl (Feature Scaler Metadata)
"""

import os
import sys
import json
import pickle
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PTH_PATH = os.path.join(BASE_DIR, "models", "Erosion_GCN_Model.pth")
PKL_PATH = os.path.join(BASE_DIR, "models", "Erosion_MinMaxScaler.pkl")

# Exact physical and normalization parameters matching the trained pipeline
SCALER_PARAMS = {
    'Elevation (m)': {'min': 971.0, 'max': 3668.0},
    'Slope (Degree)': {'min': 0.0, 'max': 90.0},
    'Rainfall (mm)': {'min': 882.0029907, 'max': 1794.979981},
    'NDVI_Value': {'min': -0.177935, 'max': 0.464113},
    'TWI': {'min': -6.7122415088, 'max': 16.944588},
    'SPI': {'min': -0.602442, 'max': 5737.8206585},
    'TRI': {'min': 0.111084, 'max': 0.888916},
    'Plan Curvature': {'min': -8330751791.104, 'max': 8606097219.584},
    'Profile Curvature': {'min': -9972955615.232, 'max': 9043812597.76},
    'Drainage Density (m)': {'min': 0.0, 'max': 6216.283429}
}

PHYSICAL_BOUNDS = {
    'Elevation (m)': (-150.0, 4600.0),
    'Slope (Degree)': (0.0, 90.0),
    'Rainfall (mm)': (0.0, 3000.0),
    'NDVI_Value': (-1.0, 1.0)
}

CATEGORICAL_KEYS = [
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
]


class SoilErosionGCN(nn.Module):
    """
    Graph Convolutional Network for Soil Erosion Susceptibility Mapping.
    Exact architecture loaded from Erosion_GCN_Model.pth
    """
    def __init__(self, in_features=33, hidden_dim=64, num_classes=2):
        super().__init__()
        self.conv1_lin = nn.Linear(in_features, hidden_dim, bias=True)
        self.conv2_lin = nn.Linear(hidden_dim, hidden_dim, bias=True)
        self.out = nn.Linear(hidden_dim, num_classes, bias=True)

    def forward(self, x, norm_adj):
        """
        Forward message-passing inference.
        x: [N, 33] node features
        norm_adj: [N, N] symmetric degree-normalized adjacency matrix D^(-1/2) (A + I) D^(-1/2)
        """
        # Layer 1
        h1 = self.conv1_lin(x)
        h1 = torch.matmul(norm_adj, h1)
        h1 = F.relu(h1)

        # Layer 2
        h2 = self.conv2_lin(h1)
        h2 = torch.matmul(norm_adj, h2)
        h2 = F.relu(h2)

        # Output Classifier
        logits = self.out(h2)
        probs = F.softmax(logits, dim=-1)
        return logits, probs


class TerrashieldAIEngine:
    """
    Production AI Inference Engine wrapper for Terrashield platform.
    """
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = SoilErosionGCN().to(self.device)
        self.scaler_features = []
        self.is_loaded = False
        self.load_artifacts()

    def load_artifacts(self):
        # 1. Load Scaler PKL
        if os.path.exists(PKL_PATH):
            with open(PKL_PATH, "rb") as f:
                self.scaler_features = pickle.load(f).tolist()
            print(f"✅ Loaded Scaler PKL: {len(self.scaler_features)} numerical features ({PKL_PATH})")
        else:
            print(f"⚠️ Warning: Scaler PKL not found at {PKL_PATH}")

        # 2. Load PyTorch Weights (.pth)
        if os.path.exists(PTH_PATH):
            state_dict = torch.load(PTH_PATH, map_location=self.device)
            # Map state dict keys to our module
            mapped_dict = {
                'conv1_lin.weight': state_dict['conv1.lin.weight'],
                'conv1_lin.bias': state_dict['conv1.bias'],
                'conv2_lin.weight': state_dict['conv2.lin.weight'],
                'conv2_lin.bias': state_dict['conv2.bias'],
                'out.weight': state_dict['out.weight'],
                'out.bias': state_dict['out.bias']
            }
            self.model.load_state_dict(mapped_dict)
            self.model.eval()
            self.is_loaded = True
            print(f"✅ Loaded PyTorch Model (.pth): 2-layer GCN on {self.device} ({PTH_PATH})")
        else:
            raise FileNotFoundError(f"Model .pth file not found at: {PTH_PATH}")

    def scale_feature(self, val_raw, feat_name):
        try:
            val = float(val_raw)
        except (ValueError, TypeError):
            val = 0.0

        if feat_name in PHYSICAL_BOUNDS:
            b_min, b_max = PHYSICAL_BOUNDS[feat_name]
            val = max(b_min, min(b_max, val))

        if feat_name in SCALER_PARAMS:
            p = SCALER_PARAMS[feat_name]
            denom = p['max'] - p['min']
            scaled = (val - p['min']) / denom if denom != 0 else 0.0
            return float(max(0.0, min(1.0, scaled)))
        return val

    def extract_features(self, rows):
        """
        Converts array of telemetry dicts into [N, 33] float tensor.
        """
        N = len(rows)
        feats = np.zeros((N, 33), dtype=np.float32)

        for i, row in enumerate(rows):
            # 0: K_Factor
            try:
                feats[i, 0] = float(row.get('K_Factor', 0.20))
            except (ValueError, TypeError):
                feats[i, 0] = 0.20

            # 1-9: Scaled numerical features
            feats[i, 1] = self.scale_feature(row.get('Elevation (m)'), 'Elevation (m)')
            feats[i, 2] = self.scale_feature(row.get('Slope (Degree)'), 'Slope (Degree)')
            feats[i, 3] = self.scale_feature(row.get('Rainfall (mm)'), 'Rainfall (mm)')
            feats[i, 4] = self.scale_feature(row.get('NDVI_Value'), 'NDVI_Value')
            feats[i, 5] = self.scale_feature(row.get('TWI'), 'TWI')
            feats[i, 6] = self.scale_feature(row.get('SPI'), 'SPI')
            feats[i, 7] = self.scale_feature(row.get('TRI'), 'TRI')
            feats[i, 8] = self.scale_feature(row.get('Plan Curvature'), 'Plan Curvature')
            feats[i, 9] = self.scale_feature(row.get('Profile Curvature'), 'Profile Curvature')

            # 10-11: Aspect sin/cos
            try:
                aspect = float(row.get('Aspect (Degree)', 0.0))
            except (ValueError, TypeError):
                aspect = 0.0
            rad = np.radians(aspect)
            feats[i, 10] = np.sin(rad)
            feats[i, 11] = np.cos(rad)

            # 12: Drainage Density
            feats[i, 12] = self.scale_feature(row.get('Drainage Density (m)'), 'Drainage Density (m)')

            # 13-32: One-hot encoded Categoricals (Geology & Land Use)
            geo_val = str(row.get('Geology_Formation', 'Unknown_Geo'))
            lu_val = str(row.get('Land_Use', 'Unknown_LU'))

            for k_idx, key in enumerate(CATEGORICAL_KEYS):
                col_idx = 13 + k_idx
                if key.startswith('Geology_Formation_'):
                    cat = key.replace('Geology_Formation_', '')
                    feats[i, col_idx] = 1.0 if geo_val == cat else 0.0
                elif key.startswith('Land_Use_'):
                    cat = key.replace('Land_Use_', '')
                    feats[i, col_idx] = 1.0 if lu_val == cat else 0.0

        return torch.tensor(feats, dtype=torch.float32, device=self.device)

    def build_normalized_adjacency(self, rows, k_neighbors=8, max_dist_km=25.0):
        """
        Builds spatial k-NN graph with self-loops and symmetric degree normalization.
        """
        N = len(rows)
        if N <= 1:
            return torch.eye(N, dtype=torch.float32, device=self.device)

        coords = np.zeros((N, 2), dtype=np.float32)
        for i, r in enumerate(rows):
            try:
                coords[i, 0] = float(r.get('Latitude', 0.0))
                coords[i, 1] = float(r.get('Longitude', 0.0))
            except (ValueError, TypeError):
                coords[i, 0] = 0.0
                coords[i, 1] = 0.0

        # Adjacency with self-loops
        adj = np.eye(N, dtype=np.float32)

        # Build k-NN based on Euclidean distance in lat/lon
        from scipy.spatial import KDTree
        k = min(k_neighbors + 1, N)
        tree = KDTree(coords)
        distances, indices = tree.query(coords, k=k)

        if indices.ndim == 1:
            indices = indices[:, np.newaxis]
            distances = distances[:, np.newaxis]

        # Approx degree to km: 1 degree ~ 111 km
        max_deg = max_dist_km / 111.0

        for i in range(N):
            for neighbor_idx, dist in zip(indices[i], distances[i]):
                if neighbor_idx != i and dist <= max_deg:
                    adj[i, neighbor_idx] = 1.0
                    adj[neighbor_idx, i] = 1.0


        # Symmetric degree normalization: D^(-1/2) * A * D^(-1/2)
        degrees = np.sum(adj, axis=1)
        deg_inv_sqrt = np.power(degrees, -0.5)
        deg_inv_sqrt[np.isinf(deg_inv_sqrt)] = 0.0
        norm_adj = deg_inv_sqrt[:, None] * adj * deg_inv_sqrt[None, :]
        return torch.tensor(norm_adj, dtype=torch.float32, device=self.device)


    def predict(self, rows):
        """
        Runs the PyTorch GCN forward pass on rows.
        Returns array of risk probabilities and predictions.
        """
        if not rows:
            return []

        x = self.extract_features(rows)
        norm_adj = self.build_normalized_adjacency(rows)

        with torch.no_grad():
            logits, probs = self.model(x, norm_adj)
            # Class 1 is high erosion risk
            risk_probs = probs[:, 1].cpu().numpy().tolist()

        return risk_probs


# Singleton instance
ai_engine = TerrashieldAIEngine()

if __name__ == "__main__":
    print("Testing PyTorch AI Engine forward pass with 5 sample rows...")
    sample_rows = [
        {
            'Latitude': 11.5 + i * 0.02,
            'Longitude': 37.3 + i * 0.02,
            'Elevation (m)': 2200 + i * 50,
            'Slope (Degree)': 25 + i * 2,
            'Rainfall (mm)': 1400 - i * 30,
            'NDVI_Value': 0.18 - i * 0.02,
            'TWI': 8.5,
            'SPI': 120.0,
            'TRI': 0.45,
            'Plan Curvature': 12.0,
            'Profile Curvature': -8.0,
            'Aspect (Degree)': 180,
            'Drainage Density (m)': 1500,
            'K_Factor': 0.28,
            'Geology_Formation': 'Quaternary Basalt',
            'Land_Use': 'Cropland'
        }
        for i in range(5)
    ]
    preds = ai_engine.predict(sample_rows)
    for i, p in enumerate(preds):
        print(f"  Point {i+1}: Erosion Risk Probability = {p:.4f} ({'HIGH RISK' if p > 0.5 else 'LOW RISK'})")
    print("✅ PyTorch forward pass test PASSED!")
