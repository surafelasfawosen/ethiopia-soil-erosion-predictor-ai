import json

with open('Semi_Supervised_Graph_Pipeline_FINAL.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

for cell in nb['cells']:
    if cell['cell_type'] == 'code' and any("model.eval()" in line for line in cell['source']):
        # We found the prediction extraction cell!
        cell['source'] = [
            "model.eval()\n",
            "with torch.no_grad():\n",
            "    # Run the entire graph through the trained model\n",
            "    final_output = model(graph_data.x, graph_data.edge_index)\n",
            "    \n",
            "    # Get the raw predicted probabilities for 'High Risk' (Class 1)\n",
            "    # (exp is used because the model returned log_softmax)\n",
            "    probabilities = torch.exp(final_output)[:, 1].cpu().numpy() \n",
            "\n",
            "# 1. Save the exact probability (0.0 to 1.0) into the dataframe\n",
            "df['Risk_Probability'] = probabilities\n",
            "\n",
            "# 2. Create the highly actionable '3-Part Risk Zone' categorizations for politicians\n",
            "def classify_actionable_risk(prob):\n",
            "    if prob < 0.40:\n",
            "        return 'Low Risk (Safe)'\n",
            "    elif prob <= 0.80:\n",
            "        return 'Moderate Risk (Monitor)'\n",
            "    else:\n",
            "        return 'Severe Risk (Immediate Action)'\n",
            "\n",
            "df['Actionable_Risk_Zone'] = df['Risk_Probability'].apply(classify_actionable_risk)\n",
            "\n",
            "print('Prediction complete for 100% of the map!')\n",
            "print(df['Actionable_Risk_Zone'].value_counts())\n",
            "\n",
            "import matplotlib.pyplot as plt\n",
            "import seaborn as sns\n",
            "\n",
            "# Visualization of the 3-Part Policy Zones\n",
            "plt.figure(figsize=(10,5))\n",
            "sns.histplot(df['Risk_Probability'], bins=50, kde=True, color='crimson')\n",
            "plt.axvline(x=0.40, color='green', linestyle='--', label='Low/Moderate Threshold (0.40)')\n",
            "plt.axvline(x=0.80, color='black', linestyle='--', label='Moderate/Severe Threshold (0.80)')\n",
            "plt.title('Final Erosion Risk Probabilities grouped into Actionable Policy Zones')\n",
            "plt.xlabel('Probability of Severe Erosion (0 to 1)')\n",
            "plt.legend()\n",
            "plt.show()\n"
        ]
        break

# Now we need to modify the final verification cell to group by this new Actionable_Risk_Zone
for cell in nb['cells']:
    if cell['cell_type'] == 'code' and any("df.groupby('Predicted_Risk_Class')" in line for line in cell['source']):
        # We found the verification cell!
        cell['source'] = [
            "print('--- PROVING AI PHYSICAL LOGIC (POLICY ZONES) ---')\n",
            "# We group by our new actionable zones to prove the severely dangerous zones match erosion physics\n",
            "verification_df = df.groupby('Actionable_Risk_Zone')[['Slope (Degree)', 'Rainfall (mm)', 'SPI', 'K_Factor', 'NDVI_Value']].mean()\n",
            "\n",
            "# Order the index logically for display\n",
            "verification_df = verification_df.reindex(['Low Risk (Safe)', 'Moderate Risk (Monitor)', 'Severe Risk (Immediate Action)'])\n",
            "display(verification_df)\n"
        ]
        break

with open('Semi_Supervised_Graph_Pipeline_FINAL.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)

print("Policy Zones perfectly integrated into the pipeline!")
