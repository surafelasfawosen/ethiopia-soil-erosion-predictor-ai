import json
import os

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

notebook_path = 'Semi_Supervised_Graph_Pipeline.ipynb'

if os.path.exists(notebook_path):
    with open(notebook_path, 'r', encoding='utf-8') as f:
        notebook = json.load(f)
else:
    print("Notebook not found!")
    exit(1)

new_cells = [
    # 6. Graph Construction
    create_markdown_cell("## 6. Spatial Graph Construction (Adj Matrix via KDTree)\nWe use the physical `Latitude` and `Longitude` of every row to form a topological network. Each point connects to its closest geographical neighbors (e.g., K=8 for spatial grids), allowing the neural network to understand how water and gravity flow across the landscape."),
    create_code_cell("from scipy.spatial import cKDTree\nimport torch\n\n# Extract coordinates\ncoords = df[['Longitude', 'Latitude']].values\n\nprint('Building KDTree for Spatial Graph...')\n# K=9 because kdtree returns the point itself as the first neighbor\ntree = cKDTree(coords)\ndistances, indices = tree.query(coords, k=9)\n\n# Construct Edge Index format for PyTorch [2, num_edges]\nedge_list = []\nfor i in range(len(indices)):\n    for j in range(1, 9): # Skip the first one (itself)\n        neighbor_idx = indices[i][j]\n        edge_list.append([i, neighbor_idx])\n\nedge_index = torch.tensor(edge_list, dtype=torch.long).t().contiguous()\nprint(f'Graph constructed! Total nodes: {len(coords)}, Total edges: {edge_index.shape[1]}')"),

    # 7. PyTorch Geometric Data Object
    create_markdown_cell("## 7. PyTorch Geometric Data Integration\nWe assemble the numerical features (`x`), the structural edges (`edge_index`), and our Pseudo-RUSLE targets (`y`) into a specialized single Graph Data object. We also create a training mask to tell the AI *only* to learn from the known extreme 10%."),
    create_code_cell("from torch_geometric.data import Data\n\n# 1. Feature Matrix (x)\nfeature_cols = ['K_Factor', 'Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', \n                'NDVI_Value', 'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', \n                'Aspect_Sin', 'Aspect_Cos', 'Drainage Density (m)']\n\nx = torch.tensor(df[feature_cols].values, dtype=torch.float)\n\n# 2. Target Variable (y)\ny = torch.tensor(df['Target_Label'].values, dtype=torch.long)\n\n# 3. Training Mask (Only learn from labels 0 and 1, ignore -1)\ntrain_mask = (y != -1)\n\n# 4. PyG Data Object\ngraph_data = Data(x=x, edge_index=edge_index, y=y)\ngraph_data.train_mask = train_mask\n\nprint('PyTorch Geometric Data Object created:')\nprint(graph_data)\nprint(f'Training on {train_mask.sum().item()} known nodes out of {len(y)} total.')"),

    # 8. Model Architecture
    create_markdown_cell("## 8. Semi-Supervised Graph Convolutional Network (GCN) Architecture\nThe PyTorch topology model. Unlike standard ML, `GCNConv` passes messages mathematically along the spatial edges you built, sharing geological intelligence between neighbors."),
    create_code_cell("import torch.nn.functional as F\nfrom torch_geometric.nn import GCNConv\n\nclass ErosionGCN(torch.nn.Module):\n    def __init__(self, num_features, hidden_size, num_classes):\n        super(ErosionGCN, self).__init__()\n        # First Graph Convolutional Layer\n        self.conv1 = GCNConv(num_features, hidden_size)\n        # Second Graph Convolutional Layer\n        self.conv2 = GCNConv(hidden_size, hidden_size)\n        # Output Layer for Final Prediction (Low=0, High=1)\n        self.out = torch.nn.Linear(hidden_size, num_classes)\n\n    def forward(self, x, edge_index):\n        # Pass features through spatial convolutional edges\n        x = self.conv1(x, edge_index)\n        x = F.relu(x)\n        x = F.dropout(x, p=0.3, training=self.training)\n        \n        x = self.conv2(x, edge_index)\n        x = F.relu(x)\n        \n        # Output final probabilities\n        out = self.out(x)\n        return F.log_softmax(out, dim=1)\n\n# Initialize model\ndevice = torch.device('cuda' if torch.cuda.is_available() else 'cpu')\nmodel = ErosionGCN(num_features=x.shape[1], hidden_size=64, num_classes=2).to(device)\ngraph_data = graph_data.to(device)\nprint(f'Model deployed on {device}!')"),

    # 9. Training Loop
    create_markdown_cell("## 9. Model Training Loop (Label Propagation)\nWe train the AI on the 10% extreme targets defined by RUSLE + Soil Cohesiveness. The Graph Network will mathematically flow these rules back into the unknown 90%."),
    create_code_cell("optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=5e-4)\ncriterion = torch.nn.NLLLoss()\n\ndef train():\n    model.train()\n    optimizer.zero_grad()  # Clear gradients\n    out = model(graph_data.x, graph_data.edge_index)  # Forward pass\n    \n    # CALCULATE LOSS *ONLY* ON THE 10% KNOWN MASK\n    loss = criterion(out[graph_data.train_mask], graph_data.y[graph_data.train_mask])\n    loss.backward()  # Backpropagation\n    optimizer.step() # Update weights\n    return loss.item()\n\nprint('Starting Training Loop for 200 Epochs...')\nfor epoch in range(1, 201):\n    loss = train()\n    if epoch % 20 == 0:\n        print(f'Epoch: {epoch:03d}, Loss: {loss:.4f}')\nprint('Training Complete!')")
]

notebook['cells'].extend(new_cells)

with open(notebook_path, 'w', encoding='utf-8') as f:
    json.dump(notebook, f, indent=2)

print(f"Appended GCN model and training code to {notebook_path} successfully!")
