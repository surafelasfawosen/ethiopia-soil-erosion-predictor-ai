import json

# Read the original file
with open('Semi_Supervised_Graph_Pipeline.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

def create_markdown_cell(source):
    return {"cell_type": "markdown", "metadata": {}, "source": [source]}

def create_code_cell(source):
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [source]}

# --- FIX 1: Missing Value Imputation (Spatial GIS) ---
# Insert after Cell 3 (Index 5 & 6)
imputation_md = create_markdown_cell("## 3b. Scientific Preprocessing: Spatial GIS Interpolation\nWe use **Spatial Interpolation (Inverse Distance Weighting via KNN)** based strictly on geographic coordinates (Lat/Lon). If a point is missing data, its exact neighbors determine the value, strictly following Tobler's First Law of Geography.")
imputation_code = create_code_cell([
    "from sklearn.neighbors import KNeighborsRegressor\n",
    "import numpy as np\n",
    "\n",
    "continuous_cols = ['Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', \n",
    "                   'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)']\n",
    "\n",
    "print('Scanning for missing environmental features...')\n",
    "missing_counts = df[continuous_cols].isnull().sum()\n",
    "\n",
    "if missing_counts.sum() > 0:\n",
    "    print('Executing Scientific Spatial Interpolation (IDW)...')\n",
    "    coords = df[['Latitude', 'Longitude']].values\n",
    "    for col in continuous_cols:\n",
    "        if df[col].isnull().any():\n",
    "            missing_mask = df[col].isnull()\n",
    "            known_mask = ~missing_mask\n",
    "            \n",
    "            X_known, y_known = coords[known_mask], df.loc[known_mask, col].values\n",
    "            X_missing = coords[missing_mask]\n",
    "            \n",
    "            spatial_imputer = KNeighborsRegressor(n_neighbors=5, weights='distance', n_jobs=-1)\n",
    "            spatial_imputer.fit(X_known, y_known)\n",
    "            df.loc[missing_mask, col] = spatial_imputer.predict(X_missing)\n",
    "            print(f'Interpolated missing geometry for: {col}')\n",
    "else:\n",
    "    print('No missing values found! Skipping interpolation.')\n"
])

# Insert cells
nb['cells'].insert(7, imputation_md)
nb['cells'].insert(8, imputation_code)


# --- FIX 2: Target RUSLE Justification ---
# Old Target cell was index 8, but shifted +2 -> Index 10
nb['cells'][10]['source'] = [
    "# Justification of RUSLE Formula (A = R * K * LS * C)\n",
    "# 1. R-Factor ~ Rainfall (mm)\n",
    "# 2. K-Factor ~ Soil Cohesiveness\n",
    "# 3. LS-Factor Proxy ~ sin(slope)^1.3\n",
    "# 4. C-Factor Proxy ~ mathematically derived from NDVI\n",
    "import numpy as np\n",
    "import matplotlib.pyplot as plt\n",
    "import seaborn as sns\n",
    "\n",
    "df['c_factor_proxy'] = np.where(df['NDVI_Value'] > 0, np.exp(-2 * df['NDVI_Value'] / (1 - df['NDVI_Value'])), 1.0)\n",
    "df['ls_factor_proxy'] = np.power(np.sin(np.radians(df['Slope (Degree)'])), 1.3)\n",
    "\n",
    "# EXACT RELATIVE RUSLE SCORE\n",
    "df['Raw_Risk_Score'] = df['Rainfall (mm)'] * df['K_Factor'] * df['ls_factor_proxy'] * df['c_factor_proxy']\n",
    "\n",
    "p_05 = df['Raw_Risk_Score'].quantile(0.05)\n",
    "p_95 = df['Raw_Risk_Score'].quantile(0.95)\n",
    "\n",
    "def generate_label(row):\n",
    "    if row['Raw_Risk_Score'] >= p_95:\n",
    "        return 1  # High Risk (Top 5%)\n",
    "    elif row['Raw_Risk_Score'] <= p_05:\n",
    "        return 0  # Low Risk (Bottom 5%)\n",
    "    else:\n",
    "        return -1 # Unknown (Middle 90%)\n",
    "\n",
    "df['Target_Label'] = df.apply(generate_label, axis=1)\n",
    "print(f'Top 5% Risk Threshold: {p_95:.5f}')\n",
    "print(f'Bottom 5% Safe Threshold: {p_05:.5f}')\n"
]


