import json

# 1. Load the pristine semi-supervised notebook you've been working on
with open('Semi_Supervised_Graph_Pipeline_FINAL.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

new_cells = []

# 2. Iterate through and explicitly KEEP only the fundamental data loading & preprocessing
for cell in nb['cells']:
    source = ""
    if isinstance(cell.get('source'), list):
        source = "".join([s for s in cell['source'] if isinstance(s, str)])
    elif isinstance(cell.get('source'), str):
        source = cell['source']
    
    # We want to SKIP anything related to RUSLE, PyTorch, Graphs, or the previous Model output mapping
    if "Raw_Risk_Score" in source or "Target_Label" in source or "c_factor_proxy" in source:
        continue # Skip RUSLE Target Generation (Cell 10)
    if "torch_geometric" in source or "Data(" in source:
        continue # Skip PyG construction
    if "def train():" in source or "torch.optim" in source:
        continue # Skip PyTorch Training Loop
    if "model.eval()" in source or "Actionable_Risk_Zone" in source:
        continue # Skip the old final prediction extraction
    if "PROVING AI PHYSICAL LOGIC" in source:
        continue # Skip old validation
    if "Final_Research_Outputs" in source or "GIS Mapping" in source:
        continue # Skip old export
    
    # If it passes the filter, we keep it!
    new_cells.append(cell)

# 3. Append the brand new Unsupervised Engine!
kmeans_md = {
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## Method 1: Fully Unsupervised Clustering (K-Means)\n",
        "Because this is fully Unsupervised, we have **removed the RUSLE logic and the Graph Edges**. \n",
        "We are feeding the pure, normalized feature matrix directly into an unsupervised K-Means engine. \n",
        "We ask the algorithm to naturally sever the data into `k=3` distinct clusters without any hints about physics."
    ]
}

kmeans_code = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "from sklearn.cluster import KMeans\n",
        "import numpy as np\n",
        "\n",
        "print('Executing Fully Unsupervised K-Means Machine Learning...')\n",
        "\n",
        "# 1. Define the exact same normalized features we fed our GCN\n",
        "base_features = ['K_Factor', 'Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', \n",
        "                 'NDVI_Value', 'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', \n",
        "                 'Aspect_Sin', 'Aspect_Cos', 'Drainage Density (m)']\n",
        "all_features = base_features + cat_columns\n",
        "X_unsupervised = df[all_features].fillna(0).values\n",
        "\n",
        "# 2. Run the blind Unsupervised Algorithm\n",
        "kmeans = KMeans(n_clusters=3, random_state=42, n_init='auto')\n",
        "df['Unsupervised_Cluster'] = kmeans.fit_predict(X_unsupervised)\n",
        "\n",
        "print('Blind Clustering Complete! Distribution:')\n",
        "print(df['Unsupervised_Cluster'].value_counts())\n"
    ]
}

new_cells.append(kmeans_md)
new_cells.append(kmeans_code)

# 4. Append the Science Validation Cell so the user can see what the Clusters actually mean!
validation_md = {
    "cell_type": "markdown",
    "metadata": {},
    "source": [
        "## Physics Verification of the Blind Clusters\n",
        "Since K-Means is mathematically blind to physics, we must inspect the groups it created. \n",
        "Did it successfully discover the dangers of Slope and Rain? Or did it blindly sort the data by something irrelevant (like Elevation) due to the lack of spatial edges and RUSLE anchors?"
    ]
}

validation_code = {
    "cell_type": "code",
    "execution_count": None,
    "metadata": {},
    "outputs": [],
    "source": [
        "import matplotlib.pyplot as plt\n",
        "import seaborn as sns\n",
        "\n",
        "plt.figure(figsize=(6,4))\n",
        "sns.countplot(x='Unsupervised_Cluster', data=df, palette='viridis')\n",
        "plt.title('Unsupervised Node Distribution (3 Clusters)')\n",
        "plt.show()\n",
        "\n",
        "print('\\n--- PROVING UNSUPERVISED PHYSICAL LOGIC ---')\n",
        "# Because K-Means does not know what is dangerous, it just names them 0, 1, and 2.\n",
        "# We must look at the averages to see if they make physical sense!\n",
        "unsupervised_verification = df.groupby('Unsupervised_Cluster')[['Slope (Degree)', 'Rainfall (mm)', 'SPI', 'K_Factor', 'Elevation (m)', 'NDVI_Value']].mean()\n",
        "display(unsupervised_verification)\n",
        "\n",
        "print('\\n💡 Analysis: Look at the table above. Did Cluster 0, 1, or 2 successfully isolate High-Slope + High-Rain areas the way the GCN did? Or is the difference between them mostly just confusing Elevation/NDVI shifts?')\n"
    ]
}

new_cells.append(validation_md)
new_cells.append(validation_code)

# 5. Overwrite the JSON and save!
nb['cells'] = new_cells

with open('Fully_Unsupervised_Pipeline.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)

print("Created Fully_Unsupervised_Pipeline.ipynb successfully!")
