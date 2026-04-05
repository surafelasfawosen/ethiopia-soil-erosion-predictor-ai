import json

def create_markdown_cell(source):
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": [source]
    }

def create_code_cell(source):
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [source]
    }

notebook = {
    "cells": [],
    "metadata": {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3"
        },
        "language_info": {
            "codemirror_mode": {"name": "ipython", "version": 3},
            "file_extension": ".py",
            "mimetype": "text/x-python",
            "name": "python",
            "nbconvert_exporter": "python",
            "pygments_lexer": "ipython3",
            "version": "3.8.0"
        }
    },
    "nbformat": 4,
    "nbformat_minor": 4
}

cells = [
    # 0. Title
    create_markdown_cell("# Semi-Supervised Spatial Graph Network for Soil Erosion\n\nThis notebook executes **Method 2 (Hybrid GCN)** engineered with **Soil Cohesiveness (K-Factor)** for precise erosion susceptibility mapping."),
    
    # 1. Imports
    create_markdown_cell("## 1. Import Required Libraries\nImporting data manipulation, spatial math, and visualization tools."),
    create_code_cell("import pandas as pd\nimport numpy as np\nimport matplotlib.pyplot as plt\nimport seaborn as sns\nfrom sklearn.preprocessing import StandardScaler\n\n# Note: PyTorch & PyTorch Geometric (PyG) will be imported later for the Graph Network\nprint('Libraries imported successfully!')"),
    
    # 2. Loading Data
    create_markdown_cell("## 2. Load the Spatial Dataset\nLoading the merged Woreda dataset from Excel."),
    create_code_cell("file_path = 'Merged_Woredas_All.xlsx'\nprint(f'Loading {file_path}...')\ndf = pd.read_excel(file_path)\nprint(f'Dataset Loaded! Shape: {df.shape}')\ndisplay(df.head(3))"),
    
    # 3. Soil Cohesiveness (User's Idea!)
    create_markdown_cell("## 3. Engineer Soil Cohesiveness (K-Factor)\nMapping the 'sticking together capacity' of the soil based on geological FAO classifications. Clays stick together (Low K), while Sands erode instantly (High K)."),
    create_code_cell("cohesion_mapping = {\n    'Pellic Vertisol': 0.15,   # Heavy clay, highly cohesive, safe\n    'Ferralic Cambisol': 0.20, # Weathered, relatively stable\n    'Eutric Cambisol': 0.25,   # Loamy, moderate cohesiveness\n    'Calcic Xerosol': 0.30,    # Dry/arid soil, moderate-low\n    'Eutric Regosol':  0.40,   # Unconsolidated materials, dangerous\n    'Cambie Arenosol': 0.45    # Sandy soil, VERY LOW cohesiveness (erodes instantly)\n}\n\ndf['Soil Type'] = df['Soil Type'].fillna('Eutric Cambisol')\ndf['K_Factor'] = df['Soil Type'].map(cohesion_mapping)\n\nprint('Mapped Soil Cohesiveness. Sample:')\ndisplay(df[['Soil Type', 'K_Factor']].head(5))"),
    
    # 4. Target Variable Generation
    create_markdown_cell("## 4. Generate Semi-Supervised Target Variable (RUSLE Seed)\nWe calculate a physical risk score using **Slope * Rainfall * K_Factor / NDVI**.\nWe extract only the **Top 5% (Severe Risk, Label 1)** and **Bottom 5% (Safe, Label 0)** to train the Graph Network. We mask the remaining 90% as missing (-1 or NaN) for the GCN to predict."),
    create_code_cell("# Safe division mask for NDVI (avoid dividing by zero or negative)\nsafe_ndvi = np.where(df['NDVI_Value'] <= 0.01, 0.01, df['NDVI_Value'])\n\n# Calculate raw physical erosion risk heuristic\ndf['Raw_Risk_Score'] = (df['Slope (Degree)'] * df['Rainfall (mm)'] * df['K_Factor']) / safe_ndvi\n\n# Identify 5th and 95th percentiles (The Extremes)\np_05 = df['Raw_Risk_Score'].quantile(0.05)\np_95 = df['Raw_Risk_Score'].quantile(0.95)\n\n# Generate the Semi-Supervised Mask (-1 = Unknown)\ndef generate_label(row):\n    if row['Raw_Risk_Score'] >= p_95:\n        return 1  # High Risk (Top 5%)\n    elif row['Raw_Risk_Score'] <= p_05:\n        return 0  # Low Risk (Bottom 5%)\n    else:\n        return -1 # Unknown (Middle 90%)\n\ndf['Target_Label'] = df.apply(generate_label, axis=1)\n\nprint(f'Top 5% Risk Threshold: {p_95:.2f}')\nprint(f'Bottom 5% Safe Threshold: {p_05:.2f}')\nprint('Label Distribution:')\nprint(df['Target_Label'].value_counts())\n\n# Quick Visualization of the Extremes\nplt.figure(figsize=(6,4))\nsns.countplot(x='Target_Label', data=df, palette='coolwarm')\nplt.title('Semi-Supervised Labels (-1=Unknown, 0=Safe, 1=Severe)')\nplt.show()"),
    
    # 5. Continuous Feature Engineering
    create_markdown_cell("## 5. Circular Aspect & Feature Scaling\nConverting continuous variables into safe mathematical spaces for Deep Learning."),
    create_code_cell("# Circular Aspect\ndf['Aspect_Sin'] = np.sin(np.radians(df['Aspect (Degree)']))\ndf['Aspect_Cos'] = np.cos(np.radians(df['Aspect (Degree)']))\n\n# Standard Scaling Structural Features\nfeatures_to_scale = ['Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', 'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)']\n\nscaler = StandardScaler()\ndf[features_to_scale] = scaler.fit_transform(df[features_to_scale])\n\nprint('Aspect converted and structural features scaled!')\ndisplay(df[['Aspect_Sin', 'Aspect_Cos', 'TWI', 'SPI', 'Slope (Degree)']].head())")
]

notebook['cells'] = cells

with open('Semi_Supervised_Graph_Pipeline.ipynb', 'w', encoding='utf-8') as f:
    json.dump(notebook, f, indent=2)

print("Notebook 'Semi_Supervised_Graph_Pipeline.ipynb' successfully generated!")
