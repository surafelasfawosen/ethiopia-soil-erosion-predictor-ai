import json
import os

notebook_path = 'Semi_Supervised_Graph_Pipeline.ipynb'

if os.path.exists(notebook_path):
    with open(notebook_path, 'r', encoding='utf-8') as f:
        notebook = json.load(f)
else:
    print("Notebook not found!")
    exit(1)

def create_markdown_cell(source):
    return {"cell_type": "markdown", "metadata": {}, "source": [source]}

def create_code_cell(source):
    return {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": [source]}

new_cells = [
    # 10. Final Predictions
    create_markdown_cell("## 10. Extracting the Final Erosion Susceptibility Map\nNow that the model is trained on the extreme 10%, we lock the weights, run the entire Woreda map through it, and extract the probabilities for the unknown 90%."),
    create_code_cell("model.eval()\nwith torch.no_grad():\n    # Run the entire graph through the trained model\n    final_output = model(graph_data.x, graph_data.edge_index)\n    \n    # Get the raw predicted probabilities for 'High Risk' (Class 1)\n    # (exp is used because the model returned log_softmax)\n    probabilities = torch.exp(final_output)[:, 1].cpu().numpy() \n    \n    # Get hard class assignments (0=Low, 1=High)\n    predictions = final_output.argmax(dim=1).cpu().numpy()\n\ndf['Predicted_Risk_Class'] = predictions\ndf['Risk_Probability'] = probabilities\n\nprint('Prediction complete for 100% of the map!')\nprint(df['Predicted_Risk_Class'].value_counts())\n\nplt.figure(figsize=(8,5))\nsns.histplot(df['Risk_Probability'], bins=50, kde=True, color='crimson')\nplt.title('Distribution of Final Predicted Erosion Risk Probabilities')\nplt.xlabel('Probability of Severe Erosion (0 to 1)')\nplt.show()"),

    # 11. Scientific Verification
    create_markdown_cell("## 11. Scientific Verification of the AI\nA major problem with the old Pure Unsupervised DAE method was interpretability. We must mathematically prove that the Graph network learned physics. We will compare the average structural indicators of the newly predicted 'Safe' zones vs 'High Risk' zones."),
    create_code_cell("print('--- PROVING AI PHYSICAL LOGIC ---')\n\n# Group the DataFrame by the AI's predictions\nverification_stats = df.groupby('Predicted_Risk_Class')[['Slope (Degree)', 'Rainfall (mm)', 'SPI', 'K_Factor', 'NDVI_Value']].mean()\n\n# Rename indices for visual clarity\nverification_stats.index = ['Predicted Low Risk (0)', 'Predicted High Risk (1)']\n\ndisplay(verification_stats)\n\nprint('\\nCONCLUSION:')\nprint('If Method 2 is successful, the Predicted High Risk zones must show significantly higher Slope, SPI, Rainfall, and K-Factor values (low cohesive sand), combined with structurally lowered NDVI (less vegetation cover) compared to the Low Risk zones. \\nIf this is true, the Semantic Spatial Graph has successfully replicated environmental physics without needing a full ground-truth dataset!')")
]

notebook['cells'].extend(new_cells)

with open(notebook_path, 'w', encoding='utf-8') as f:
    json.dump(notebook, f, indent=2)

print('Appended Evaluation and Visualization cells successfully!')
