# Utiliser une image Python officielle légère
FROM python:3.10-slim

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier le fichier des dépendances
COPY requirements.txt .

# Installer les dépendances
# On ajoute --no-cache-dir pour garder l'image légère
RUN pip install --no-cache-dir -r requirements.txt

# Copier tout le reste du code source
COPY . .

# Créer un utilisateur non-root pour la sécurité (recommandé par Hugging Face)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Exposer le port 7860 (Port standard Hugging Face)
EXPOSE 7860

# Commande de démarrage
# On écoute sur 0.0.0.0 et le port 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
