import json
import os

with open('Semi_Supervised_Graph_Pipeline.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Fixing the Scaling / Clipping Cell (Index 12) to use Physics-Informed Hard Bounding
nb['cells'][12]['source'] = [
    "# CIRUCLAR ASPECT (Already bounded exactly between -1 and 1)\n",
    "import numpy as np\n",
    "df['Aspect_Sin'] = np.sin(np.radians(df['Aspect (Degree)']))\n",
    "df['Aspect_Cos'] = np.cos(np.radians(df['Aspect (Degree)']))\n",
    "\n",
    "# ---------------------------------------------------------\n",
    "# CRITICAL FIX: ETHIOPIAN PHYSICS-INFORMED HARD BOUNDING\n",
    "# ---------------------------------------------------------\n",
    "features_to_scale = ['Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', 'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)']\n",
    "\n",
    "# Defining the absolute, indisputable geographical limits of the Ethiopian Highlands\n",
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
    "        # Check if the satellite recorded physically impossible Ethiopian data\n",
    "        if col_max > hard_max or col_min < hard_min:\n",
    "            print(f'🚨 PHYSICS VIOLATION DETECTED in {col}!')\n",
    "            print(f'   -> Recorded range: [{col_min:.2f} to {col_max:.2f}]')\n",
    "            print(f'   -> Hard-clipping to Ethiopian geographic limits: [{hard_min} to {hard_max}]')\n",
    "        \n",
    "        # Apply Absolute Geographic Clipping\n",
    "        df[col] = df[col].clip(lower=hard_min, upper=hard_max)\n",
    "        \n",
    "    else:\n",
    "        # Fallback for derived mathematical indices (e.g., TWI, SPI) which don't have hard planet limits.\n",
    "        # We use a safe 0.1% to 99.9% statistical clip.\n",
    "        p_001 = df[col].quantile(0.001)\n",
    "        p_999 = df[col].quantile(0.999)\n",
    "        if col_max > p_999 * 3 and col_max > 0: # Extreme anomaly\n",
    "            print(f'⚠️ Mathematical Anomaly in {col}: Splike capped at {p_999:.2f}')\n",
    "        df[col] = df[col].clip(lower=p_001, upper=p_999)\n",
    "\n",
    "print('\\nFalse anomalies eliminated! Applying MinMaxScaler...')\n",
    "# MinMaxScaler: The data is now guaranteed safe, so we perfectly squeeze it into [0, 1].\n",
    "from sklearn.preprocessing import MinMaxScaler\n",
    "scaler = MinMaxScaler()\n",
    "df[features_to_scale] = scaler.fit_transform(df[features_to_scale])\n",
    "\n",
    "# CATEGORICAL ENGINEERING (One-Hot Encoding -> Bounded strictly as 0 or 1)\n",
    "import pandas as pd\n",
    "df['Geology_Formation'] = df['Geology_Formation'].fillna('Unknown_Geo')\n",
    "df['Land_Use'] = df['Land_Use'].fillna('Unknown_LU')\n",
    "cat_encoded = pd.get_dummies(df[['Geology_Formation', 'Land_Use']], drop_first=True)\n",
    "cat_columns = cat_encoded.columns.tolist()\n",
    "df = pd.concat([df, cat_encoded], axis=1)\n",
    "\n",
    "print('Features clipped by Ethiopian geography laws and Scaled to strict [0.0, 1.0] ranges! Categoricals Encoded.')\n",
    "display(df[['Elevation (m)', 'TWI', 'Aspect_Sin'] + cat_columns[:2]].head(3))\n"
]

with open('Semi_Supervised_Graph_Pipeline.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)

print("Notebook updated! Ethiopian Physics-Informed Hard Bounding is fully implemented.")