# --- FIX 3: Ethiopian Topographical Scanner ---
# Old Scaling cell was index 10, shifted +2 -> Index 12
nb['cells'][12]['source'] = [
    "import numpy as np\n",
    "df['Aspect_Sin'] = np.sin(np.radians(df['Aspect (Degree)']))\n",
    "df['Aspect_Cos'] = np.cos(np.radians(df['Aspect (Degree)']))\n",
    "\n",
    "# ---------------------------------------------------------\n",
    "# CRITICAL FIX: ETHIOPIAN PHYSICS-INFORMED HARD BOUNDING\n",
    "# ---------------------------------------------------------\n",
    "features_to_scale = ['Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', 'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)']\n",
    "\n",
    "ethiopian_physical_bounds = {\n",
    "    'Elevation (m)': (-150, 4600),   # Danakil Depression to Ras Dashen\n",
    "    'Slope (Degree)': (0, 90),       # Physical limit of gravity\n",
    "    'Rainfall (mm)': (0, 3000),      # Extreme bounds for Amhara woredas\n",
    "    'NDVI_Value': (-1.0, 1.0)        # Spectral math limits\n",
    "}\n",
    "\n",
    "print('--- ETHIOPIAN TOPOGRAPHICAL SCANNER REPORT ---')\n",
    "for col in features_to_scale:\n",
    "    col_max = df[col].max()\n",
    "    col_min = df[col].min()\n",
    "    \n",
    "    if col in ethiopian_physical_bounds:\n",
    "        hard_min, hard_max = ethiopian_physical_bounds[col]\n",
    "        if col_max > hard_max or col_min < hard_min:\n",
    "            print(f'🚨 PHYSICS VIOLATION DETECTED in {col}!')\n",
    "            print(f'   -> Recorded range: [{col_min:.2f} to {col_max:.2f}]')\n",
    "            print(f'   -> Hard-clipping to Ethiopian geographic limits: [{hard_min} to {hard_max}]')\n",
    "        df[col] = df[col].clip(lower=hard_min, upper=hard_max)\n",
    "    else:\n",
    "        p_001, p_999 = df[col].quantile(0.001), df[col].quantile(0.999)\n",
    "        df[col] = df[col].clip(lower=p_001, upper=p_999)\n",
    "\n",
    "print('\\nFalse anomalies eliminated! Applying MinMaxScaler...')\n",
    "from sklearn.preprocessing import MinMaxScaler\n",
    "scaler = MinMaxScaler()\n",
    "df[features_to_scale] = scaler.fit_transform(df[features_to_scale])\n",
    "\n",
    "# CATEGORICAL ENGINEERING (One-Hot Encoding)\n",
    "import pandas as pd\n",
    "df['Geology_Formation'] = df['Geology_Formation'].fillna('Unknown_Geo')\n",
    "df['Land_Use'] = df['Land_Use'].fillna('Unknown_LU')\n",
    "cat_encoded = pd.get_dummies(df[['Geology_Formation', 'Land_Use']], drop_first=True)\n",
    "cat_columns = cat_encoded.columns.tolist()\n",
    "df = pd.concat([df, cat_encoded], axis=1)\n"
]

# --- FIX 4: Update Graph Input Vector to include cat columns ---
# PyG Data cell was Index 14, now Index 16
nb['cells'][16]['source'] = [
    "from torch_geometric.data import Data\n",
    "import torch\n",
    "\n",
    "# 1. Feature Matrix (x) -> NOW INCLUDES CATEGORICAL ONE-HOT COLUMNS\n",
    "base_features = ['K_Factor', 'Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', \n",
    "                 'NDVI_Value', 'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', \n",
    "                 'Aspect_Sin', 'Aspect_Cos', 'Drainage Density (m)']\n",
    "all_features = base_features + cat_columns\n",
    "\n",
    "x_raw = df[all_features].fillna(0).values\n",
    "x = torch.tensor(x_raw.astype('float32'), dtype=torch.float)\n",
    "\n",
    "y = torch.tensor(df['Target_Label'].values, dtype=torch.long)\n",
    "train_mask = (y != -1)\n",
    "\n",
    "graph_data = Data(x=x, edge_index=edge_index, y=y)\n",
    "graph_data.train_mask = train_mask\n",
    "\n",
    "print('PyTorch Geometric Data Object created. Total features:', x.shape[1])\n"
]

# --- FIX 5: Early Stopping Training Loop ---
# Training cell was 18, now 20
nb['cells'][20]['source'] = [
    "optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=5e-4)\n",
    "criterion = torch.nn.NLLLoss()\n",
    "\n",
    "def train():\n",
    "    model.train()\n",
    "    optimizer.zero_grad()\n",
    "    out = model(graph_data.x, graph_data.edge_index)\n",
    "    loss = criterion(out[graph_data.train_mask], graph_data.y[graph_data.train_mask])\n",
    "    loss.backward()\n",
    "    optimizer.step()\n",
    "    return loss.item()\n",
    "\n",
    "print('Starting Training Loop with Early Stopping...')\n",
    "best_loss = float('inf')\n",
    "loss_change = float('inf')\n",
    "\n",
    "for epoch in range(1, 401):\n",
    "    loss = train()\n",
    "    if epoch > 1:\n",
    "        loss_change = abs(best_loss - loss)\n",
    "    if loss < best_loss:\n",
    "        best_loss = loss\n",
    "        \n",
    "    if epoch % 10 == 0:\n",
    "        print(f'Epoch: {epoch:03d}, Loss: {loss:.4f}, Delta: {loss_change:.5f}')\n",
    "        \n",
    "    if epoch > 50 and loss_change < 0.005:\n",
    "        print(f'\\nEarly stopping triggered at epoch {epoch}! Marginal loss change ({loss_change:.5f}) is < 0.005.')\n",
    "        break\n",
    "print('Training Complete!')\n"
]

# Write to a NEW FILE so VSCode/Jupyter doesn't conflict
with open('Semi_Supervised_Graph_Pipeline_FINAL.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)

print("Created SAFE FINAL Notebook without auto-save conflicts.")
