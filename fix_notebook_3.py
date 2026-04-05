import json

with open('Semi_Supervised_Graph_Pipeline.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Fixing the Imputation Cell (Index 7 & 8)
nb['cells'][7]['source'] = [
    "## 3b. Scientific Preprocessing: Spatial GIS Interpolation\n",
    "A professional environmental statistician does not use generic machine learning (like basic MICE) or global averages to fill missing topographical data. Following Tobler's First Law of Geography: *Near things are more related than distant things*. \n",
    "\n",
    "We will handle missing values exactly as experts do in Geographic Information Systems (GIS): **Spatial Interpolation (Inverse Distance Weighting via KNN)**. If a point is missing its Rainfall or Slope data, we calculate the exact physical distance to its closest neighbors using Latitude and Longitude, and weight the missing value by the nearest surrounding geographic points. Because we restrict the KNN strictly to the 2D spatial coordinates (Lat/Lon) via KDTree, it is exceptionally fast and will not crash the RAM."
]

nb['cells'][8]['source'] = [
    "from sklearn.neighbors import KNeighborsRegressor\n",
    "import numpy as np\n",
    "\n",
    "print('Scanning for missing environmental features...')\n",
    "continuous_cols = ['Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', \n",
    "                   'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)']\n",
    "\n",
    "missing_counts = df[continuous_cols].isnull().sum()\n",
    "print(missing_counts[missing_counts > 0] if missing_counts.sum() > 0 else 'No missing values found! Skipping interpolation.')\n",
    "\n",
    "if missing_counts.sum() > 0:\n",
    "    print('\\nExecuting Scientific Spatial Interpolation (Inverse Distance Weighting)...')\n",
    "    # We use Latitude/Longitude as the ONLY predictors for spatial interpolation\n",
    "    coords = df[['Latitude', 'Longitude']].values\n",
    "    \n",
    "    # We iterate through each column that has missing data\n",
    "    for col in continuous_cols:\n",
    "        if df[col].isnull().any():\n",
    "            # Create masks for known and unknown points\n",
    "            missing_mask = df[col].isnull()\n",
    "            known_mask = ~missing_mask\n",
    "            \n",
    "            # The coordinates of the known data points\n",
    "            X_known = coords[known_mask]\n",
    "            y_known = df.loc[known_mask, col].values\n",
    "            \n",
    "            # The coordinates of the missing data points\n",
    "            X_missing = coords[missing_mask]\n",
    "            \n",
    "            # Use 5-Nearest Neighbors weighted by spatial distance (Closer points have larger influence)\n",
    "            spatial_imputer = KNeighborsRegressor(n_neighbors=5, weights='distance', n_jobs=-1)\n",
    "            spatial_imputer.fit(X_known, y_known)\n",
    "            \n",
    "            # Predict and fill the missing physical values\n",
    "            predictions = spatial_imputer.predict(X_missing)\n",
    "            df.loc[missing_mask, col] = predictions\n",
    "            print(f'Spatially interpolated missing values for: {col}')\n",
    "\n",
    "    print('\\nAll missing topographical/environmental data successfully filled via exact geographic interpolation!')\n"
]

with open('Semi_Supervised_Graph_Pipeline.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)

print("Notebook updated with professional GIS Spatial Interpolation for missing values!")
