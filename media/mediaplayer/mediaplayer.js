let selectedProvider = 'vidlink';

async function getApiKey() {
    try {
        const response = await fetch('apis/config.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const config = await response.json();
        return config.apiKey;
    } catch (error) {
        console.error('Failed to fetch API key:', error);
        return null;
    }
}

async function fetchJson(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch (error) {
        console.error(`Failed to fetch data from ${url}:`, error);
        throw error;
    }
}

async function fetchMediaData(mediaId, mediaType, apiKey) {
    const url = `https://api.themoviedb.org/3/${mediaType}/${mediaId}?api_key=${apiKey}`;
    return fetchJson(url);
}

async function fetchCastData(mediaId, mediaType, apiKey) {
    const url = `https://api.themoviedb.org/3/${mediaType}/${mediaId}/credits?api_key=${apiKey}`;
    return fetchJson(url);
}

async function fetchTrailer(mediaId, mediaType, apiKey) {
    const url = `https://api.themoviedb.org/3/${mediaType}/${mediaId}/videos?api_key=${apiKey}`;
    const data = await fetchJson(url);
    const trailer = data.results.find(video => video.type === 'Trailer' && video.site === 'YouTube');
    return trailer ? `https://www.youtube.com/embed/${trailer.key}` : null;
}

export async function displaySelectedMedia(media, mediaType) {
    const selectedMovie = document.getElementById('selectedMovie');
    const apiKey = await getApiKey();

    if (!apiKey) {
        console.error('API key is not available.');
        return;
    }

    const mediaDataPromise = fetchMediaData(media.id, mediaType, apiKey);
    const castDataPromise = fetchCastData(media.id, mediaType, apiKey);

    try {
        const [mediaData, castData] = await Promise.all([mediaDataPromise, castDataPromise]);

        const genres = mediaData.genres ? mediaData.genres.map(genre => genre.name).join(', ') : 'Unknown Genre';
        const runtime = mediaType === 'tv'
            ? `${mediaData.episode_run_time ? mediaData.episode_run_time[0] : 'N/A'} min per episode`
            : `${mediaData.runtime || 'N/A'} min`;
        const language = mediaData.original_language ? mediaData.original_language.toUpperCase() : 'Unknown';

        const voteAverage = mediaData.vote_average || 0;
        const popularityScore = mediaData.popularity || 0;
        const stars = Math.round(voteAverage / 2);

        // Ratings and popularity
        const ratings = `
            <div class="flex items-center space-x-1 mb-2">
                <span class="text-yellow-400">${'★'.repeat(stars)}</span>
                <span class="text-gray-300">${'★'.repeat(5 - stars)}</span>
                <span class="ml-2 text-sm text-gray-300">${voteAverage.toFixed(1)}/10</span>
            </div>
        `;
        const popularity = `
            <div class="text-sm text-gray-300 mb-4">Popularity: <span class="font-semibold">${popularityScore.toFixed(1)}</span></div>
        `;

        // Full cast list
        const castList = castData.cast.map(actor => `
            <div class="flex-shrink-0 w-32 mx-2">
                <img src="https://image.tmdb.org/t/p/w500${actor.profile_path}" alt="${actor.name}" class="w-full h-32 rounded-full object-cover shadow-md">
                <div class="mt-2 text-center">
                    <p class="text-white font-semibold">${actor.name}</p>
                    <p class="text-gray-400 text-sm">${actor.character}</p>
                </div>
            </div>
        `).join('');

        // Cast List Section
        const castListSection = `
            <div class="mt-4">
                <div id="castListContainer" class="flex overflow-x-scroll space-x-4">
                    ${castList}
                </div>
            </div>
        `;

        const seasonSection = mediaType === 'tv' ? `
    <div class="mt-4">
        <label for="seasonSelect" class="block text-xs font-medium text-gray-300">Select Season:</label>
        <select id="seasonSelect" class="dropdown mt-1 block w-full bg-gray-800 text-white rounded border border-gray-700 text-sm">
            ${mediaData.seasons.filter(season => season.season_number !== 0).map(season => {
            const seasonName = season.name ? season.name : `Season ${season.season_number}`;
            return `<option value="${season.season_number}">${seasonName}</option>`;
        }).join('')}
        </select>

        <label for="episodeSelect" class="block text-xs font-medium text-gray-300 mt-2">Select Episode:</label>
        <select id="episodeSelect" class="dropdown mt-1 block w-full bg-gray-800 text-white rounded border border-gray-700 text-sm"></select>
    </div>
` : '';

        const templateResponse = await fetch('media/mediaTemplate.html');
        if (!templateResponse.ok) throw new Error('Network response was not ok');
        const template = await templateResponse.text();

        const populatedHTML = template
            .replace(/{{poster_path}}/g, `https://image.tmdb.org/t/p/w500${media.poster_path}`)
            .replace(/{{title_or_name}}/g, media.title || media.name)
            .replace(/{{release_date_or_first_air_date}}/g, media.release_date || media.first_air_date)
            .replace(/{{overview}}/g, media.overview || 'No overview available.')
            .replace(/{{type}}/g, mediaType === 'movie' ? 'Movie' : 'TV Show')
            .replace(/{{ratings}}/g, ratings)
            .replace(/{{popularity}}/g, popularity)
            .replace(/{{season_section}}/g, seasonSection)
            .replace(/{{genres}}/g, `Genres: ${genres}`)
            .replace(/{{runtime}}/g, `Runtime: ${runtime}`)
            .replace(/{{language}}/g, `Language: ${language}`)
            .replace(/{{cast_list}}/g, castListSection)

        selectedMovie.innerHTML = populatedHTML;
        const parentContainer = document.getElementById('videoPlayer'); // Replace with the actual parent container ID
        if (parentContainer) {
            selectedMovie.scrollIntoView({ behavior: 'smooth', block: 'start' });

            const offset = 300;
            parentContainer.scrollBy({
                top: -offset,
                behavior: 'smooth'
            });
        }

        const playButton = document.getElementById('playButton');
        const videoPlayer = selectedMovie.querySelector('#videoPlayer');
        const movieInfo = selectedMovie.querySelector('#movieInfo');
        const languageSelect = document.getElementById('languageSelect');
        const providerSelect = document.getElementById('providerSelect');
        const seasonSelect = document.getElementById('seasonSelect');
        const episodeSelect = document.getElementById('episodeSelect');

        // Set the provider select element to the stored value
        if (providerSelect) {
            providerSelect.value = selectedProvider;
        }

        async function updateVideo() {
            if (!videoPlayer || !movieInfo) {
                console.error("Error: videoPlayer or movieInfo elements not found.");
                return;
            }

            let endpoint;
            const selectedLanguage = languageSelect ? languageSelect.value : '';
            const provider = providerSelect ? providerSelect.value : selectedProvider; // Use stored provider if dropdown is not present

            if (mediaType === 'tv') {
                const seasonNumber = seasonSelect ? seasonSelect.value : '';
                const episodeNumber = episodeSelect ? episodeSelect.value : '';

                if (!seasonNumber || !episodeNumber) {
                    console.error("Error: Season number or episode number not selected.");
                    return;
                }

                endpoint = await getTvEmbedUrl(media.id, seasonNumber, episodeNumber, provider, apiKey);
            } else {
                endpoint = await getMovieEmbedUrl(media.id, provider, apiKey);
            }

            videoPlayer.innerHTML = `<iframe src="${endpoint}" class="w-full" style="height: ${document.getElementById('poster').offsetHeight * 1.3}px;" allowfullscreen></iframe>`;

            videoPlayer.classList.remove('hidden');
            movieInfo.classList.add('hidden');
        }

        async function getTvEmbedUrl(mediaId, seasonId, episodeId, provider, apiKey) {
            const primaryColor = '8A2BE2';
            const secondaryColor = 'D8BFD8';
            const iconColor = '4B0082';

            switch (provider) {
                case 'vidsrc':
                    return `https://vidsrc.cc/v2/embed/tv/${mediaId}/${seasonId}/${episodeId}`;
                case 'vidsrcpro':
                    return `https://vidsrc.pro/embed/tv/${mediaId}/${seasonId}/${episodeId}`;
                case 'vidsrc2':
                    return `https://vidsrc2.to/embed/tv/${mediaId}?season=${seasonId}&episode=${episodeId}`;
                case 'vidsrcxyz':
                    return `https://vidsrc.xyz/embed/tv/${mediaId}?season=${seasonId}&episode=${episodeId}`;
                case 'embedsoap':
                    return `https://www.embedsoap.com/embed/tv/?id=${mediaId}&s=${seasonId}&e=${episodeId}`;
                case 'autoembed':
                    return `https://player.autoembed.cc/embed/tv/${mediaId}/${seasonId}/${episodeId}`;
                case 'smashystream':
                    return `https://player.smashy.stream/tv/${mediaId}?s=${seasonId}&e=${episodeId}`;
                case 'anime':
                    return `https://anime.autoembed.cc/embed/${media.name.replace(/\s+/g, '-').toLowerCase()}-episode-${episodeId}`;
                case 'nontonGo':
                    return `https://www.NontonGo.win/embed/tv/${mediaId}/${seasonId}/${episodeId}`;
                case 'nontonGoAlt':
                    return `https://www.NontonGo.win/embed/tv/?id=${mediaId}&s=${seasonId}&e=${episodeId}`;
                case '2animesub':
                    return `https://2anime.xyz/embed/${media.name.replace(/\s+/g, '-').toLowerCase()}-episode-${episodeId}`;
                case '2embed':
                    return `https://www.2embed.skin/embedtv/${mediaId}&s=${seasonId}&e=${episodeId}`;
                case 'AdminHiHi':
                    const tvSlug = media.name.replace(/\s+/g, '-');
                    return `https://embed.anicdn.top/v/${tvSlug}-dub/${episodeId}.html`;
                case 'trailer':
                    return await fetchTrailer(mediaId, 'tv', apiKey);
                case 'moviesapi':
                    return `https://moviesapi.club/tv/${mediaId}/${seasonId}/${episodeId}`;
                case 'vidlink':
                    return `https://vidlink.pro/tv/${mediaId}/${seasonId}/${episodeId}?primaryColor=${primaryColor}&secondaryColor=${secondaryColor}&iconColor=${iconColor}&nextbutton=true`;
                case 'vidlinkdub':
                    return `https://vidlink.pro/tv/${mediaId}/${seasonId}/${episodeId}?player=jw&multiLang=true`;
                case 'vidsrcnl':
                    return `https://player.vidsrc.nl/embed/tv/${mediaId}/${seasonId}/${episodeId}`;
                case 'vidsrc.rip':
                    return `https://vidsrc.rip/embed/tv/${mediaId}/${seasonId}/${episodeId}`;
                case 'vidbinge':
                    return `https://vidbinge.dev/embed/tv/${mediaId}/${seasonId}/${episodeId}`;
                default:
                    throw new Error('Provider not recognized.');
            }
        }

        async function getMovieEmbedUrl(mediaId, provider, apiKey) {
            const primaryColor = '8A2BE2';
            const secondaryColor = 'D8BFD8';
            const iconColor = '4B0082';

            switch (provider) {
                case 'vidsrc':
                    return `https://vidsrc.cc/v2/embed/movie/${mediaId}`;
                case 'vidsrc2':
                    return `https://vidsrc2.to/embed/movie/${mediaId}`;
                case 'vidsrcxyz':
                    return `https://vidsrc.xyz/embed/movie/${mediaId}`;
                case 'embedsoap':
                    return `https://www.embedsoap.com/embed/movie/?id=${mediaId}`;
                case 'autoembed':
                    return `https://player.autoembed.cc/embed/movie/${mediaId}`;
                case 'smashystream':
                    return `https://player.smashy.stream/movie/${mediaId}`;
                case 'anime':
                    return `https://anime.autoembed.cc/embed/${media.title.replace(/\s+/g, '-').toLowerCase()}-episode-1`;
                case '2animesub':
                    return `https://2anime.xyz/embed/${media.name.replace(/\s+/g, '-')}episode-${episodeNumber}`;
                case '2embed':
                    return `https://www.2embed.cc/embed/${mediaId}`;
                case 'nontonGo':
                    return `https://www.NontonGo.win/embed/movie/${mediaId}`;
                case 'AdminHiHi':
                    const movieSlug = media.title.replace(/\s+/g, '-');
                    return `https://embed.anicdn.top/v/${movieSlug}-dub/1.html`;
                case 'vidsrcpro':
                    return `https://vidsrc.pro/embed/movie/${mediaId}`;
                case 'vidlink':
                    return `https://vidlink.pro/movie/${mediaId}?primaryColor=${primaryColor}&secondaryColor=${secondaryColor}&iconColor=${iconColor}&autoplay=true`;
                case 'vidlinkdub':
                    return `https://vidlink.pro/movie/${mediaId}?player=jw&multiLang=true&primaryColor=${primaryColor}&secondaryColor=${secondaryColor}&iconColor=${iconColor}`;
                case 'vidsrcnl':
                    return `https://player.vidsrc.nl/embed/movie/${mediaId}`;
                case 'vidsrc.rip':
                    return `https://vidsrc.rip/embed/movie/${mediaId}`;
                case 'vidbinge':
                    return `https://vidbinge.dev/embed/movie/${mediaId}`;
                case 'trailer':
                    return await fetchTrailer(mediaId, 'movie', apiKey);
                case 'moviesapi':
                    return `https://moviesapi.club/movie/${mediaId}`;
                default:
                    throw new Error('Provider not recognized.');
            }
        }

        async function updateEpisodes() {
            const seasonNumber = seasonSelect ? seasonSelect.value : '';
            if (!seasonNumber) return;

            try {
                const url = `https://api.themoviedb.org/3/tv/${media.id}/season/${seasonNumber}?api_key=${apiKey}`;
                const season = await fetchJson(url);
                episodeSelect.innerHTML = season.episodes
                    .filter(episode => episode.season_number === Number(seasonNumber))
                    .map(episode => {
                        const episodeTitle = episode.name ? `: ${episode.name}` : '';
                        return `<option value="${episode.episode_number}" data-image="https://image.tmdb.org/t/p/w500${episode.still_path}">
                    Episode ${episode.episode_number}${episodeTitle}
                </option>`;
                    }).join('');
                episodeSelect.dispatchEvent(new Event('change'));
            } catch (error) {
                console.error('Failed to fetch season details:', error);
            }
        }

        function handleSearchInput(event) {
            const query = event.target.value;
            if (query.length < 3) { // Trigger search after 3 characters
                return;
            }

            searchMedia(query).then(results => {
                const searchResultsContainer = document.getElementById('searchResults');
                if (searchResultsContainer) {
                    searchResultsContainer.innerHTML = results.map(result =>
                        `<div class="search-result-item" data-id="${result.id}" data-type="${mediaType}">
                            <img src="https://image.tmdb.org/t/p/w500${result.poster_path}" alt="${result.title || result.name}" class="w-24 h-36 object-cover">
                            <p class="text-white">${result.title || result.name}</p>
                        </div>`
                    ).join('');
                }
            });
        }

        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearchInput);
        }

        if (playButton) {
            playButton.addEventListener('click', updateVideo);
        }

        if (languageSelect) {
            languageSelect.addEventListener('change', () => {
                if (providerSelect) {
                    providerSelect.classList.toggle('hidden', languageSelect.value === 'fr');
                }
                updateVideo();
            });
        }

        if (providerSelect) {
            providerSelect.addEventListener('change', () => {
                selectedProvider = providerSelect.value; // Store the selected provider
                updateVideo();
            });
        }

        if (mediaType === 'tv') {
            if (seasonSelect) {
                seasonSelect.addEventListener('change', async () => {
                    await updateEpisodes();
                    await updateVideo();
                });

                await updateEpisodes();
            }

            if (episodeSelect) {
                episodeSelect.addEventListener('change', async () => {
                    await updateVideo();
                });
            }
        }
    } catch (error) {
        console.error('Failed to display selected media:', error);
    }
}
