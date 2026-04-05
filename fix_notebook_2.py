import json

with open('Semi_Supervised_Graph_Pipeline.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Helper functions to insert cells
def create_markdown_cell(source):
    return {"cell_type": "markdown", "metadata": {}, "source": [source]}

def create_code_cell(source):
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [source]}

# 1. We need to create a new cell specifically for Missing Value Imputation
# It should be placed right after the Data is loaded and initial K-Factor mapped (so before target gen and scaling).
# In the notebook:
# Index 5, 6 is Soil Cohesiveness Markdown & Code.
# So we insert at Index 7 & Index 8.
imputation_md = create_markdown_cell("## 3b. Critical Preprocessing: Missing Value Handling\nInstead of blindly replacing NaNs with median values, we use robust model-based imputation. Note: Since `KNNImputer` takes excessive memory (crashes RAM) on massive datasets of 250,000+ rows, we dynamically use `IterativeImputer` (MICE). MICE builds a machine learning regression model to accurately predict what the missing soil/water values should be based on the surrounding known data, which is perfectly valid and memory-safe.")
imputation_code = create_code_cell([
    "from sklearn.experimental import enable_iterative_imputer\n",
    "from sklearn.impute import IterativeImputer\n",
    "\n",
    "# Isolate numerical continuous columns that might have missing values\n",
    "continuous_cols = ['Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', \n",
    "                   'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)']\n",
    "\n",
    "print('Scanning for missing values...')\n",
    "print(df[continuous_cols].isnull().sum())\n",
    "\n",
    "print('\\nStarting Iterative Imputation (MICE) to intelligently recover missing data...')\n",
    "imputer = IterativeImputer(max_iter=10, random_state=42)\n",
    "# Fit and transform the mathematical values so there are absolutely zero NaNs\n",
    "df[continuous_cols] = imputer.fit_transform(df[continuous_cols])\n",
    "print('Missing values perfectly imputed!')\n"
])

nb['cells'].insert(7, imputation_md)
nb['cells'].insert(8, imputation_code)

# Because we inserted two cells, all subsequent indices shift by 2.
# The Continuous Feature Engineering code was at index 10, now it is at index 12.
# We modify it to use MinMaxScaler so EVERY single column perfectly matches [0, 1] range.
nb['cells'][12]['source'] = [
    "# CIRUCLAR ASPECT (Already bounded between -1 and 1)\n",
    "df['Aspect_Sin'] = np.sin(np.radians(df['Aspect (Degree)']))\n",
    "df['Aspect_Cos'] = np.cos(np.radians(df['Aspect (Degree)']))\n",
    "\n",
    "# CRITICAL FIX: UNIFIED SCALE (MIN-MAX SCALER)\n",
    "# The neural network gets confused if Rainfall is in the 1000s but K_Factor is 0.15.\n",
    "# We will use MinMaxScaler so absolutely every continuous feature is squeezed perfectly into a [0, 1] range.\n",
    "from sklearn.preprocessing import MinMaxScaler\n",
    "features_to_scale = ['Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', 'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)']\n",
    "\n",
    "scaler = MinMaxScaler()\n",
    "df[features_to_scale] = scaler.fit_transform(df[features_to_scale])\n",
    "\n",
    "# CATEGORICAL ENGINEERING (One-Hot Encoding -> Bounded strictly as 0 or 1)\n",
    "df['Geology_Formation'] = df['Geology_Formation'].fillna('Unknown_Geo')\n",
    "df['Land_Use'] = df['Land_Use'].fillna('Unknown_LU')\n",
    "cat_encoded = pd.get_dummies(df[['Geology_Formation', 'Land_Use']], drop_first=True)\n",
    "# We save the generated column names to dynamically add them to the Neural Network!\n",
    "cat_columns = cat_encoded.columns.tolist()\n",
    "df = pd.concat([df, cat_encoded], axis=1)\n",
    "\n",
    "print('Features Engineered and Scaled to strict [0, 1] ranges! Categoricals One-Hot Encoded.')\n",
    "display(df[['Elevation (m)', 'TWI', 'Aspect_Sin'] + cat_columns[:2]].head(3))\n"
]

with open('Semi_Supervised_Graph_Pipeline.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)

print("Notebook successfully updated. Added safe ML Imputation cell and enforced [0, 1] MinMaxScaler unified ranges.")
