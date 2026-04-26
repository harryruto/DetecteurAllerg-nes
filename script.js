// Liste des allergènes communs
const ALLERGENS = [
    'arachide', 'cacahuète', 'cacahuètes',
    'noix', 'amande', 'noisette', 'pistache', 'fruits à coque', 'noix de cajou',
    'lait', 'lactose', 'fromage', 'beurre', 'crème',
    'oeuf', 'œuf', 'oeufs', 'œufs',
    'crustacé', 'crevette', 'homard', 'crabe', 'calamar',
    'gluten', 'blé', 'seigle', 'orge', 'avoine',
    'soja',
    'sésame', 'graine de sésame',
    'moutarde',
    'sulfite', 'bisulfite', 'métabisulfite',
    'céleri', 'ail',
    'poisson', 'anchois',
    'mollusques', 'huître', 'moule', 'escargot'
];

// Mapping des variantes/fragments vers les allergènes canoniques
// Permet de mapper "lit" -> "lait", "œ" -> "œuf", etc.
const ALLERGEN_VARIANTS = {
    'lit': 'lait',
    'lat': 'lait',
    'lai': 'lait',
    'uf': 'œuf',
    'lact': 'lactose',
    'from': 'fromage',
    'beerre': 'beurre',
    'crèm': 'crème',
    'crém': 'crème',
    'glut': 'gluten',
    'blé': 'blé',
    'seig': 'seigle',
    'org': 'orge',
    'avoin': 'avoine',
    'soj': 'soja',
    'sesam': 'sésame',
    'sesame': 'sésame',
    'moutard': 'moutarde',
    'celeri': 'céleri',
    'crustace': 'crustacé',
    'custacés': 'crustacé',
    'poiss': 'poisson',
    'mollusk': 'mollusques',
    'mollusque': 'mollusques',
    'arach': 'arachide'
};

let video, canvas, ctx;
let cameraActive = false;

// Initialiser les éléments du DOM
document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const captureButton = document.getElementById('captureButton');
    const uploadButton = document.getElementById('uploadButton');
    const fileInput = document.getElementById('fileInput');
    
    video = document.getElementById('video');
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    startButton.addEventListener('click', toggleCamera);
    captureButton.addEventListener('click', captureImage);
    uploadButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
});

// Activer/désactiver la caméra
async function toggleCamera() {
    const startButton = document.getElementById('startButton');
    const captureButton = document.getElementById('captureButton');
    const videoContainer = document.getElementById('videoContainer');
    
    if (!cameraActive) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            video.srcObject = stream;
            videoContainer.style.display = 'block';
            captureButton.style.display = 'inline-block';
            startButton.textContent = '❌ Arrêter la caméra';
            cameraActive = true;
        } catch (error) {
            showResult('❌ Erreur : Impossible d\'accéder à la caméra', 'error');
            console.error('Erreur caméra:', error);
        }
    } else {
        const stream = video.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        videoContainer.style.display = 'none';
        captureButton.style.display = 'none';
        startButton.textContent = '📷 Démarrer la caméra';
        cameraActive = false;
        document.getElementById('result').innerHTML = '';
    }
}

// Capturer l'image depuis la caméra
async function captureImage() {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async (blob) => {
        await analyzeImage(blob);
    });
}

// Analyser l'image uploadée
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        await analyzeImage(file);
    }
}

// Fonction principale d'analyse d'image
async function analyzeImage(imageFile) {
    const loading = document.getElementById('loading');
    loading.style.display = 'block';
    document.getElementById('result').innerHTML = '';
    
    try {
        // Créer une image pour le traitement
        const img = new Image();
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            img.src = e.target.result;
            img.onload = async () => {
                await detectObjects(img);
                await extractAndAnalyzeText(img);
                loading.style.display = 'none';
            };
        };
        reader.readAsDataURL(imageFile);
    } catch (error) {
        showResult('❌ Erreur lors de l\'analyse de l\'image', 'error');
        console.error('Erreur:', error);
        loading.style.display = 'none';
    }
}

// Détecter les objets avec COCO-SSD
async function detectObjects(img) {
    try {
        const model = await cocoSsd.load();
        const predictions = await model.estimateObjects(img);
        
        if (predictions.length > 0) {
            let detectionText = '<strong>🎯 Objets détectés :</strong><br>';
            predictions.forEach(prediction => {
                detectionText += `• ${escapeHtml(prediction.class)} (confiance: ${(prediction.score * 100).toFixed(0)}%)<br>`;
            });
            showResult(detectionText, 'info');
        }
    } catch (error) {
        console.error('Erreur détection:', error);
    }
}

