import os
import torch
import numpy as np
import pandas as pd
from sklearn.neighbors import KNeighborsRegressor
from sklearn.preprocessing import MinMaxScaler
from scipy.spatial import cKDTree
import torch.nn.functional as F
from torch_geometric.nn import GCNConv
from torch_geometric.data import Data

# -------------------------------------------------------------
# CORE AI ARCHITECTURE (Required to load weights)
# -------------------------------------------------------------
class ErosionGCN(torch.nn.Module):
    def __init__(self, num_features):
        super(ErosionGCN, self).__init__()
        self.conv1 = GCNConv(num_features, 64)
        self.conv2 = GCNConv(64, 32)
        self.conv3 = GCNConv(32, 2)

    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.3, training=self.training)
        
        x = self.conv2(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, p=0.3, training=self.training)
        
        x = self.conv3(x, edge_index)
        return F.log_softmax(x, dim=1)


# -------------------------------------------------------------
# THE MASTER PRODUCTION APPLICATION
# -------------------------------------------------------------
class EthiopianErosionAI:
    def __init__(self, model_weights_path=None):
        self.model_weights_path = model_weights_path
        self.model = None
        self.scaler = MinMaxScaler()
        print("Ethiopian AI Inference Engine Initialized.")

    def preprocess_satellite_data(self, df):
        print("\n--- 1. BEGINNING SCIENTIFIC PREPROCESSING ---")
        
        # 1. Soil Cohesiveness (K-Factor)
        if 'K_Factor' not in df.columns:
            fao_k_factor_weights = {
                'Pellic Vertisol': 0.15,
                'Ferralic Cambisol': 0.20,
                'Eutric Cambisol': 0.25,
                'Calcic Xerosol': 0.35,
                'Eutric Regosol': 0.40,
                'Cambie Arenosol': 0.45
            }
            df['Soil Type'] = df['Soil Type'].fillna('Unknown')
            df['K_Factor'] = df['Soil Type'].map(fao_k_factor_weights).fillna(0.25)
            print("[+] K-Factor mapped successfully.")

        # 2. Aspect Circularity
        df['Aspect_Sin'] = np.sin(np.radians(df['Aspect (Degree)']))
        df['Aspect_Cos'] = np.cos(np.radians(df['Aspect (Degree)']))
        
        # 3. Spatial KDTree Imputation for Missing Telemetry
        continuous_cols = ['Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 'NDVI_Value', 
                           'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 'Drainage Density (m)']
        
        coords = df[['Latitude', 'Longitude']].values
        for col in continuous_cols:
            if df[col].isnull().any():
                missing_mask = df[col].isnull()
                known_mask = ~missing_mask
                X_known, y_known = coords[known_mask], df.loc[known_mask, col].values
                X_missing = coords[missing_mask]
                
                spatial_imputer = KNeighborsRegressor(n_neighbors=5, weights='distance', n_jobs=-1)
                spatial_imputer.fit(X_known, y_known)
                df.loc[missing_mask, col] = spatial_imputer.predict(X_missing)
        print("[+] Spatial Missing Data Interpolation complete.")

        # 4. Ethiopian Topographical Hard Bounding
        ethiopian_physical_bounds = {
            'Elevation (m)': (-150, 4600),   
            'Slope (Degree)': (0, 90),       
            'Rainfall (mm)': (0, 3000),      
            'NDVI_Value': (-1.0, 1.0)        
        }
        for col in continuous_cols:
            if col in ethiopian_physical_bounds:
                h_min, h_max = ethiopian_physical_bounds[col]
                df[col] = df[col].clip(lower=h_min, upper=h_max)
            else:
                p_001, p_999 = df[col].quantile(0.001), df[col].quantile(0.999)
                df[col] = df[col].clip(lower=p_001, upper=p_999)
        print("[+] Ethiopian Physics Boundaries enforced.")

        # 5. Normalization
        df[continuous_cols] = self.scaler.fit_transform(df[continuous_cols])
        
        # 6. Categorical Dummy Variables
        df['Geology_Formation'] = df['Geology_Formation'].fillna('Unknown_Geo')
        df['Land_Use'] = df['Land_Use'].fillna('Unknown_LU')
        cat_encoded = pd.get_dummies(df[['Geology_Formation', 'Land_Use']], drop_first=True)
        self.cat_columns = cat_encoded.columns.tolist()
        df = pd.concat([df, cat_encoded], axis=1)

        print("[+] Data perfectly processed for the Artificial Intelligence!")
        return df

    def extract_graph_edges(self, df):
        print("\n--- 2. CONSTRUCTING GEOGRAPHIC GRAPH ---")
        coords = df[['Latitude', 'Longitude']].values
        tree = cKDTree(coords)
        
        # Connect each physical location to its 8 closest neighbors
        dists, indices = tree.query(coords, k=9) 
        
        source_nodes = []
        target_nodes = []
        for i in range(len(indices)):
            for j in range(1, 9):
                neighbor = indices[i][j]
                source_nodes.append(i)
                target_nodes.append(neighbor)
                
        edge_index = torch.tensor([source_nodes, target_nodes], dtype=torch.long)
        print(f"[+] KDTree generated {edge_index.shape[1]} physical spatial connections.")
        return edge_index

    def execute_ai_prediction(self, df, edge_index):
        print("\n--- 3. EXECUTING GCN NEURAL NETWORK ---")
        base_features = ['K_Factor', 'Elevation (m)', 'Slope (Degree)', 'Rainfall (mm)', 
                         'NDVI_Value', 'TWI', 'SPI', 'TRI', 'Plan Curvature', 'Profile Curvature', 
                         'Aspect_Sin', 'Aspect_Cos', 'Drainage Density (m)']
        all_features = base_features + self.cat_columns
        
        x_raw = df[all_features].fillna(0).values
        x = torch.tensor(x_raw.astype('float32'), dtype=torch.float)
        num_features = x.shape[1]
        
        # Load Model Weights natively
        self.model = ErosionGCN(num_features=num_features)
        if self.model_weights_path and os.path.exists(self.model_weights_path):
            self.model.load_state_dict(torch.load(self.model_weights_path, weights_only=True))
            print(f"[+] Successfully loaded Historical Weights from: {self.model_weights_path}")
        else:
            print("[!] Warning: No weights file found! The model will run on randomized weights for demonstration.")
            
        self.model.eval()
        with torch.no_grad():
            final_output = self.model(x, edge_index)
            probabilities = torch.exp(final_output)[:, 1].cpu().numpy() 
            
        df['Risk_Probability'] = probabilities
        
        # Enforce Policy Action Zones
        def classify_actionable_risk(prob):
            if prob < 0.40:
                return 'Low Risk (Safe)'
            elif prob <= 0.80:
                return 'Moderate Risk (Monitor)'
            else:
                return 'Severe Risk (Immediate Action)'
                
        df['Actionable_Risk_Zone'] = df['Risk_Probability'].apply(classify_actionable_risk)
        print("[+] Actionable Government Policy Mappings complete!")
        return df

    def run_full_pipeline(self, raw_data_path, output_csv_path):
        print(f"FIRING UP PIPELINE FOR: {raw_data_path}")
        
        # Load Data
        df = pd.read_excel(raw_data_path)
        
        # Pipeline execution
        df = self.preprocess_satellite_data(df)
        edges = self.extract_graph_edges(df)
        df_final = self.execute_ai_prediction(df, edges)
        
        # Save exact map targets
        gis_cols = ['Latitude', 'Longitude', 'Actionable_Risk_Zone', 'Risk_Probability']
        if 'Woreda' in df_final.columns:
            gis_cols.insert(0, 'Woreda')
            
        df_final[gis_cols].to_csv(output_csv_path, index=False)
        print(f"\nSUCCESS: Final Map ready for QGIS exported to -> {output_csv_path}")
        return df_final


# =====================================================================
# USAGE EXAMPLE (How to use this tool in production)
# =====================================================================
if __name__ == "__main__":
    # If the user has exported their weights from the Jupyter Notebook:
    my_weights = 'Final_Research_Outputs/Erosion_GCN_Model.pth'
    
    # Initialize the App
    erosion_app = EthiopianErosionAI(model_weights_path=my_weights)
    
    # Run the App on raw dataset to automatically spit out the Final Map
    # (Assuming 'Merged_Woredas_All.xlsx' is in the folder)
    # df_result = erosion_app.run_full_pipeline('Merged_Woredas_All.xlsx', 'NEW_QGIS_MAP.csv')
    
    print("\nProduction Script 'Ethiopian_Erosion_AI.py' is ready for deployment!")
