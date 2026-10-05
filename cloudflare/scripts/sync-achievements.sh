#!/bin/sh
# Génère la version CommonJS (serveur Node) du fichier des succès.
cd "$(dirname "$0")/.."
sed -e 's/^export const ACH/const ACH/' -e 's/^export const achievements/const achievements/' -e 's/^export function statsFromInventory/function statsFromInventory/' src/achievements.js > ../wikimasters/achievements.js
echo 'module.exports = { ACH, achievements, statsFromInventory };' >> ../wikimasters/achievements.js