// Extraire le texte avec OCR (Tesseract.js)
async function extractAndAnalyzeText(img) {
    try {
        showResult('⏳ Reconnaissance de texte en cours...', 'info');
        
        // Utiliser l'image originale sans pré-traitement agressif
        const result = await Tesseract.recognize(img, 'fra', {
            logger: m => console.log('Tesseract:', m)
        });
        
        let extractedText = result.data.text;
        
        if (extractedText.trim() === '') {
            showResult('❌ Aucun texte trouvé dans l\'image', 'warning');
            return;
        }
        
        // Nettoyer le texte en profondeur
        extractedText = cleanText(extractedText);
        
        // Si le texte est encore trop garbled, essayer le pré-traitement
        if (isTextGarbled(extractedText)) {
            console.log('Texte garbled, essai avec pré-traitement...');
            const processedImg = await preprocessImage(img);
            const result2 = await Tesseract.recognize(processedImg, 'fra');
            const extractedText2 = cleanText(result2.data.text);
            
            if (!isTextGarbled(extractedText2)) {
                extractedText = extractedText2;
            }
        }
        
        // Analyser le texte pour les allergènes
        analyzeForAllergens(extractedText);
        
    } catch (error) {
        showResult('❌ Erreur lors de la reconnaissance de texte', 'error');
        console.error('Erreur OCR:', error);
    }
}

// Déterminer si le texte est trop garbled
function isTextGarbled(text) {
    // Compter les caractères spéciaux et non-imprimables
    const specialChars = (text.match(/[^a-zA-Z0-9\s\.,;:!?\-\*\(\)éèêëàâäùûüôöîïçœæ]/g) || []).length;
    const totalChars = text.length;
    
    // Si plus de 20% de caractères spéciaux, c'est garbled
    return totalChars > 0 && (specialChars / totalChars) > 0.2;
}

// Pré-traiter l'image pour améliorer l'OCR
// Pré-traiter l'image pour améliorer l'OCR (version simplifiée)
async function preprocessImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Doubler la résolution
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    
    // Dessiner l'image agrandie
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Convertir en niveaux de gris et augmenter le contraste
    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imageData.data;
    
    // Calculer les min/max de luminance pour le normalization
    let minLum = 255, maxLum = 0;
    const lums = [];
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        lums.push(lum);
        minLum = Math.min(minLum, lum);
        maxLum = Math.max(maxLum, lum);
    }
    
    const range = maxLum - minLum || 1;
    
    // Appliquer le normalization et la binarisation
    for (let i = 0; i < data.length; i += 4) {
        const lum = lums[i / 4];
        const normalized = ((lum - minLum) / range) * 255;
        
        // Binarisation simple avec seuil adaptatif
        const bw = normalized > 128 ? 255 : 0;
        
        data[i] = bw;
        data[i + 1] = bw;
        data[i + 2] = bw;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Convertir en Image
    const newImg = new Image();
    newImg.src = canvas.toDataURL();
    
    return new Promise((resolve) => {
        newImg.onload = () => resolve(newImg);
    });
}



