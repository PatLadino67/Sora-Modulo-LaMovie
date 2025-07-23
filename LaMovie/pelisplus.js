///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Main Functions          //////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

async function searchResults(keyword) {
    try {
        const slug = keyword.trim().replace(/\s+/g, "+");
        const response = await soraFetch(`https://pelisplushd.lat/search?s=${slug}`);
        const html = await response.text();

        const regex = /<article class="item".*?<a href="([^"]+)".*?<img src="([^"]+)".*?<h3>([^<]+)<\/h3>/g;
        const results = [];
        let match;

        while ((match = regex.exec(html)) !== null) {
            results.push({
                href: match[1],
                image: match[2],
                title: match[3].trim()
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.log('Search error:', error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const descriptionMatch = html.match(/<div class="sinopsis"[^>]*>([\s\S]*?)<\/div>/);
        const description = descriptionMatch ? decodeHtmlEntities(descriptionMatch[1].trim().replace(/<[^>]*>/g, '')) : 'No description available';

        const airdateMatch = html.match(/<strong>Fecha:<\/strong> ([\d-]+)/);
        const airdate = airdateMatch ? `Aired: ${airdateMatch[1]}` : 'Aired: Unknown';

        const genreMatch = html.match(/<strong>Género:<\/strong> ([\s\S]*?)<\/p>/);
        const genres = genreMatch ? [...genreMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(g => g[1]).join(', ') : 'Unknown';

        const castMatch = html.match(/<strong>Actores:<\/strong> ([\s\S]*?)<\/p>/);
        const casts = castMatch ? [...castMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)].map(c => c[1]).join(', ') : 'Unknown';

        const aliases = `Genres: ${genres}\nCasts: ${casts}`;

        return JSON.stringify([{
            description,
            aliases,
            airdate
        }]);
    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{ description: 'Error loading details', aliases: '', airdate: '' }]);
    }
}

async function extractEpisodes(url) {
    try {
        if (url.includes("/pelicula/")) {
            return JSON.stringify([{ href: url, number: 1 }]);
        }

        const response = await soraFetch(url);
        const html = await response.text();
        const episodes = [];

        const seasonRegex = /<div class="title-seasons">Temporada (\d+)<\/div>[\s\S]*?<ul class="episodes">([\s\S]*?)<\/ul>/g;
        let seasonMatch;
        while ((seasonMatch = seasonRegex.exec(html)) !== null) {
            const seasonNum = seasonMatch[1];
            const episodesHtml = seasonMatch[2];
            const episodeRegex = /<a href="([^"]+)">(\d+)<\/a>/g;
            let episodeMatch;
            while ((episodeMatch = episodeRegex.exec(episodesHtml)) !== null) {
                episodes.push({
                    href: episodeMatch[1],
                    number: parseInt(episodeMatch[2], 10)
                });
            }
        }
        return JSON.stringify(episodes);
    } catch (error) {
        console.log('Episodes error:', error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();

        const iframeSrcMatch = html.match(/<iframe.*?src="([^"]*?\/stream\/[^\/]+\/[^"]+)"/);
        if (!iframeSrcMatch) throw new Error("Iframe not found");

        const iframeUrl = iframeSrcMatch[1];
        const iframeResponse = await soraFetch(iframeUrl, { headers: { 'Referer': url } });
        const iframeHtml = await iframeResponse.text();

        const scriptMatch = iframeHtml.match(/<script>([\s\S]*?player\(.*?)<\/script>/);
        if (!scriptMatch) throw new Error("Script with sources not found");

        const scriptContent = scriptMatch[1];
        const sourcesMatch = scriptContent.match(/sources\s*=\s*(\[[\s\S]*?\]);/);
        if (!sourcesMatch) throw new Error("Sources array not found in script");

        const sourcesRaw = sourcesMatch[1];
        const sources = JSON.parse(sourcesRaw.replace(/'/g, '"'));

        const stream = sources.find(s => s.type === "hls" || s.type === "mp4");
        if (!stream) throw new Error("No HLS or MP4 stream found");

        const subtitlesMatch = scriptContent.match(/tracks\s*=\s*(\[[\s\S]*?\]);/);
        let subtitles = "";
        if (subtitlesMatch) {
            const subtitlesRaw = subtitlesMatch[1];
            const subs = JSON.parse(subtitlesRaw.replace(/'/g, '"'));
            const spanishSub = subs.find(s => s.label && s.label.toLowerCase().includes("español"));
            if (spanishSub) {
                subtitles = spanishSub.file;
            }
        }

        const final = {
            streams: [stream.file],
            subtitles: subtitles
        };

        return JSON.stringify(final);
    } catch (error) {
        console.log("Error in extractStreamUrl: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}

function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            return null;
        }
    }
}
