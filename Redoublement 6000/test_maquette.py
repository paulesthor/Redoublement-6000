from maquette_service import MaquetteService
import json

svc = MaquetteService()
res = svc.load_maquette("S3", "EMS", "FI")

print(json.dumps(res, indent=2, ensure_ascii=False))
