import pandas as pd
import numpy as np

def load_and_map_soil_cohesion(filepath):
    print(f"Loading dataset from {filepath}...")
    df = pd.read_excel(filepath)
    print(f"Loaded {len(df)} rows.")
    
    # ---------------------------------------------------------
    # 1. SOIL COHESION (K-FACTOR) MAPPING
    # ---------------------------------------------------------
    # The user specifically requested mapping the "sticking together" capacity.
    # In geological terms, this is Soil Erodibility (K-factor).
    # Less cohesive = Higher K (erodes easily).
    # Highly cohesive (Clay) = Lower K (sticks together).
    
    # Based on FAO Soil Classifications in the dataset:
    cohesion_mapping = {
        'Pellic Vertisol': 0.15,   # Heavy clay, highly cohesive, very sticky, low erodibility
        'Ferralic Cambisol': 0.20, # Weathered, relatively stable
        'Eutric Cambisol': 0.25,   # Loamy, moderate cohesiveness
        'Calcic Xerosol': 0.30,    # Dry/arid soil, moderate-low cohesiveness
        'Cambie Arenosol': 0.45,   # Sandy soil, VERY LOW cohesiveness (erodes instantly)
        'Eutric Regosol':  0.40    # Unconsolidated materials, very low cohesiveness
    }
    
    print("Mapping Soil Cohesiveness (K-Factor) based on user's geological request...")
    # Fill NaN with a neutral average cohesiveness if any are missing
    df['Soil Type'] = df['Soil Type'].fillna('Eutric Cambisol') 
    df['Soil_Cohesiveness_K_Factor'] = df['Soil Type'].map(cohesion_mapping)
    
    print("Sample of mapped soil cohesiveness:")
    print(df[['Soil Type', 'Soil_Cohesiveness_K_Factor']].head(10))
    
    return df

if __name__ == "__main__":
    df_mapped = load_and_map_soil_cohesion("Merged_Woredas_All.xlsx")
