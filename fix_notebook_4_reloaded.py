import json
import os

with open('Semi_Supervised_Graph_Pipeline.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Fixing the Scaling Cell (Index 12) to include the Glitch Detection requested by the user
nb['cells'][12]['source'] = [
    "# CIRUCLAR ASPECT (Already bounded between -1 and 1)\n",
    "import numpy as np\n",
    "df['Aspect_Sin'] = np.sin(np.radians(df['Aspect (Degree)']))\n",
    "df['Aspect_Cos'] = np.cos(np.radians(df['Aspect (Degree)']))\n",
    "\n",
    "# ---------------------------------------------------------\n",
    "# CRITICAL FIX: SENSOR GLITCH DETECTION & PERCENTILE CLIPPING\n",
    "# ---------------------------------------------------------\n",
    "features_to_scale = ['Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', 'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)']\n",
    "\n",
    "print('--- OUTLIER GLITCH DETECTION REPORT ---')\n",
    "for col in features_to_scale:\n",
    "    col_max = df[col].max()\n",
    "    col_min = df[col].min()\n",
    "    p_99 = df[col].quantile(0.999) # Using 99.9th to strictly target insane glitches\n",
    "    p_01 = df[col].quantile(0.001)\n",
    "    \n",
    "    # Heuristic Detection: If the MAX value is absurdly larger than the 99.9th percentile,\n",
    "    # it is virtually guaranteed to be a sensor error or fake outlier.\n",
    "    if col_max > (p_99 * 2) and col_max > 0:  # e.g., Max is double the 99.9th percentile\n",
    "        print(f'🚨 INSANE GLITCH DETECTED in {col}: Maximum recorded was {col_max:.2f}, but actual 99.9% of data is below {p_99:.2f}.')\n",
    "        print(f'   -> Safely clipping {col} to {p_99:.2f} to protect the Neural Network.')\n",
    "    elif col == 'Slope (Degree)' and col_max > 90:\n",
    "        print(f'🚨 PHYSICAL IMPOSSIBILITY DETECTED: Slope cannot exceed 90 degrees. Found {col_max:.2f}. Clipping...')\n",
    "    \n",
    "    # Apply the physical clipping (Winsorization) to clamp the fake glitches\n",
    "    df[col] = df[col].clip(lower=p_01, upper=p_99)\n",
    "\n",
    "print('\\nData safely clipped! Applying MinMaxScaler...')\n",
    "# MinMaxScaler: Now that the fake outliers are destroyed, we can perfectly squash \n",
    "# the legitimate remaining data into a [0, 1] range for the Neural Network.\n",
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
    "print('Features clipped of glitches and Scaled to strict [0.0, 1.0] ranges! Categoricals One-Hot Encoded.')\n",
    "display(df[['Elevation (m)', 'TWI', 'Aspect_Sin'] + cat_columns[:2]].head(3))\n"
]

with open('Semi_Supervised_Graph_Pipeline.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)

print("Notebook updated! Outlier detection logic and clipping applied before MinMaxScaler!")
