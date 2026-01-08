# Configuration Officielle des Coefficients (2025-2026)
# Généré à partir des maquettes VCOD/EMS et FI/FA

# Structure :
# "Mot Clé Moodle": {
#    "name": "Nom d'affichage",
#    "ue": "Nom de l'UE",
#    "coefs": { "VCOD_FI": X, "VCOD_FA": Y, "EMS_FI": Z, "EMS_FA": W }
# }

SEMESTER_CONFIG = {
    # --- TRONC COMMUN & LANGUES ---
    "Anglais": {
        "name": "Anglais Professionnel / Scientifique",
        "ue": "UE 3.3 - Pro & Com",
        "coefs": {"VCOD_FI": 15, "VCOD_FA": 15, "EMS_FI": 15, "EMS_FA": 15}
    },
    "Communication": {
        "name": "Communication Pro",
        "ue": "UE 3.3 - Pro & Com",
        "coefs": {"VCOD_FI": 15, "VCOD_FA": 15, "EMS_FI": 15, "EMS_FA": 15}
    },
    "Projet Personnel et Professionnel": {
        "name": "PPP (Projet Pro)",
        "ue": "UE 3.3 - Pro & Com",
        "coefs": {"VCOD_FI": 5, "VCOD_FA": 0, "EMS_FI": 5, "EMS_FA": 0} # 0 pour les alternants
    },
    "Environnement entrepreneurial": {
        "name": "Droit & Éco (Environnement Entrepreneurial)",
        "ue": "UE 3.3 - Pro & Com",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 25, "EMS_FI": 20, "EMS_FA": 25}
    },
    "Exploration et valorisation": {
        "name": "Droit & Éthique des Données",
        "ue": "UE 3.3 - Pro & Com",
        "coefs": {"VCOD_FI": 16, "VCOD_FA": 19, "EMS_FI": 16, "EMS_FA": 19}
    },

    # --- MATHS & STATS (Commun S3) ---
    "Algèbre linéaire": {
        "name": "Algèbre Linéaire",
        "ue": "UE 3.2 - Statistique",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 20, "EMS_FI": 15, "EMS_FA": 15}
    },
    "Tests d’hypothèses": {
        "name": "Tests d'Hypothèses",
        "ue": "UE 3.2 - Statistique",
        "coefs": {"VCOD_FI": 15, "VCOD_FA": 20, "EMS_FI": 15, "EMS_FA": 15}
    },
    "Régression linéaire simple": {
        "name": "Régression Linéaire Simple",
        "ue": "UE 3.2 - Statistique",
        "coefs": {"VCOD_FI": 15, "VCOD_FA": 20, "EMS_FI": 15, "EMS_FA": 15}
    },

    # --- INFORMATIQUE DÉCISIONNELLE (Commun S3) ---
    "Utilisation avancée d'outils de reporting": {
        "name": "Reporting Avancé (BO/PowerBI)",
        "ue": "UE 3.1 - Décisionnel",
        "coefs": {"VCOD_FI": 10, "VCOD_FA": 10, "EMS_FI": 10, "EMS_FA": 15}
    },
    "Systèmes d'information décisionnels": {
        "name": "SID & SQL",
        "ue": "UE 3.1 - Décisionnel",
        "coefs": {"VCOD_FI": 10, "VCOD_FA": 10, "EMS_FI": 10, "EMS_FA": 10}
    },
    "Technologies web": {
        "name": "Technos Web (PHP/JS)",
        "ue": "UE 3.1 - Décisionnel",
        "coefs": {"VCOD_FI": 10, "VCOD_FA": 10, "EMS_FI": 10, "EMS_FA": 15}
    },
    "Programmation statistique automatisée": {
        "name": "SAS Macro / Prog Auto",
        "ue": "UE 3.1 - Décisionnel",
        "coefs": {"VCOD_FI": 10, "VCOD_FA": 10, "EMS_FI": 10, "EMS_FA": 10}
    },

    # --- SPÉCIFIQUE VCOD (S3) ---
    "VCOD - Programmation objet": {
        "name": "Programmation Objet (Java)",
        "ue": "UE 3.4 - Spécialité",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 25, "EMS_FI": 0, "EMS_FA": 0}
    },
    "Automatisation du traitement des données dans un tableur": {
        "name": "VBA Excel (Automatisation)",
        "ue": "UE 3.4 - Spécialité",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 25, "EMS_FI": 0, "EMS_FA": 0}
    },
    "Collecte automatisée de données web": {
        "name": "SAÉ Webscrapping (Collecte Web)",
        "ue": "UE 3.1 - Décisionnel",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 19, "EMS_FI": 0, "EMS_FA": 0}
    },
    "Intégration de données dans un Datawarehouse": {
        "name": "SAÉ Talend (Datawarehouse)",
        "ue": "UE 3.1 - Décisionnel",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 19, "EMS_FI": 0, "EMS_FA": 0}
    },
    "Conformité réglementaire": {
        "name": "SAÉ Conformité RGPD",
        "ue": "UE 3.3 - Pro & Com",
        "coefs": {"VCOD_FI": 15, "VCOD_FA": 15, "EMS_FI": 15, "EMS_FA": 15}
    },

    # --- SPÉCIFIQUE EMS (S3) ---
    "Techniques de sondage": {
        "name": "Sondages & Enquêtes",
        "ue": "UE 3.4 - Spécialité",
        "coefs": {"VCOD_FI": 0, "VCOD_FA": 0, "EMS_FI": 30, "EMS_FA": 40}
    },
    "Recueil et analyse de données": {
        "name": "SAÉ Plans d'Expérience",
        "ue": "UE 3.4 - Spécialité",
        "coefs": {"VCOD_FI": 0, "VCOD_FA": 0, "EMS_FI": 50, "EMS_FA": 50}
    },
    "EMS - AL -  Programmation objet": {
        "name": "Prog Objet (EMS)",
        "ue": "UE 3.1 - Décisionnel",
        "coefs": {"VCOD_FI": 0, "VCOD_FA": 0, "EMS_FI": 10, "EMS_FA": 0}
    },

    # --- SEMESTRE 4 (Mixte) ---
    "Automatisation et test": {
        "name": "Automatisation & Tests",
        "ue": "UE 4.1 - Décisionnel",
        "coefs": {"VCOD_FI": 25, "VCOD_FA": 20, "EMS_FI": 25, "EMS_FA": 25}
    },
    "Système d'information géographique": {
        "name": "SIG (QGIS)",
        "ue": "UE 4.1 - Décisionnel",
        "coefs": {"VCOD_FI": 15, "VCOD_FA": 15, "EMS_FI": 15, "EMS_FA": 20}
    },
    "Méthodes factorielles": {
        "name": "Méthodes Factorielles",
        "ue": "UE 4.2 - Statistique",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 25, "EMS_FI": 10, "EMS_FA": 15}
    },
    "Classification automatique": {
        "name": "Classification Automatique",
        "ue": "UE 4.2 - Statistique",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 20, "EMS_FI": 10, "EMS_FA": 10}
    },
    "Modèle linéaire": {
        "name": "Modèle Linéaire",
        "ue": "UE 4.2 - Statistique",
        "coefs": {"VCOD_FI": 0, "VCOD_FA": 0, "EMS_FI": 35, "EMS_FA": 50}
    },
    "Préparation/Intégration de données": {
        "name": "VCOD - Intégration Données",
        "ue": "UE 4.4 - Technique",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 25, "EMS_FI": 0, "EMS_FA": 0}
    },
    "Programmation web": { # Attention homonyme avec S3, souvent distingué par context ou nom complet
        "name": "VCOD - Prog Web Avancée",
        "ue": "UE 4.4 - Technique",
        "coefs": {"VCOD_FI": 20, "VCOD_FA": 25, "EMS_FI": 0, "EMS_FA": 0}
    },
    
    # --- STAGE / ALTERNANCE ---
    "Stage": {
        "name": "Stage en Entreprise",
        "ue": "UE 3.3 - Pro & Com", # Souvent rattaché à UE 3 ou UE 4
        "coefs": {"VCOD_FI": 50, "VCOD_FA": 0, "EMS_FI": 50, "EMS_FA": 0} 
    },
    "Alternance": {
        "name": "Mission Alternance",
        "ue": "UE 3.3 - Pro & Com",
        "coefs": {"VCOD_FI": 0, "VCOD_FA": 80, "EMS_FI": 0, "EMS_FA": 80} # Gros coef pour l'alternance
    },
    "Portfolio": {
        "name": "Portfolio",
        "ue": "UE 3.3 - Pro & Com",
        "coefs": {"VCOD_FI": 5, "VCOD_FA": 5, "EMS_FI": 5, "EMS_FA": 5}
    }
}

ORDERED_UES = [
    "UE 3.1 - Décisionnel",
    "UE 3.2 - Statistique",
    "UE 3.3 - Pro & Com",
    "UE 3.4 - Spécialité",
    "UE 4.1 - Décisionnel",
    "UE 4.2 - Statistique",
    "UE 4.3 - Pro & Com",
    "UE 4.4 - Technique"
]
