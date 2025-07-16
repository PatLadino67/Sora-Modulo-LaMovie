if (typeof window.laMovieModuleLoaded === 'undefined') {
    window.laMovieModuleLoaded = true;

// Funciones para el módulo LaMovie

async function searchResults(keyword) {
    try {
        // Usar la API correcta según la configuración del sitio
        const searchUrl = Sora.module.searchBaseUrl.replace('%s', encodeURIComponent(keyword));
        const response = await window.fetch(searchUrl);
        
        // Verificar si la respuesta es válida
        if (!response.ok) {
            console.log(`Error HTTP: ${response.status}`);
            return [];
        }
        
        const text = await response.text();
        if (!text.trim()) {
            console.log('Respuesta vacía del servidor');
            return [];
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.log('Error al parsear JSON:', parseError);
            return [];
        }

        // Verificar si data es un array
        if (!Array.isArray(data)) {
            console.log('La respuesta no es un array:', data);
            return [];
        }

        const transformedResults = data.map(item => ({
            title: item.title || item.post_title || 'Título no disponible',
            image: item.poster || item.thumbnail || '',
            href: item.permalink || item.url || ''
        }));
        
        return transformedResults;
        
    } catch (error) {
        console.log('Error en la búsqueda:', error);
        return [];
    }
}

async function extractDetails(url) {
    try {
        // Extraemos el tipo y el slug de la URL. Ej: "https://la.movie/peliculas/superman/" -> type: peliculas, slug: superman
        const urlParts = url.match(/la\.movie\/([^\/]+)\/([^\/]+)/);
        if (!urlParts) throw new Error("URL no válida");

        const type = urlParts[1];
        const slug = urlParts[2];

        // Usar la API correcta
        const detailsUrl = `https://api.lamovie.app/wp-json/wpf/v1/view?slug=${slug}&type=${type.slice(0, -1)}`; // 'peliculas' -> 'pelicula'
        const response = await window.fetch(detailsUrl);
        
        if (!response.ok) {
            console.log(`Error HTTP en detalles: ${response.status}`);
            return [{}];
        }
        
        const text = await response.text();
        if (!text.trim()) {
            console.log('Respuesta vacía en detalles');
            return [{}];
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.log('Error al parsear JSON en detalles:', parseError);
            return [{}];
        }

        const details = data.post || {};
        const meta = data.meta || {};

        const transformedDetails = [{
            description: details.post_content || meta.overview || 'No hay descripción disponible.',
            aliases: meta.original_title || details.original_title || '',
            airdate: meta.air_date || meta.release_date || ''
        }];

        return transformedDetails;

    } catch (error) {
        console.log('Error al extraer detalles:', error);
        return [{}];
    }
}

async function extractEpisodes(url) {
    try {
        const urlParts = url.match(/la\.movie\/([^\/]+)\/([^\/]+)/);
        if (!urlParts) throw new Error("URL no válida");

        const type = urlParts[1];
        const slug = urlParts[2];

        // Si es una película, solo hay un "episodio" que es la propia película.
        if (type === 'peliculas') {
            return [{
                href: url,
                number: "1" // Representa la película
            }];
        }

        // Para series y animes, obtenemos los episodios de la API.
        const detailsUrl = `https://api.lamovie.app/wp-json/wpf/v1/view?slug=${slug}&type=${type.slice(0, -1)}`;
        const response = await window.fetch(detailsUrl);
        
        if (!response.ok) {
            console.log(`Error HTTP en episodios: ${response.status}`);
            return [];
        }
        
        const text = await response.text();
        if (!text.trim()) {
            console.log('Respuesta vacía en episodios');
            return [];
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseError) {
            console.log('Error al parsear JSON en episodios:', parseError);
            return [];
        }

        if (!data.seasons || data.seasons.length === 0) {
            return [];
        }

        let allEpisodes = [];
        data.seasons.forEach(season => {
            if (season.episodes && Array.isArray(season.episodes)) {
                season.episodes.forEach(episode => {
                    allEpisodes.push({
                        href: episode.permalink || episode.url || '',
                        number: episode.post_name ? episode.post_name.replace('episodio-', '') : episode.episode_number || '1'
                    });
                });
            }
        });

        return allEpisodes;

    } catch (error) {
        console.log('Error al extraer episodios:', error);
        return [];
    }
}

async function extractStreamUrl(url) {
    try {
        const urlParts = url.match(/la\.movie\/([^\/]+)\/([^\/]+)/);
        if (!urlParts) throw new Error("URL no válida: " + url);

        let type = urlParts[1];
        const slug = urlParts[2];

        // Ajustar el tipo para la API
        if (type !== 'episodio') {
            type = type.slice(0, -1);
        }

        // 1. Obtener el ID del post usando la API correcta
        const viewUrl = `https://api.lamovie.app/wp-json/wpf/v1/view?slug=${slug}&type=${type}`;
        const viewResponse = await window.fetch(viewUrl);
        
        if (!viewResponse.ok) {
            console.log(`Error HTTP en stream view: ${viewResponse.status}`);
            return null;
        }
        
        const viewText = await viewResponse.text();
        if (!viewText.trim()) {
            console.log('Respuesta vacía en stream view');
            return null;
        }
        
        let viewData;
        try {
            viewData = JSON.parse(viewText);
        } catch (parseError) {
            console.log('Error al parsear JSON en stream view:', parseError);
            return null;
        }
        
        const postId = viewData.post?.ID;
        if (!postId) {
            console.log('No se encontró ID del post');
            return null;
        }

        // 2. Obtener el enlace del reproductor usando la API correcta
        const playerUrl = `https://api.lamovie.app/wp-json/wpf/v1/player?post_id=${postId}`;
        const playerResponse = await window.fetch(playerUrl);
        
        if (!playerResponse.ok) {
            console.log(`Error HTTP en player: ${playerResponse.status}`);
            return null;
        }
        
        const playerText = await playerResponse.text();
        if (!playerText.trim()) {
            console.log('Respuesta vacía en player');
            return null;
        }
        
        let playerData;
        try {
            playerData = JSON.parse(playerText);
        } catch (parseError) {
            console.log('Error al parsear JSON en player:', parseError);
            return null;
        }
        
        // Tomamos la primera opción de idioma (ej. Latino)
        const embedUrl = playerData[0]?.url;
        if (!embedUrl) {
            console.log('No se encontró URL del embed');
            return null;
        }

        // 3. Obtener el HTML del reproductor
        const embedResponse = await window.fetch(embedUrl);
        if (!embedResponse.ok) {
            console.log(`Error HTTP en embed: ${embedResponse.status}`);
            return null;
        }
        
        const embedHtml = await embedResponse.text();

        // 4. Desofuscar el script para encontrar el enlace del stream
        const obfuscatedScriptMatch = embedHtml.match(/eval\(function\(p,a,c,k,e,d\){.*?}\(.*?split\('\|'\)\)\)/);
        if (!obfuscatedScriptMatch) {
            console.log('No se encontró script ofuscado');
            return null;
        }

        const unpackedScript = unpack(obfuscatedScriptMatch[0]);
        
        const streamUrlMatch = unpackedScript.match(/file:"(.*?m3u8.*?)"/);
        return streamUrlMatch ? streamUrlMatch[1] : null;

    } catch (error) {
        console.log('Error al extraer la URL del stream:', error);
        return null;
    }
}

/*
 * DEOBFUSCATOR CODE
 * (Copiado de la documentación de Sora)
 */
class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
        };
        this.dictionary = {};
        this.base = base;
        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] ||
                this.ALPHABET[62].substr(0, base);
        }
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        }
        else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            }
            catch (er) {
                throw Error("Unsupported base encoding.");
            }
            this.unbase = this._dictunbaser;
        }
    }
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((cipher, index) => {
            ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
        });
        return ret;
    }
}

function unpack(source) {
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
        unbase = new Unbaser(radix);
    }
    catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    function lookup(match) {
        const word = match;
        let word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        }
        else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);
    function _filterargs(source) {
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                let a = args;
                if (a[2] == "[]") {
                }
                try {
                    return {
                        payload: a[1],
                        symtab: a[4].split("|"),
                        radix: parseInt(a[2]),
                        count: parseInt(a[3]),
                    };
                }
                catch (ValueError) {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }
    function _replacestrings(source) {
        return source;
    }
}
// Fin del código de deobfuscación

    // Export functions to window for Sora compatibility
    window.searchResults = searchResults;
    window.extractDetails = extractDetails;
    window.extractEpisodes = extractEpisodes;
    window.extractStreamUrl = extractStreamUrl;
}
