import maquette_service
from main import find_best_match

# Mock settings
settings = {'semester': 'S3', 'option': 'EMS', 'status': 'FI'}

# Load maquette to get canonical names
svc = maquette_service.MaquetteService()
maquette = svc.load_maquette("S3", "EMS", "FI")
canonical_names = list(maquette['courses'].keys())
teacher_map = maquette.get('teachers', {})

print(f"Loaded {len(canonical_names)} canonical courses.")

# Suspected scraped names
test_names = [
    "S3 Tableau Software", 
    "S3.09 Economie", 
    "Economie", 
    "S3 Anglais", 
    "S3 Technologie Web",
    "S3.03 Technologie Web",
    "S3.09 - Les données de l'environnement..." # Trying to match the long name
]

print("-" * 50)
for name in test_names:
    match = find_best_match(name, canonical_names, teacher_map)
    print(f"Scraped: '{name}' \n -> Matched: '{match}'\n")

# Check where 'Les données...' is in the maquette
eco_canonical = "Les données de l’environnement entrepreneurial et économique pour l’aide à la décision"
if eco_canonical in maquette['courses']:
    print(f"Canon: '{eco_canonical}' found.")
    print(f"Coefs: {maquette['courses'][eco_canonical]}")
else:
    print(f"Canon: '{eco_canonical}' NOT FOUND in keys.")
    # Maybe encoding issue? "l’" vs "l'"
    for k in canonical_names:
        if "environnement" in k:
            print(f"Did you mean: '{k}'?")
