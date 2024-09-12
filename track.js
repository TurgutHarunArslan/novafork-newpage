import { displaySelectedMedia, } from "./media/mediaplayer/mediaplayer.js";
let API_KEY
let videoPlayerContainer 
let videoPlayer
function handleError(message, error, showAlert = false) {
    console.error(message, error);
    if (showAlert) {
        alert(message);
    }
}

async function getApiKey() {
    try {
        const response = await fetch('apis/config.json');
        if (!response.ok) {
            throw new Error('Failed to load API key config.');
        }
        const config = await response.json();
        return config.apiKey;
    } catch (error) {
        handleError('Failed to fetch API key.', error);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    const params = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });
    let TrackId = params.Id || ''
    let TrackType = params.Type || ''
    if  ( TrackId == '' || TrackType == '' ) {
        handleError("Track Not Found","No tracks",true)
    }
    API_KEY =  await getApiKey();

    videoPlayerContainer = document.getElementById('videoPlayer');
    videoPlayer = document.getElementById('videoPlayer');

    if (!API_KEY) return;
    fetchSelectedMedia(TrackId,TrackType)
})

async function fetchMediaTrailer(mediaId, mediaType) {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}/videos?api_key=${API_KEY}`);
        if (response.ok) {
            const data = await response.json();
            const trailer = data.results.find(video => video.type === 'Trailer' && video.site === 'YouTube');
            if (trailer) {
                videoPlayer.src = `https://www.youtube.com/embed/${trailer.key}`;
            } else {
                videoPlayer.src = '';
                videoPlayerContainer.classList.add('hidden');
            }
        } else {
            handleError('Failed to fetch media trailer.', new Error('API response not OK'));
            videoPlayerContainer.classList.add('hidden');
        }
    } catch (error) {
        handleError('An error occurred while fetching media trailer.', error);
        videoPlayerContainer.classList.add('hidden');
    }
}

async function fetchSelectedMedia(mediaId, mediaType) {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}?api_key=${API_KEY}`);
        if (response.ok) {
            const media = await response.json();

            const releaseType = await getReleaseType(mediaId, mediaType);

            displaySelectedMedia(media, mediaType, releaseType);
            await fetchMediaTrailer(mediaId, mediaType)
            videoPlayerContainer.classList.remove('hidden');
        } else {
            handleError('Failed to fetch media details.', new Error('API response not OK'));
            window.location.replace(window.location.origin)
            videoPlayerContainer.classList.add('hidden');
        }
    } catch (error) {
        handleError('An error occurred while fetching media details.', error);
        videoPlayerContainer.classList.add('hidden');
    }
}

async function getReleaseType(mediaId, mediaType) {
    try {
        const [releaseDatesResponse, watchProvidersResponse] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}/release_dates?api_key=${API_KEY}`),
            fetch(`https://api.themoviedb.org/3/${mediaType}/${mediaId}/watch/providers?api_key=${API_KEY}`)
        ]);

        if (releaseDatesResponse.ok && watchProvidersResponse.ok) {
            const releaseDatesData = await releaseDatesResponse.json();
            const watchProvidersData = await watchProvidersResponse.json();

            const releases = releaseDatesData.results.flatMap(result => result.release_dates);
            const currentDate = new Date();

            const isDigitalRelease = releases.some(release =>
                (release.type === 4 || release.type === 6) && new Date(release.release_date) <= currentDate
            );

            const isInTheaters = mediaType === 'movie' && releases.some(release =>
                release.type === 3 && new Date(release.release_date) <= currentDate
            );

            const hasFutureRelease = releases.some(release =>
                new Date(release.release_date) > currentDate
            );

            const streamingProviders = watchProvidersData.results?.US?.flatrate || [];
            const isStreamingAvailable = streamingProviders.length > 0;

            if (isStreamingAvailable) {
                return "Streaming (HD)";
            } else if (isDigitalRelease) {
                return "HD";
            } else if (isInTheaters && mediaType === 'movie') {
                const theatricalRelease = releases.find(release => release.type === 3);
                if (theatricalRelease && new Date(theatricalRelease.release_date) <= currentDate) {
                    const releaseDate = new Date(theatricalRelease.release_date);
                    const oneYearLater = new Date(releaseDate);
                    oneYearLater.setFullYear(releaseDate.getFullYear() + 1);

                    if (currentDate >= oneYearLater) {
                        return "HD";
                    } else {
                        return "Cam Quality";
                    }
                }
            } else if (hasFutureRelease) {
                return "Not Released Yet";
            }

            return "Unknown Quality";
        } else {
            handleError('Failed to fetch release type or watch providers.', new Error('API response not OK'));
            return "Unknown Quality";
        }
    } catch (error) {
        handleError('An error occurred while fetching release type.', error);
        return "Unknown Quality";
    }
}