// Fonction de nettoyage approfondie du texte OCR
function cleanText(text) {
    return text
        // Supprimer les caractères corrompus et spéciaux problématiques
        .replace(/[àâäæãåāç€ðþ¢£¥©®™№¶†‡°•‰′″‴‵∗‼⁈⁉]/g, ' ')
        .replace(/[÷×±∓∔√∛∜∝∞∟∠∡∢∣∤∥∦]/g, ' ')
        .replace(/[üûúùµ\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
        // Corriger les erreurs OCR courantes
        .replace(/kCGI|KcAl|kcAl|KCAL|kcal|hu-|1U-|keal/gi, 'kcal')
        .replace(/kJ|KJ/gi, 'kJ')
        .replace(/[Ee]neragie|[Ee]nerqie|NUTRITION/gi, 'Energie')
        .replace(/[Ii]nformations nutrit/gi, 'Informations nutritionnelles')
        .replace(/[Pp]rot[e3i1]nes/gi, 'Protéines')
        .replace(/[Gg]lucides|Glucdie/gi, 'Glucides')
        .replace(/[Ll]ip[i1]des|Matieres gras/gi, 'Lipides')
        .replace(/[Ss]ucres|sucre/gi, 'sucres')
        .replace(/acides gras/gi, 'acides gras')
        .replace(/[Ff]ibres aliment/gi, 'Fibres alimentaires')
        .replace(/[Ss]odium/gi, 'Sodium')
        // Corriger les ingrédients courants
        .replace(/[Cc]hocolat/gi, 'Chocolat')
        .replace(/cacao/gi, 'cacao')
        .replace(/beurre/gi, 'beurre')
        .replace(/lait/gi, 'lait')
        .replace(/farine/gi, 'farine')
        .replace(/blé/gi, 'blé')
        .replace(/vanille/gi, 'vanille')
        .replace(/sucre/gi, 'sucre')
        .replace(/sel/gi, 'sel')
        .replace(/soja/gi, 'soja')
        .replace(/sésame/gi, 'sésame')
        .replace(/oeuf|œuf/gi, 'œuf')
        .replace(/fr[u\|ui]ts/gi, 'fruits')
        .replace(/coque/gi, 'coque')
        .replace(/noisette/gi, 'noisette')
        .replace(/arachide/gi, 'arachide')
        .replace(/moutarde/gi, 'moutarde')
        .replace(/céleri/gi, 'céleri')
        .replace(/tomate/gi, 'tomate')
        .replace(/viande/gi, 'viande')
        // Corriger les points/virgules décimales
        .replace(/,(?=[0-9])/g, '.')
        // Supprimer les caractères non-imprimables
        .replace(/[^\x20-\x7E\xe0-\xff\n]/g, ' ')
        // Supprimer les sauts de ligne multiples
        .replace(/\n{3,}/g, '\n\n')
        // Remplacer les espaces multiples par un seul
        .replace(/[ \t]+/g, ' ')
        // Nettoyer les lignes vides
        .replace(/^\s*$/gm, '')
        // Enlever les espaces au début et fin
        .trim();
}

// Analyser le texte pour identifier les allergènes
function analyzeForAllergens(text) {
    const lowerText = text.toLowerCase();
    const foundAllergens = [];
    const foundSet = new Set(); // Pour éviter les doublons singulier/pluriel
    
    // Chercher chaque allergène avec tolérance aux erreurs
    ALLERGENS.forEach(allergen => {
        const canonicalAllergen = getCanonicalAllergen(allergen);
        
        // Sauter si on a déjà trouvé le singulier/pluriel
        if (foundSet.has(canonicalAllergen)) return;
        
        const allergenLower = allergen.toLowerCase();
        
        // Chercher le nom complet d'abord
        if (findAllergenInText(lowerText, allergenLower)) {
            foundAllergens.push(canonicalAllergen);
            foundSet.add(canonicalAllergen);
            addPluralVariant(foundSet, canonicalAllergen);
            return;
        }
        
        // Créer des variantes progressives du mot
        const variants = createVariants(allergenLower);
        
        // Chercher les variantes
        for (const variant of variants) {
            if (variant.length < 2) continue;
            
            if (findAllergenInText(lowerText, variant)) {
                // Vérifier avec matching intelligent
                if (matchAllergenInText(lowerText, allergenLower, variant)) {
                    // Obtenir l'allergène canonique
                    const matchedAllergen = ALLERGEN_VARIANTS[variant] || canonicalAllergen;
                    const canonicalMatch = getCanonicalAllergen(matchedAllergen);
                    
                    if (!foundSet.has(canonicalMatch)) {
                        foundAllergens.push(canonicalMatch);
                        foundSet.add(canonicalMatch);
                        addPluralVariant(foundSet, canonicalMatch);
                    }
                    return;
                }
            }
        }
    });
    
    // Afficher les résultats
    let resultHTML = '<h2>📄 Texte extrait :</h2>';
    const formattedText = escapeHtml(text).replace(/\n/g, '<br>');
    resultHTML += `<p style="line-height: 1.8; color: #555; font-size: 14px; white-space: pre-wrap; word-break: break-word; background-color: #f9f9f9; padding: 12px; border-radius: 6px;">${formattedText}</p>`;
    resultHTML += '<hr>';
    
    if (foundAllergens.length > 0) {
        resultHTML += `<h2>⚠️ Allergènes détectés (${foundAllergens.length}) :</h2>`;
        resultHTML += '<ul style="color: #c0392b; font-weight: bold;">';
        foundAllergens.forEach(allergen => {
            resultHTML += `<li style="font-size: 16px; margin-bottom: 5px;">${escapeHtml(allergen)}</li>`;
        });
        resultHTML += '</ul>';
        
        speakText(`Attention ! Allergènes détectés : ${foundAllergens.join(', ')}`);
    } else {
        resultHTML += '<h2>✅ Aucun allergène détecté</h2>';
        speakText('Aucun allergène détecté');
    }
    
    resultHTML += '<button onclick="speak()" style="background-color: #27ae60;">🔊 Lire le texte</button>';
    showResult(resultHTML, 'success');
    
    window.lastText = text;
}

// Obtenir l'allergène canonique (singulier)
function getCanonicalAllergen(allergen) {
    const lower = allergen.toLowerCase();
    
    // Mapping des pluriels vers singuliers
    const singularMap = {
        'cacahuètes': 'cacahuète',
        'noix': 'noix', // déjà singulier/pluriel identique
        'oeufs': 'oeuf',
        'œufs': 'œuf',
        'crustacés': 'crustacé',
        'fruits à coque': 'fruits à coque', // garder tel quel
        'bisulfites': 'bisulfite',
        'métabisulfites': 'métabisulfite',
        'sulfites': 'sulfite',
        'anchois': 'anchois', // identique
        'hutres': 'huître',
        'moules': 'moule',
        'escargots': 'escargot'
    };
    
    return singularMap[lower] || allergen;
}

// Ajouter les variantes plurielles à l'ensemble pour éviter les doublons
function addPluralVariant(foundSet, allergen) {
    const lower = allergen.toLowerCase();
    
    // Ajouter les variantes plurielles courantes
    const plurals = [
        lower + 's',
        lower + 'es',
        lower.replace('é', 'é') + 's'
    ];
    
    plurals.forEach(p => foundSet.add(p));
}

// Créer des variantes progressives
function createVariants(allergenLower) {
    const variants = [];
    
    // Chercher aussi dans les variantes mappées
    for (const [variant, canonical] of Object.entries(ALLERGEN_VARIANTS)) {
        if (canonical.includes(allergenLower) || allergenLower.includes(canonical)) {
            if (!variants.includes(variant)) variants.push(variant);
        }
    }
    
    // Pour les mots courts, garder seulement 50% minimum
    if (allergenLower.length <= 5) {
        const minLength = Math.max(2, Math.floor(allergenLower.length * 0.5));
        for (let len = allergenLower.length - 1; len >= minLength; len--) {
            const v = allergenLower.substring(0, len);
            if (!variants.includes(v)) variants.push(v);
        }
    } else {
        // Pour les mots longs, essayer 80%, 70%, 60%, 50%
        for (let percent = 0.8; percent >= 0.5; percent -= 0.1) {
            const len = Math.ceil(allergenLower.length * percent);
            const variant = allergenLower.substring(0, len);
            if (!variants.includes(variant)) {
                variants.push(variant);
            }
        }
        if (!variants.includes(allergenLower.substring(0, 3))) {
            variants.push(allergenLower.substring(0, 3));
        }
    }
    
    return variants;
}

// Chercher un allergène dans le texte avec tolérance aux caractères spéciaux
function findAllergenInText(text, allergen) {
    // Chercher avec limites de mot
    const regex = new RegExp(`\\b${allergen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[*†°]?(?:\\s|,|$|\\.|;|-)`, 'i');
    return regex.test(text);
}

// Matcher un allergène dans le texte avec tolérance avancée
function matchAllergenInText(text, fullAllergen, variant) {
    // Si on a trouvé l'allergen complet, c'est parfait
    if (text.includes(fullAllergen)) return true;
    
    // Chercher le variant dans les mots du texte
    const words = text.split(/[\s,;.\n\-\(\)]+/);
    
    for (const word of words) {
        if (word.length < 2) continue;
        
        // Si le mot commence par le variant
        if (word.startsWith(variant)) {
            // Calculer la similarité
            const similarity = calculateSimilarity(word, fullAllergen);
            // Réduire le seuil selon la longueur
            const threshold = fullAllergen.length <= 5 ? 0.4 : 0.5;
            
            if (similarity >= threshold) {
                console.log(`Match trouvé: "${word}" avec "${fullAllergen}" (similarité: ${similarity.toFixed(2)})`);
                return true;
            }
        }
        
        // Si le mot contient le variant et est de taille raisonnable
        if (word.includes(variant) && Math.abs(word.length - fullAllergen.length) <= 3) {
            const similarity = calculateSimilarity(word, fullAllergen);
            const threshold = fullAllergen.length <= 5 ? 0.35 : 0.45;
            
            if (similarity >= threshold) {
                console.log(`Match partiel trouvé: "${word}" avec "${fullAllergen}" (similarité: ${similarity.toFixed(2)})`);
                return true;
            }
        }
    }
    
    return false;
}

// Calculer la similarité entre deux mots (distance de Levenshtein normalisée)
function calculateSimilarity(word1, word2) {
    const len1 = word1.length;
    const len2 = word2.length;
    const maxLen = Math.max(len1, len2);
    
    if (maxLen === 0) return 1;
    
    const distance = levenshteinDistance(word1, word2);
    return 1 - (distance / maxLen);
}

// Calculer la distance de Levenshtein
function levenshteinDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

// Échapper les caractères HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Lire le texte à voix haute
function speakText(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
}

// Fonction globale pour lire le texte complet
function speak() {
    if (window.lastText) {
        speakText(window.lastText);
    }
}

// Afficher les résultats
function showResult(message, type = 'info') {
    const resultDiv = document.getElementById('result');
    let className = type === 'error' ? 'error' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info';
    resultDiv.innerHTML = `<div class="result-box ${className}">${message}</div>`;
}

