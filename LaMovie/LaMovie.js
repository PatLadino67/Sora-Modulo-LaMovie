// Funciones para el módulo LaMovie

async function searchResults(keyword) {
    try {
        const searchUrl = `https://la.movie/wp-api/v1/search?keyword=${encodeURIComponent(keyword)}`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        const transformedResults = data.map(item => ({
            title: item.title,
            image: item.poster,
            href: item.permalink
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

        const detailsUrl = `https://la.movie/wp-api/v1/view?slug=${slug}&type=${type.slice(0, -1)}`; // 'peliculas' -> 'pelicula'
        const response = await fetch(detailsUrl);
        const data = await response.json();

        const details = data.post;
        const meta = data.meta;

        const transformedDetails = [{
            description: details.post_content || 'No hay descripción disponible.',
            aliases: meta.original_title || '',
            airdate: meta.air_date || ''
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
        const detailsUrl = `https://la.movie/wp-api/v1/view?slug=${slug}&type=${type.slice(0, -1)}`;
        const response = await fetch(detailsUrl);
        const data = await response.json();

        if (!data.seasons || data.seasons.length === 0) {
            return [];
        }

        let allEpisodes = [];
        data.seasons.forEach(season => {
            season.episodes.forEach(episode => {
                allEpisodes.push({
                    href: episode.permalink,
                    number: episode.post_name.replace('episodio-', '') // Extrae el número del episodio
                });
            });
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

        // 1. Obtener el ID del post
        const viewUrl = `https://la.movie/wp-api/v1/view?slug=${slug}&type=${type}`;
        const viewResponse = await fetch(viewUrl);
        const viewData = await viewResponse.json();
        const postId = viewData.post.ID;

        // 2. Obtener el enlace del reproductor
        const playerUrl = `https://la.movie/wp-api/v1/player?post_id=${postId}`;
        const playerResponse = await fetch(playerUrl);
        const playerData = await playerResponse.json();
        
        // Tomamos la primera opción de idioma (ej. Latino)
        const embedUrl = playerData[0].url;
        if (!embedUrl) return null;

        // 3. Obtener el HTML del reproductor
        const embedResponse = await fetch(embedUrl);
        const embedHtml = await embedResponse.text();

        // 4. Desofuscar el script para encontrar el enlace del stream
        const obfuscatedScriptMatch = embedHtml.match(/eval\(function\(p,a,c,k,e,d\){.*?}\(.*?split\('\|'\)\)\)/);
        if (!obfuscatedScriptMatch) return null;

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
