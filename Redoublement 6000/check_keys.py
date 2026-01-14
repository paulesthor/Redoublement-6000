from maquette_service import MaquetteService

def check_keys():
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    svc = MaquetteService()
    # Assuming user is S3 EMS FA as per previous logs
    req_option = "EMS"
    req_status = "FA"
    req_semester = "S3"
    
    maquette = svc.load_maquette(req_semester, req_option, req_status)
    
    with open("keys.md", "w", encoding="utf-8") as f:
        if not maquette:
            f.write(f"❌ No Maquette found for {req_semester} {req_option} {req_status}")
            return

        f.write(f"✅ Maquette loaded for {req_semester} {req_option} {req_status}\n")
        f.write("Available Canonical Names:\n")
        for name in sorted(maquette['courses'].keys()):
            coefs = maquette['courses'][name]
            f.write(f" - '{name}' (Coefs: {coefs})\n")

if __name__ == "__main__":
    check_keys()
